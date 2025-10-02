import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

export type LeaderboardParams = {};

export class LeaderboardWorkflow extends WorkflowEntrypoint<Env, LeaderboardParams> {
	async run(event: WorkflowEvent<LeaderboardParams>, step: WorkflowStep) {
		const trendingResultsJSON = await step.do('gather-trending-posts', async () => {
			const response = await this.env.DB.prepare(
				`
            WITH LatestLikes AS (
                SELECT *
                FROM quote_interactions
                WHERE interaction_type = 'like'
                ORDER BY created_at DESC
                LIMIT 100
            )
            SELECT q.*, COUNT(like.interaction_id) AS likes_count
            FROM quotes q
            JOIN LatestLikes like ON q.id = like.quote_id
            GROUP BY q.id
            ORDER BY likes_count DESC
            LIMIT 3;`
			).all();
			return JSON.stringify(response.results);
		});
		await step.do('store-trends', async () => {
			await this.env.LEADERBOARD.put('trending', trendingResultsJSON);
		});
		return { trending: JSON.parse(trendingResultsJSON) };
	}
}
