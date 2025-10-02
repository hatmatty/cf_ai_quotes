import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import OpenAI from 'openai';

export type PublishParams = {
	quoteId: string;
	quote: string;
};

export class PublishWorkflow extends WorkflowEntrypoint<Env, PublishParams> {
	async run(event: WorkflowEvent<PublishParams>, step: WorkflowStep) {
		const { quote, quoteId } = event.payload;
		if (this.env.OPENAI_API_KEY !== undefined) {
			await step.do('content-moderation', async () => {
				const openai = new OpenAI({ apiKey: this.env.OPENAI_API_KEY });
				const moderation = await openai.moderations.create({
					model: 'omni-moderation-latest',
					input: quote,
				});
				if (moderation.results[0].flagged) {
					console.warn(`Quote flagged: ${JSON.stringify(moderation)}`);
					await this.env.DB.prepare(`UPDATE quotes SET status=? WHERE id=?`).bind('flagged', quoteId).run();
					throw new NonRetryableError(`Quote ${quoteId} failed moderation`);
				}
				return true;
			});
		} else {
			console.warn('OPENAI_API_KEY is not present in your environment, set it to enable moderation');
		}
		const summary = await step.do('summarize-quote', async () => {
			const result = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
				messages: [
					{ role: 'system', content: 'You concisely explain the meaning and significance of quotes in 1-3 sentences.' },
					{ role: 'user', content: `Provide a brief 1-3 sentence summary of the meaning and significance of this quote:\n\n"${quote}"` },
				],
			});
			const response = (result as any).response as string | undefined;
			if (!response) throw new Error('Summary generation failed');
			return response.trim();
		});

		const combinedForEmbedding = `${quote}\n\nSummary: ${summary}`;

		const quoteEmbedding = await step.do('create-quote-embedding', async () => {
			const results = await this.env.AI.run('@cf/baai/bge-large-en-v1.5', { text: combinedForEmbedding });
			const vector = ((results as any).data?.[0] ?? (results as any).data) as number[] | undefined;
			if (!Array.isArray(vector) || vector.length === 0) throw new Error('quote embedding missing');
			return vector;
		});

		const categories = await step.do('categorize-quote', async () => {
			const results = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
				messages: [
					{
						role: 'system',
						content: `You help categorize quotes for people to search for later.

                            The user is going to give you a quote and your job is to list the most relevant categories for the quote, based on the content of the quote.

                            Do not include words about quotes in general; focus on what the content is about.

                            Return only the categories, comma separated. Do not include a preamble or introudction, just the categories.
                            `,
					},
					{ role: 'user', content: quote },
				],
			});
			const response = (results as any).response as string | undefined;
			if (!response) throw new Error('Categorization failed');
			return response;
		});

		const categoriesEmbedding = await step.do('create-categories-embedding', async () => {
			const results = await this.env.AI.run('@cf/baai/bge-large-en-v1.5', { text: categories });
			const vector = ((results as any).data?.[0] ?? (results as any).data) as number[] | undefined;
			if (!Array.isArray(vector) || vector.length === 0) throw new Error('categories embedding missing');
			return vector;
		});

		await step.do('add-embeddings-to-vector-store', async () => {
			const vectorize = this.env.VECTORIZE;
			if (!vectorize || typeof vectorize.upsert !== 'function') {
				console.warn('VECTORIZE binding not available in this environment; skipping upsert');
				return;
			}
			if (!Array.isArray(quoteEmbedding) || quoteEmbedding.length === 0) throw new Error('quote embedding invalid');
			if (!Array.isArray(categoriesEmbedding) || categoriesEmbedding.length === 0) throw new Error('categories embedding invalid');
			await vectorize.upsert([
				{
					id: `content-${quoteId}`,
					values: quoteEmbedding,
					namespace: 'content',
					metadata: { quoteId: quoteId ?? '', quote: quote ?? '', summary: summary ?? '', categories: categories ?? '' },
				},
			]);
			await vectorize.upsert([
				{
					id: `categories-${quoteId}`,
					values: categoriesEmbedding,
					namespace: 'categories',
					metadata: { quoteId: quoteId ?? '', quote: quote ?? '', summary: summary ?? '', categories: categories ?? '' },
				},
			]);
		});

		await step.do('update-status-to-published', async () => {
			await this.env.DB.prepare(`UPDATE quotes SET status=? WHERE id=?`).bind('published', quoteId).run();
		});
	}
}
