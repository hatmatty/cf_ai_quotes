# Quotes App

A full-stack Cloudflare Workers application for creating, viewing, and searching quotes with AI-powered features. Built with Hono, TSX templates, D1, Vectorize, Workers AI, KV, and Workflows.

## Assignment Requirements Fulfilled

This application demonstrates a complete AI-powered application built on Cloudflare's platform, meeting all specified criteria for the Cloudflare Software Engineer Internship:

### 1. Large Language Model (LLM)
**Implementation:** Workers AI with Llama 3.3 (`@cf/meta/llama-3-8b-instruct`)

**Usage in this app:**
- **Quote Moderation**: AI analyzes user-submitted quotes for inappropriate content before publication
- **Quote Summarization**: Generates 1-3 sentence summaries capturing meaning and significance of each quote
- **Automatic Quote Generation**: AI creates original quotes daily based on top-rated quotes, including tag categorization
- **Similarity Search**: Embeddings model (`@cf/baai/bge-large-en-v1.5`) powers semantic quote search via Vectorize

**Location in code:** `src/workflows/publish.ts`, `src/workflows/autogen.ts`, `src/workflows/interaction.ts`

### 2. Workflow & Coordination
**Implementation:** Cloudflare Workflows + Workers

**Active workflows:**
- **PublishWorkflow**: Coordinates AI moderation → summarization → vectorization pipeline when quotes are created
- **AutoQuoteWorkflow**: Orchestrates daily AI quote generation, evaluation, and cleanup (production: 30min intervals, debug: 1min intervals)
- **InteractionWorkflow**: Manages AI chat interactions for quote suggestions
- **LeaderboardWorkflow**: Coordinates periodic leaderboard updates and statistics

**Worker coordination:** Main worker (`src/index.tsx`) routes requests, manages API endpoints, and triggers workflows based on user actions and cron schedules.

**Location in code:** `src/workflows/*.ts`, `wrangler.jsonc` (workflows + crons configuration)

### 3. User Input via Chat
**Implementation:** Cloudflare Pages (Static Assets) + interactive UI

**User interaction features:**
- **Web Interface**: Full frontend served via Workers Static Assets (`public/` directory)
- **Quote Creation Form**: Users input quotes, authors, and tags with real-time validation
- **Search Interface**: Natural language search describing desired quotes (AI-powered semantic search)
- **Upvote/Downvote**: Real-time interaction tracking stored in D1 and KV

**Pages routes:**
- `/` - Home with quote grid and search
- `/new` - Create quotes
- `/quote/:id` - Detail view with similar quotes
- `/search` - Advanced search interface

**Location in code:** `public/scripts/*.js`, `src/pages/*.tsx`, `wrangler.jsonc` (assets configuration)

### 4. Memory & State
**Implementation:** D1 (relational), Vectorize (vector embeddings), KV (leaderboard cache)

**State management:**
- **D1 Database**: Persistent storage for quotes, upvotes, downvotes, metadata
- **Vectorize**: Stores quote embeddings for similarity search and recommendations
- **KV Namespace**: Caches leaderboard data and frequently accessed statistics
- **Workflow State**: Manages multi-step AI processes with built-in persistence

---

## Prerequisites

- Node.js 18+
- Cloudflare account with access to Workers, D1, KV, Vectorize, and Workflows
- Wrangler CLI (included as dev dependency)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Cloudflare Resources

Create required resources and note the returned IDs:

```bash
# D1 database (copy the database_id from output)
npx wrangler d1 create quotes

# Vectorize index with embeddings model
npx wrangler vectorize create quotes --preset "@cf/baai/bge-large-en-v1.5"

# KV namespace (copy the id from output)
npx wrangler kv namespace create LEADERBOARD
```

### 3. Configure wrangler.jsonc

Update `wrangler.jsonc` with the IDs from step 2:

- **`d1_databases[0].database_id`**: Paste your D1 database ID
- **`kv_namespaces[0].id`**: Paste your KV namespace ID

Required configuration (most already set):
- `binding: "DB"` for D1 (do not change)
- `binding: "LEADERBOARD"` for KV (do not change)
- `index_name: "quotes"` for Vectorize (matches created index)

### 4. Generate TypeScript Types

```bash
npm run cf-typegen
```

This generates `worker-configuration.d.ts` from your `wrangler.jsonc` configuration.

### 5. Apply Database Schema

```bash
# Local development database
npx wrangler d1 migrations apply quotes --local

# Production database (run after testing locally)
npx wrangler d1 migrations apply quotes --remote
```

This creates the `quotes` table with columns: id, text, author, tags, upvotes, downvotes, created_at.

### 6. Set Secrets (Optional)

Only needed if using external AI providers (e.g., OpenAI):

```bash
npx wrangler secret put OPENAI_API_KEY
```

Default setup uses Workers AI (no API key required).

### 7. Load Initial Data

```bash
npm run load:local
```

This imports quotes from `public/INITIAL.txt` into your local D1 database. Each quote gets random upvotes/downvotes (-10 to +10) and is vectorized for similarity search.

## Development

```bash
npm run dev
```

Visit `http://localhost:8787` to access:
- `/` - Home page with quote grid
- `/new` - Create new quotes
- `/quote/:id` - View individual quote details
- `/api/*` - API endpoints

## Deployment

```bash
# Type-check before deploying
npm run build

# Deploy to Cloudflare
npm run deploy
```

After deploying:
1. Apply migrations to remote: `npx wrangler d1 migrations apply quotes --remote`
2. Load initial data to remote: `REMOTE_BASE_URL="https://your-app.workers.dev" npm run load:remote`

## Configuration

### MODE Variable

Set in `wrangler.jsonc` under `vars.MODE`:
- **`PRODUCTION`**: AI generates quotes every 30 minutes (cron schedule), evaluates after 2 days
- **`DEBUG`**: AI generates quotes every minute, evaluates after 10 minutes

### Cron Schedule

Modify `triggers.crons` in `wrangler.jsonc`:
- Default: `"*/30 * * * *"` (every 30 minutes in PRODUCTION mode)
- Cron triggers the automatic quote generation workflow

## Data Management

### Wipe Data

```bash
npm run wipe:local   # Clear local development data
npm run wipe:remote  # Clear production data
npm run wipe:both    # Clear both
```

### Load Initial Data

```bash
npm run load:local                                              # Load to local
REMOTE_BASE_URL="https://your-app.workers.dev" npm run load:remote  # Load to remote
REMOTE_BASE_URL="https://your-app.workers.dev" npm run load:both    # Load to both
```

Quote format in `public/INITIAL.txt`:
```
"Quote text here": Tag1, Tag2
"Another quote": Tag1
```

## Project Structure

```
src/
  index.tsx            # Main worker entry point
  pages/               # TSX page templates
  workflows/           # Workflow definitions
public/
  scripts/             # Client-side JavaScript
  styles.css           # Styles
  INITIAL.txt          # Initial quote dataset
migrations/
  0001_initialize_tables.sql  # D1 database schema
```

## Troubleshooting

**Type errors after wrangler.jsonc changes**: Run `npm run cf-typegen`

**Database migrations fail**: Ensure D1 database exists and `database_id` in `wrangler.jsonc` is correct

**Vectorize errors**: Verify index name matches `wrangler.jsonc` (`quotes`) and was created with correct preset

**KV errors**: Confirm `kv_namespaces[0].id` in `wrangler.jsonc` matches your created namespace

**Workflows not running**: Check bindings in `wrangler.jsonc` match class names exactly (case-sensitive)