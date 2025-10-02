import { Hono, Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { jsxRenderer } from "hono/jsx-renderer";

import { PublishWorkflow } from "./workflows/publish";
import { InteractionWorkfow } from "./workflows/interaction";
import { QuotificatorWorkflow } from "./workflows/puntificator";
import { LeaderboardWorkflow } from "./workflows/leaderboard";
import Home from "./pages/Home";
import New from "./pages/New";
import Me from "./pages/Me";
import Detail from "./pages/Detail";
import Search from "./pages/Search";
import { AutoQuoteWorkflow } from './workflows/autogen';

export {
  PublishWorkflow,
  InteractionWorkfow,
  QuotificatorWorkflow,
  LeaderboardWorkflow,
  AutoQuoteWorkflow,
};

// Hono c variables
type Variables = {
  userId: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Add a session cookie to all requests
app.use("*", async (c, next) => {
  let userId = getCookie(c, "userId");
  let shouldSetCookie = false;
  if (userId === undefined) {
    userId = "anon-" + crypto.randomUUID();
    shouldSetCookie = true;
  }
  c.set("userId", userId);
  await next();
  if (shouldSetCookie) {
    setCookie(c, "userId", userId);
  }
});

// Layout
app.use(
  "*",
  jsxRenderer(({ children }) => {
    return (
      <html>
        <head>
          <meta charSet="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
              <link rel="stylesheet" href="https://unpkg.com/@picocss/pico@2/css/pico.min.css" />
          <link rel="stylesheet" href="/styles.css" />
          <script defer src="/scripts/utils.js" />
        </head>
        <body>
          <header>
            <a href="/">
                  <div class="brand">Quotes</div>
            </a>
            <nav>
              <a href="/new" class="new-quote-link">
                ➕
              </a>
              <a href="/search" class="search-link">
                🔍
              </a>
              <a href="/me" class="profile-link">
                👤
              </a>
            </nav>
          </header>
          <main>{children}</main>
        </body>
      </html>
    );
  })
);

async function insertQuote(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  quote: string,
  author?: string | null,
  tags?: string | null
): Promise<string> {
  const results = await c.env.DB.prepare(
    `INSERT INTO quotes (id, quote, author, tags, status, creator) VALUES (?, ?, ?, ?, ?, ?) RETURNING id;`
  )
    .bind(crypto.randomUUID(), quote, author ?? null, tags ?? null, "draft", c.get("userId"))
    .run();
  return results.results[0].id as string;
}

// Load canonical tags from TAGS.txt and return a map of lowercase -> canonical
async function getCanonicalTagsMap(c: Context<{ Bindings: Env; Variables: Variables }>): Promise<Map<string, string>> {
  const mapping = await getTagsMapping(c as any, '/TAGS.txt');
  const map = new Map<string, string>();
  for (const name of Object.keys(mapping)) {
    map.set(name.toLowerCase(), name);
  }
  return map;
}

// Normalize a comma-separated tags string to canonical names defined in TAGS.txt (case-insensitive)
async function normalizeTagsToAllowed(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  tags: string | null | undefined
): Promise<string | null> {
  if (!tags) return null;
  const canonical = await getCanonicalTagsMap(c);
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const t of String(tags).split(',').map((s) => s.trim()).filter(Boolean)) {
    const key = t.toLowerCase();
    const match = canonical.get(key);
    if (match && !seen.has(match)) {
      normalized.push(match);
      seen.add(match);
    }
  }
  if (normalized.length === 0) return null;
  return normalized.slice(0, 3).join(', ');
}

// Sanitize quote text: trim whitespace, remove surrounding straight/smart quotes/backticks
function sanitizeQuoteText(raw: string): string {
  let t = String(raw || '');
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();
  // Strip common wrapping quotes/backticks at both ends (straight and smart)
  // Repeat twice to handle nested/duplicated characters
  for (let i = 0; i < 2; i++) {
    t = t.replace(/^[\"'`“”‘’]+/, '');
    t = t.replace(/[\"'`“”‘’]+$/, '');
    t = t.trim();
  }
  return t;
}

async function getSimilarQuoteIdsById(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  quoteId: string
): Promise<Array<string>> {
  const vectorize = (c.env as any).VECTORIZE as any;
  if (!vectorize || typeof vectorize.getByIds !== 'function' || typeof vectorize.query !== 'function') {
    return [];
  }
  const quoteVectors = await vectorize.getByIds([
    `content-${quoteId}`,
    `categories-${quoteId}`,
  ]);

  const [contentVec, categoryVec] = quoteVectors || [];
  const queries: Array<Promise<any>> = [];
  if (contentVec && Array.isArray(contentVec.values)) {
    queries.push(
      vectorize.query(contentVec.values, {
        namespace: "content",
        returnMetadata: true,
        topK: 20,
      })
    );
  }
  if (categoryVec && Array.isArray(categoryVec.values)) {
    queries.push(
      vectorize.query(categoryVec.values, {
        namespace: "categories",
        returnMetadata: true,
        topK: 10,
      })
    );
  }

  if (queries.length === 0) {
    return [];
  }

  const resultsSets = await Promise.all(queries);
  const scoreById = new Map<string, number>();

  for (const set of resultsSets) {
    const matches = (set?.matches ?? []) as Array<any>;
    for (const m of matches) {
      const id = m?.metadata?.quoteId as string | undefined;
      const score = typeof m?.score === 'number' ? m.score : 0;
      if (!id || id === quoteId) continue; // skip invalid and self
      if (score <= 0.3) continue; // threshold
      const prev = scoreById.get(id) ?? -Infinity;
      if (score > prev) scoreById.set(id, score);
    }
  }

  // Sort by score desc and cap results
  const sorted = Array.from(scoreById.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => id);

  return sorted;
}

async function getLikedQuotesForUser(
  c: Context<{ Bindings: Env; Variables: Variables }>
) {
  const userId = c.get("userId");
  let userFieldName = "user_id";
  if (userId.startsWith("anon-")) {
    userFieldName = "session_id";
  }
  const likedResponse = await c.env.DB.prepare(
    `
		SELECT
			quotes.*
		FROM
			quotes JOIN quote_interactions ON (quotes.id = quote_interactions.quote_id)
		WHERE
			quote_interactions.${userFieldName} = ?
		AND
			quote_interactions.interaction_type = 'like'
		ORDER BY quote_interactions.created_at DESC;
	`
  )
    .bind(userId)
    .all();
  return likedResponse.results;
}

async function quotesByIdsPreserveOrder(c: Context, quoteIds: Array<string>) {
  if (quoteIds.length === 0) return [];
  const CHUNK_SIZE = 100;
  const byId = new Map<string, any>();
  for (let i = 0; i < quoteIds.length; i += CHUNK_SIZE) {
    const chunk = quoteIds.slice(i, i + CHUNK_SIZE);
    const placeholders = "?".repeat(chunk.length).split("").join(", ");
    const sql = `SELECT * FROM quotes WHERE id IN (${placeholders})`;
    const stmt = c.env.DB.prepare(sql).bind(...chunk);
    const response = await stmt.all();
    for (const r of ((response.results as any[]) || [])) {
      byId.set((r as any).id, r);
    }
  }
  return quoteIds.map((id) => byId.get(id)).filter(Boolean);
}

async function enrichWithScore(c: Context, rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const CHUNK_SIZE = 100;
  const counts = new Map<string, { likes: number; dislikes: number }>();
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const placeholders = "?".repeat(chunk.length).split("").join(", ");
    const sql = `
      SELECT q.id,
        (SELECT COUNT(1) FROM quote_interactions li WHERE li.quote_id = q.id AND li.interaction_type = 'like') AS likes,
        (SELECT COUNT(1) FROM quote_interactions di WHERE di.quote_id = q.id AND di.interaction_type = 'dislike') AS dislikes
      FROM quotes q
      WHERE q.id IN (${placeholders})`;
    const resp = await c.env.DB.prepare(sql).bind(...chunk.map((r) => r.id)).all();
    for (const r of ((resp.results as any[]) || [])) {
      counts.set((r as any).id, { likes: (r as any).likes || 0, dislikes: (r as any).dislikes || 0 });
    }
  }
  return rows.map((r) => {
    const cts = counts.get(r.id) || { likes: 0, dislikes: 0 };
    return { ...r, likes: cts.likes, dislikes: cts.dislikes, score: (cts.likes - cts.dislikes) };
  });
}

app.get("/api/quotes", async (c) => {
  // TODO: paging
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM quotes WHERE status='published' ORDER BY created_at DESC`
  ).all();
  const enriched = await enrichWithScore(c as any, results as any[]);
  return c.json({ results: enriched });
});

app.post("/api/quotes", async (c) => {
  const payload = await c.req.json();
  const quoteText = sanitizeQuoteText(String(payload.quote || ''));
  const author = payload.author ? String(payload.author).trim() : null;
  const rawTags = payload.tags ? String(payload.tags).trim() : null;
  if (!quoteText) {
    return c.json({ error: 'Quote text is required' }, 400);
  }
  const tags = await normalizeTagsToAllowed(c, rawTags);
  if (!tags) {
    return c.json({ error: 'At least one tag is required' }, 400);
  }
  const quoteId = await insertQuote(c, quoteText, author, tags);
  const workflow = await c.env.PUBLISH.create({
    params: {
      quoteId,
      quote: quoteText,
    },
  });
  return c.json({ workflow });
});

app.get("/api/quotes/trending", async (c) => {
  const trendingJSON = await c.env.LEADERBOARD.get("trending");
  const trending = trendingJSON ? JSON.parse(trendingJSON) : [];
  return c.json(trending);
});

// Admin/test endpoints (no auth; for local validation only)
app.post('/api/test/autoquote', async (c) => {
  const { mode } = (await c.req.json().catch(() => ({}))) as { mode?: 'DEBUG' | 'PRODUCTION' | 'FAST' };
  const workflow = await c.env.AUTOQUOTE.create({ params: { mode: (mode as any) || 'FAST' } });
  return c.json({ id: workflow.id });
});

app.get('/api/test/workflows/:binding/:id', async (c) => {
  const binding = c.req.param('binding');
  const id = c.req.param('id');
  const wf = await (c.env as any)[binding]?.get?.(id);
  if (!wf) return c.json({ error: 'workflow not found' }, 404);
  const status = await wf.status();
  return c.json(status);
});

app.get('/api/test/quotes/:quoteId/score', async (c) => {
  const quoteId = c.req.param('quoteId');
  const row = await c.env.DB.prepare(
    `SELECT 
      (SELECT COUNT(1) FROM quote_interactions WHERE quote_id=? AND interaction_type='like')
      - (SELECT COUNT(1) FROM quote_interactions WHERE quote_id=? AND interaction_type='dislike') AS score`
  ).bind(quoteId, quoteId).first<{ score: number }>();
  return c.json({ quoteId, score: (row?.score ?? 0) as number });
});

// Unified idempotent vote endpoint: set vote to -1, 0, or 1
app.post('/api/quotes/:quoteId/vote', async (c) => {
  const quoteId = c.req.param('quoteId');
  const userId = c.get('userId');
  try {
    const payload = await c.req.json().catch(() => ({}));
    const voteNum = Number((payload as any)?.vote);
    if (![ -1, 0, 1 ].includes(voteNum)) {
      return c.json({ error: 'vote must be -1, 0, or 1' }, 400);
    }

    // Determine identity column
    const userFieldName = userId.startsWith('anon-') ? 'session_id' : 'user_id';

    // Ensure anon session row exists for anonymous voters
    if (userFieldName === 'session_id') {
      await c.env.DB.prepare('INSERT OR IGNORE INTO anonymous_sessions (session_id) VALUES (?)').bind(userId).run();
    }

    const statements: D1PreparedStatement[] = [];
    // Remove any existing like/dislike to ensure mutual exclusion
    statements.push(
      c.env.DB.prepare(`DELETE FROM quote_interactions WHERE quote_id=? AND ${userFieldName}=? AND interaction_type IN ('like','dislike')`).bind(quoteId, userId)
    );
    if (voteNum === 1) {
      statements.push(
        c.env.DB.prepare(`INSERT OR IGNORE INTO quote_interactions (quote_id, ${userFieldName}, interaction_type) VALUES (?, ?, 'like')`).bind(quoteId, userId)
      );
    } else if (voteNum === -1) {
      statements.push(
        c.env.DB.prepare(`INSERT OR IGNORE INTO quote_interactions (quote_id, ${userFieldName}, interaction_type) VALUES (?, ?, 'dislike')`).bind(quoteId, userId)
      );
    }

    if (statements.length > 0) {
      await c.env.DB.batch(statements);
    }

    // Compute canonical counts and score
    const counts = await c.env.DB.prepare(
      `SELECT 
        (SELECT COUNT(1) FROM quote_interactions WHERE quote_id=? AND interaction_type='like') AS likes,
        (SELECT COUNT(1) FROM quote_interactions WHERE quote_id=? AND interaction_type='dislike') AS dislikes`
    ).bind(quoteId, quoteId).first<{ likes: number; dislikes: number }>();
    const likes = Number(counts?.likes || 0);
    const dislikes = Number(counts?.dislikes || 0);
    const score = likes - dislikes;

    // Determine user's current vote from what we just set
    const userVote = voteNum;

    return c.json({ quoteId, vote: userVote, likes, dislikes, score });
  } catch (e) {
    console.error('vote error', e);
    return c.json({ error: 'failed to set vote' }, 500);
  }
});

app.get("/api/quotes/search", async (c) => {
  const query = c.req.query("q") || "";
  if (query === undefined) {
    return c.json({ results: [] });
  }
  const embeddingResult = await c.env.AI.run("@cf/baai/bge-large-en-v1.5", {
    text: query,
  });

  const vector = ((embeddingResult as any).data?.[0] ?? (embeddingResult as any).data) as number[];
  const vectorize = (c.env as any).VECTORIZE as any;
  if (!vectorize || typeof vectorize.query !== 'function') {
    return c.json({ results: [] });
  }
  const results = await vectorize.query(vector, {
    namespace: "content",
    topK: 20,
    returnMetadata: true,
  });
  const filtered = results.matches.filter((r: any) => r.score > 0.3);
  const ids = filtered.map((r: any) => r?.metadata?.quoteId) as Array<string>;
  const quotes = await quotesByIdsPreserveOrder(c, ids);
  const enriched = await enrichWithScore(c as any, quotes as any[]);
  return c.json({ results: enriched });
});

app.get('/api/quotes/mine', async (c) => {
	const createdResponse = await c.env.DB.prepare(`SELECT * FROM quotes WHERE creator=? ORDER BY created_at DESC`).bind(c.get('userId')).all();
	const liked = await getLikedQuotesForUser(c);
	const createdEnriched = await enrichWithScore(c as any, (createdResponse.results as any[]));
	const likedEnriched = await enrichWithScore(c as any, (liked as any[]));
	return c.json({ created: createdEnriched, liked: likedEnriched });
});

app.get("/api/quotes/:quoteId", async (c) => {
  const quoteId = c.req.param("quoteId");
  const quote = await c.env.DB.prepare(`SELECT * FROM quotes WHERE id=?`)
    .bind(quoteId)
    .first();
  if (quote === null) {
    return c.status(404);
  }
  // Allow user to see their own
  if (quote.status !== "published") {
    if (c.get("userId") !== quote.creator) {
      console.warn("Trying to view unpublished");
      return c.status(404);
    }
  }
  const enriched = (await enrichWithScore(c as any, [quote as any]))[0];
  return c.json(enriched);
});

app.get("/api/quotes/:quoteId/similar", async (c) => {
  const quoteId = c.req.param("quoteId");
  if (quoteId === undefined) {
    return c.json({ results: [] });
  }
  const ids = await getSimilarQuoteIdsById(c, quoteId);
  const quotes = await quotesByIdsPreserveOrder(c, ids);
  // Deduplicate by normalized quote text while preserving order
  const seenText = new Set<string>();
  const deduped = (quotes as any[]).filter((q) => {
    const text = String(q?.quote || '').trim().toLowerCase();
    if (!text) return false;
    if (seenText.has(text)) return false;
    seenText.add(text);
    return true;
  });
  const enriched = await enrichWithScore(c as any, deduped as any[]);
  return c.json({ results: enriched });
});

async function addInteraction(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  quoteId: string,
  interactionType: string
) {
  const userId = c.get("userId") as string;
  const workflow = await c.env.INTERACTION.create({
    params: {
      userId,
      quoteId,
      interactionType,
      cf: c.req.raw.cf,
    }
  });
  return true;
}

app.post("/api/quotes/:quoteId/like", async (c) => {
  const quoteId = c.req.param("quoteId");
  await addInteraction(c, quoteId, "like");
  return c.json({ success: true });
});

app.post("/api/quotes/:quoteId/unlike", async (c) => {
  const quoteId = c.req.param("quoteId");
  await addInteraction(c, quoteId, "unlike");
  return c.json({ success: true });
});

app.post("/api/quotes/:quoteId/dislike", async (c) => {
  const quoteId = c.req.param("quoteId");
  await addInteraction(c, quoteId, "dislike");
  return c.json({ success: true });
});

app.post("/api/quotes/:quoteId/undislike", async (c) => {
  const quoteId = c.req.param("quoteId");
  await addInteraction(c, quoteId, "undislike");
  return c.json({ success: true });
});

app.get("/", (c) => {
  return c.render(<Home />);
});

app.get("/new", (c) => {
  return c.render(<New />);
});

app.get("/me", (c) => {
  return c.render(<Me />);
});

app.get("/search", (c) => {
  return c.render(<Search />);
});

app.get("/quotes/:quoteId", async (c) => {
  const quoteId = c.req.param("quoteId");
  await addInteraction(c, quoteId, "detail");
  return c.render(<Detail />);
});


async function getAsset(c: Context, pathName: string) {
	const asset = await c.env.ASSETS.unstable_getByPathname(pathName);
	if (!asset) {
		throw new Error('missing asset!');
	}
	return new Response(asset.readableStream, { headers: { 'Content-Type': asset.contentType } });
}


// batch process
app.post('/api/quotes/batch', async (c) => {
	const url = new URL(c.req.url);
	const file = url.searchParams.get('file') || '/INITIAL.txt';
	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? Number(limitParam) : undefined;

	const response = await getAsset(c, file);
	const text = await response.text();
	const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
	const parsed = lines.map((line) => {
		// Format: "Quote text": Tag1, Tag2, Tag3
		const match = line.match(/^"(.+?)"\s*:\s*(.*)$/);
		if (!match) {
			return { quote: line.replace(/^"|"$/g, ''), tags: null };
		}
		const quote = match[1];
		const tags = match[2] || '';
		return { quote, tags };
	});

	const slice = typeof limit === 'number' && limit > 0 ? parsed.slice(0, limit) : parsed;
	console.log(`Batching up ${slice.length} quotes from ${file}`);
	c.set('userId', 'seed');

	for (const item of slice) {
    const quote = sanitizeQuoteText(item.quote);
    const normalizedTags = await normalizeTagsToAllowed(c as any, item.tags);
    const quoteId = await insertQuote(c, quote, null, normalizedTags);
		await c.env.PUBLISH.create({
	      id: `seed-batch-${crypto.randomUUID()}`,
	      params: { quoteId, quote }
		});
    // Add random likes/dislikes between -10 and +10
    const net = Math.floor(Math.random() * 21) - 10; // -10..+10
    const total = Math.abs(net);
    for (let i = 0; i < total; i++) {
      const session = `seed-session-${crypto.randomUUID()}`;
      if (net >= 0) {
        await c.env.DB.prepare(`INSERT OR IGNORE INTO anonymous_sessions (session_id) VALUES (?)`).bind(session).run();
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO quote_interactions (quote_id, session_id, interaction_type) VALUES (?, ?, 'like')`
        ).bind(quoteId, session).run();
      } else {
        await c.env.DB.prepare(`INSERT OR IGNORE INTO anonymous_sessions (session_id) VALUES (?)`).bind(session).run();
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO quote_interactions (quote_id, session_id, interaction_type) VALUES (?, ?, 'dislike')`
        ).bind(quoteId, session).run();
      }
    }
	}
	return c.json({ success: true, file, inserted: slice.length });
});

// Tags color mapping
async function getTagsMapping(c: Context, pathName: string) {
  const resp = await getAsset(c as any, pathName);
  const text = await resp.text();
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const map: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^(.*?):\s*RGB\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)\s*$/);
    if (m) {
      const name = m[1].trim();
      const r = Number(m[2]);
      const g = Number(m[3]);
      const b = Number(m[4]);
      map[name] = `rgb(${r}, ${g}, ${b})`;
    }
  }
  return map;
}

app.get('/api/tags', async (c) => {
  try {
    const mapping = await getTagsMapping(c as any, '/TAGS.txt');
    return c.json({ tags: mapping });
  } catch (e) {
    console.error('error reading tags', e);
    return c.json({ tags: {} });
  }
});

// Fallback to serve static assets (styles, scripts, images)
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(env.LEADERBOARD_WORKFLOW.create());
    ctx.waitUntil((env as any).AUTOQUOTE.create({ params: { mode: ((env as any).MODE as any) || 'PRODUCTION' } }));
  },
}


