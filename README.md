# Quotes App

Deployed Site: https://quotes.mkollu3.workers.dev/

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

## Deployed Site Walkthrough

**Deployed Site:** https://quotes.mkollu3.workers.dev/

### 🏠 Home Page (`/`)
When you first visit the site, you'll see a grid of quotes displayed in a clean, modern interface.

**Quote Display:**
- Each quote card shows the quote text, author (if available), and up to 3 color-coded category tags
- 50 available tag categories (Motivational, Inspirational, Wisdom, Love, etc.) each with distinct RGB colors from `TAGS.txt`
- Real-time upvote/downvote buttons with live score updates (upvotes - downvotes)
- Click any quote to navigate to its detailed view

**Semantic Search:**
- Search by *describing* the type of quote you want (e.g., "quotes about overcoming challenges")
- Powered by **Vectorize** similarity search using the `@cf/baai/bge-large-en-v1.5` embeddings model
- Searches against both the quote text AND AI-generated summaries for better semantic matching
- Results automatically sorted by relevance score (threshold: 0.3)

**Navigation:**
- "New Quote" button takes you to the creation form
- "My Quotes" button shows your personal page with liked and created quotes

### 📝 Quote Creation (`/new`)
Create and submit new quotes to the platform.

**User Input:**
- Quote text (required) - the actual quote without quotation marks
- Author name (optional) - leave blank for anonymous quotes
- Category tags (1-3 required) - select from dropdown of 50 categories

**AI Processing Pipeline (via PublishWorkflow):**
1. **Moderation Check**: Llama 3.3 analyzes the quote for inappropriate content
   - If flagged, user receives immediate rejection notice
   - Only approved quotes proceed to next steps
2. **AI Summarization**: Llama 3.3 generates a 1-3 sentence summary explaining the quote's meaning and significance
3. **Vectorization**: Combined quote + summary embedded using `@cf/baai/bge-large-en-v1.5` and stored in Vectorize
4. **Storage**: Quote metadata saved to D1 database with timestamps

All created quotes appear on your personal page (`/me`).

### 🔍 Quote Detail Page (`/quote/:id`)
Click any quote to see an expanded view with additional context.

**Main Display:**
- Large format quote text
- Author name (if provided) or "Anonymous"
- All category tags with color coding
- Upvote/downvote buttons with current score

**Similar Quotes:**
- Grid of related quotes powered by **Vectorize similarity search**
- Compares embeddings to find semantically similar content
- Helps discover quotes with related themes or meanings
- Each similar quote is clickable to view its detail page

### 👤 Personal Page (`/me`)
Track your activity and favorite quotes.

**Two Sections:**
1. **Quotes I Created**: All quotes you've submitted to the platform
   - Shows approval status (moderated quotes won't appear)
   - Displays tags, scores, and authors you assigned
2. **Quotes I Liked**: All quotes you've upvoted
   - Persisted via browser cookies linked to your session
   - Hearts pre-filled on quote cards you've liked

Both sections show "None" if empty. All quotes are clickable to view details.

### 🔎 Advanced Search (`/search`)
Dedicated search interface for exploring quotes by semantic meaning.

- Full-page search experience
- Same Vectorize-powered semantic search as home page
- Results displayed in grid format with all quote metadata

### 🤖 AI Background Features (Not Visible in UI)

**Automatic Quote Generation (AutoQuoteWorkflow):**
- **Generation**: AI analyzes top 10 most-upvoted quotes and creates an original quote inspired by patterns and themes
- **Categorization**: AI assigns relevant tags based on content
- **Evaluation**: After a waiting period, AI checks if the generated quote achieved +2 net upvotes
  - ✅ Keeps quote if successful
  - ❌ Deletes quote if it didn't resonate with users
- **Scheduling**:
  - `PRODUCTION` mode: Generates every 30 minutes, evaluates after 2 days
  - `DEBUG` mode: Generates every 1 minute, evaluates after 10 minutes
- All AI-generated quotes are anonymous (no author)

**Workflow Coordination:**
- **PublishWorkflow**: Multi-step moderation → summarization → vectorization pipeline
- **AutoQuoteWorkflow**: Handles AI quote generation lifecycle with delayed evaluation
- **InteractionWorkflow**: Manages AI chat interactions for quote suggestions
- **LeaderboardWorkflow**: Tracks trending quotes based on recent likes (backend data gathering)

### 🛠️ Technical Implementation Highlights

**State & Memory:**
- **D1 Database**: Stores quotes, interactions, metadata, timestamps
- **Vectorize**: 384-dimensional embeddings for semantic search
- **KV Namespace**: Caches leaderboard and statistics data
- **Browser Cookies**: Tracks user's liked quotes and created content

**AI Models:**
- **Llama 3.3** (`@cf/meta/llama-3-8b-instruct`): Content moderation, summarization, quote generation
- **BGE Large EN** (`@cf/baai/bge-large-en-v1.5`): Text embeddings for similarity search

**Frontend:**
- Server-side rendered TSX templates (Hono + JSX)
- Client-side JavaScript for dynamic interactions
- Workers Static Assets serving from `/public` directory
- Real-time upvote/downvote updates without page refresh 

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
# D1 database 
npx wrangler d1 create quotes # make sure to name the binding as DB!

# Vectorize index with embeddings model
npx wrangler vectorize create quotes --preset "@cf/baai/bge-large-en-v1.5"

# KV namespace 
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
# uses 8787 as the port!
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

Completely clears all data from D1 tables, KV namespace, and Vectorize index:

```bash
npm run wipe:local   # Clear local D1, local KV, and Vectorize
npm run wipe:remote  # Clear remote D1, remote KV, and Vectorize
npm run wipe:both    # Clear both local and remote
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