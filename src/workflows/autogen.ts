import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';

export type AutoQuoteParams = {
	mode?: 'DEBUG' | 'PRODUCTION' | 'FAST';
};

export class AutoQuoteWorkflow extends WorkflowEntrypoint<Env, AutoQuoteParams> {
	async run(event: WorkflowEvent<AutoQuoteParams>, step: WorkflowStep) {
		const mode = (event.payload?.mode || (this.env.MODE as any) || 'PRODUCTION') as 'DEBUG' | 'PRODUCTION' | 'FAST';
		const generateInterval = mode === 'DEBUG' ? '1 minute' : mode === 'FAST' ? '0 second' : '1 day';
		const evaluateDelay = mode === 'DEBUG' ? '10 minutes' : mode === 'FAST' ? '5 seconds' : '2 days';

		// 1) Get top 10 quotes by score (likes - dislikes)
		const topQuotes = await step.do('top-10', async () => {
			const results = await this.env.DB.prepare(
				`
        WITH LikeCounts AS (
          SELECT quote_id, COUNT(1) AS likes
          FROM quote_interactions
          WHERE interaction_type='like'
          GROUP BY quote_id
        ),
        DislikeCounts AS (
          SELECT quote_id, COUNT(1) AS dislikes
          FROM quote_interactions
          WHERE interaction_type='dislike'
          GROUP BY quote_id
        )
        SELECT q.id, q.quote, COALESCE(l.likes,0) AS likes, COALESCE(d.dislikes,0) AS dislikes
        FROM quotes q
        LEFT JOIN LikeCounts l ON l.quote_id = q.id
        LEFT JOIN DislikeCounts d ON d.quote_id = q.id
        WHERE q.status='published'
        ORDER BY (COALESCE(l.likes,0) - COALESCE(d.dislikes,0)) DESC, q.created_at DESC
        LIMIT 10;
      `
			).all();
			return results.results as Array<{ id: string; quote: string; likes: number; dislikes: number }>;
		});

		// Helper: load canonical tags from TAGS.txt via Assets binding and create a lowercase->canonical map
		const canonicalTags = await step.do('load-canonical-tags', async () => {
			const asset = await (this.env as any).ASSETS?.unstable_getByPathname?.('/TAGS.txt');
			if (!asset) return [] as string[];
			const text = await new Response(asset.readableStream).text();
			return text
				.split('\n')
				.map((l) => l.trim())
				.filter((l) => l.length > 0)
				.map((line) => {
					const m = line.match(/^(.*?):\s*RGB\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)\s*$/);
					return m ? m[1].trim() : '';
				})
				.filter(Boolean);
		});

		const allowedList = canonicalTags.join(', ');

		// 2) Ask AI to produce a new original quote + tags inspired by top quotes (restricted to TAGS.txt)
		const { quote, tags } = await step.do('generate-quote', async () => {
			const inspirations = topQuotes.map((q) => `• ${q.quote}`).join('\n');
			const result = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
				messages: [
					{
						role: 'system',
						content: `You are an expert aphorist. Generate an original, concise, high-quality quote.\n\nTags policy:\n- Choose 1-3 tags ONLY from this allowed list (case-insensitive match to canonical names): ${allowedList}.\n- Output tags exactly as canonical names from the list.\n\nFormat strictly as:\nQUOTE: <text>\nTAGS: <tag1, tag2, tag3>`,
					},
					{ role: 'user', content: `Here are top quotes for inspiration:\n${inspirations}\n\nCreate one original quote now.` },
				],
			});
			const response = (result as any).response as string | undefined;
			if (!response) throw new Error('AI did not return content');
			const quoteMatch = response.match(/QUOTE:\s*([\s\S]*?)\n/i);
			const tagsMatch = response.match(/TAGS:\s*(.*)/i);
			let newQuote = (quoteMatch?.[1] || response).trim();
			// Sanitize: collapse whitespace and strip wrapping straight/smart quotes/backticks
			newQuote = newQuote.replace(/\s+/g, ' ').trim();
			for (let i = 0; i < 2; i++) {
				newQuote = newQuote.replace(/^[\"'`“”‘’]+/, '');
				newQuote = newQuote.replace(/[\"'`“”‘’]+$/, '');
				newQuote = newQuote.trim();
			}
			newQuote = newQuote.replace(/^quote\s*:\s*/i, '').trim();
			const tags = (tagsMatch?.[1] || '').trim();
			if (!newQuote) throw new Error('Generated quote empty');
			return { quote: newQuote, tags };
		});

		// Normalize tags to canonical names (case-insensitive)
		const normalizedTags = await step.do('normalize-tags', async () => {
			const set = new Set(canonicalTags.map((t) => t.toLowerCase()));
			const canonicalByLower = new Map(canonicalTags.map((t) => [t.toLowerCase(), t] as const));
			const parts = String(tags || '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
				.map((s) => s.toLowerCase());
			const out: string[] = [];
			for (const p of parts) {
				if (set.has(p)) {
					const canon = canonicalByLower.get(p)!;
					if (!out.includes(canon)) out.push(canon);
				}
			}
			return out.length > 0 ? out.slice(0, 3).join(', ') : null;
		});

		// 3) Insert quote as draft
		const quoteId = await step.do('insert-quote', async () => {
			const id = crypto.randomUUID();
			await this.env.DB.prepare(`INSERT INTO quotes (id, quote, author, tags, status, creator) VALUES (?, ?, ?, ?, 'draft', ?)`)
				.bind(id, quote, null, normalizedTags || null, 'autogen')
				.run();
			return id;
		});

		// 4) Publish via PublishWorkflow (moderation, summary, vectorize)
		await step.do('publish', async () => {
			await this.env.PUBLISH.create({ params: { quoteId, quote } });
			return true;
		});

		// 5) Sleep, then evaluate by score; delete if score < +2
		await step.sleep('wait-to-evaluate', evaluateDelay);
		await step.do('evaluate', async () => {
			const row = await this.env.DB.prepare(
				`SELECT 
            (SELECT COUNT(1) FROM quote_interactions WHERE quote_id=? AND interaction_type='like')
            - (SELECT COUNT(1) FROM quote_interactions WHERE quote_id=? AND interaction_type='dislike') AS score`
			)
				.bind(quoteId, quoteId)
				.first<{ score: number }>();
			const score = (row?.score ?? 0) as number;
			if (score < 2) {
				await this.env.DB.prepare(`DELETE FROM quotes WHERE id=?`).bind(quoteId).run();
			}
		});

		// 6) Optionally schedule next run (not strictly necessary when triggered by cron)
		return { mode, scheduledNextIn: generateInterval, quoteId };
	}
}
