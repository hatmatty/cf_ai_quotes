import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';

export type InteractionParams = {
	userId: string;
	quoteId: string;
	cf: CfProperties;
	interactionType: 'like' | 'unlike' | 'detail' | 'dislike' | 'undislike';
};

export class InteractionWorkfow extends WorkflowEntrypoint<Env, InteractionParams> {
	async run(event: WorkflowEvent<InteractionParams>, step: WorkflowStep) {
		const { userId, quoteId, interactionType } = event.payload;
		let userFieldName;
		if (userId.startsWith('anon-')) {
			userFieldName = 'session_id';
			await step.do('ensure-session-exists', async () => {
				const row = await this.env.DB.prepare('SELECT count(*) AS counter FROM anonymous_sessions WHERE session_id=?')
					.bind(userId)
					.first<{ counter: number }>();
				if ((row?.counter ?? 0) === 0) {
					await this.env.DB.prepare('INSERT INTO anonymous_sessions (session_id) VALUES (?)').bind(userId).run();
				}
			});
		} else {
			userFieldName = 'user_id';
			await step.do('ensure-user-exists', async () => {
				const row = await this.env.DB.prepare('SELECT count(*) AS counter FROM users WHERE user_id=?')
					.bind(userId)
					.first<{ counter: number }>();
				if ((row?.counter ?? 0) === 0) {
					throw new NonRetryableError(`User ${userId} does not exist`);
				}
			});
		}
		if (interactionType === 'unlike') {
			await step.do('remove-like', async () => {
				await this.env.DB.prepare(`DELETE FROM quote_interactions WHERE quote_id=? AND ${userFieldName}=? AND interaction_type='like'`)
					.bind(quoteId, userId)
					.run();
				return true;
			});
		} else if (interactionType === 'like') {
			await step.do('record-like', async () => {
				await this.env.DB.prepare(
					`INSERT OR IGNORE INTO quote_interactions (quote_id, ${userFieldName}, interaction_type) VALUES (?, ?, 'like')`
				)
					.bind(quoteId, userId)
					.run();
				return true;
			});
		} else if (interactionType === 'undislike') {
			await step.do('remove-dislike', async () => {
				await this.env.DB.prepare(`DELETE FROM quote_interactions WHERE quote_id=? AND ${userFieldName}=? AND interaction_type='dislike'`)
					.bind(quoteId, userId)
					.run();
				return true;
			});
		} else if (interactionType === 'dislike') {
			await step.do('record-dislike', async () => {
				await this.env.DB.prepare(
					`INSERT OR IGNORE INTO quote_interactions (quote_id, ${userFieldName}, interaction_type) VALUES (?, ?, 'dislike')`
				)
					.bind(quoteId, userId)
					.run();
				return true;
			});
		} else {
			await step.do('record-detail', async () => {
				await this.env.DB.prepare(`INSERT INTO quote_interactions (quote_id, ${userFieldName}, interaction_type) VALUES (?, ?, 'detail')`)
					.bind(quoteId, userId)
					.run();
				return true;
			});
		}
	}
}
