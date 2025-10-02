import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';

export type QuotificatorParams = {};

export class QuotificatorWorkflow extends WorkflowEntrypoint<Env, QuotificatorParams> {
	async run(event: WorkflowEvent<QuotificatorParams>, step: WorkflowStep) {
		// Load trending quotes from KV (stored by LeaderboardWorkflow)
		const trendingQuotes = await step.do('retrieve-trending-quotes', async () => {
			const resultsJSON = await this.env.LEADERBOARD.get('trending');
			if (resultsJSON === undefined || resultsJSON === null) {
				throw new NonRetryableError(`Currently trending quotes leaderboard not found`);
			}
			return JSON.parse(resultsJSON) as Array<{ quote: string }>;
		});

		// Generate a new quote and tags inspired by trending quotes
		const { newQuote, tags } = await step.do('create-new-quote-with-tags', async () => {
			const items = trendingQuotes.map((q) => `• ${q.quote}`).join('\n');
			const result = await (this.env as any).AI.run('@cf/meta/llama-3-8b-instruct', {
				messages: [
					{
						role: 'system',
						content:
							'You are an expert aphorist. Generate an original, concise, high-quality quote. Also suggest 1-3 tags separated by commas. Format as: QUOTE: <text>\nTAGS: <tag1, tag2, tag3>',
					},
					{ role: 'user', content: `Here are top quotes for inspiration:\n${items}\n\nCreate one original quote now.` },
				],
			});
			const response = (result as any).response as string | undefined;
			if (!response) throw new Error('AI response empty');
			const quoteMatch = response.match(/QUOTE:\s*([\s\S]*?)\n/i);
			const tagsMatch = response.match(/TAGS:\s*(.*)/i);
			let newQuote = (quoteMatch?.[1] || response).trim();
			newQuote = newQuote.replace(/^"|"$/g, '');
			newQuote = newQuote.replace(/^quote\s*:\s*/i, '').trim();
			const tags = (tagsMatch?.[1] || '').trim();
			if (!newQuote) throw new Error('Generated quote empty');
			return { newQuote, tags };
		});

		// Insert into quotes with tags
		const quoteId = await step.do('save-quote', async () => {
			const id = crypto.randomUUID();
			await this.env.DB.prepare(`INSERT INTO quotes (id, quote, author, tags, status, creator) VALUES (?, ?, ?, ?, 'draft', ?)`)
				.bind(id, newQuote, null, tags || null, 'quotificator')
				.run();
			return id as string;
		});

		// Publish via PublishWorkflow (will add summary + embeddings)
		const publishWorkflowId = await step.do('publish', async () => {
			const id = `quotificator-${crypto.randomUUID()}`;
			await this.env.PUBLISH.create({ id, params: { quoteId, quote: newQuote } });
			return id;
		});

		// Optional check publish complete
		await step.sleep('wait-for-publish', '30 seconds');
		await step.do('ensure-published', async () => {
			const workflow = await this.env.PUBLISH.get(publishWorkflowId);
			const state = await workflow.status();
			if (state.status !== 'complete') {
				throw new NonRetryableError(`Publish Workflow ${publishWorkflowId} was in the state of ${state.status}`);
			}
			return state.status;
		});
	}
}
