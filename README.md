# Quotes App (cf_ai_quotes)

This project is a Cloudflare Workers app for creating, viewing, and searching quotes. It uses JSONC configuration, Hono + TSX entrypoint, and modern bindings for D1, Vectorize, Workers AI, KV, and Workflows.

## Prerequisites

- Node.js 18+
- Wrangler 4 (`npm i -g wrangler` optional; we use local devDependency)
- Cloudflare account with access to Workers, D1, KV, Vectorize, and Workflows

## Install

```bash
npm install
npm run cf-typegen
```

## Configure wrangler.jsonc (precise checklist)

Open `wrangler.jsonc` and ensure ALL of the following are present and correct. Replace placeholder IDs where noted.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "quotes",
  "main": "src/index.tsx",
  "compatibility_date": "2025-03-07",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true, "head_sampling_rate": 1 },
  "assets": { "directory": "public", "binding": "ASSETS" },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "quotes",
      "database_id": "<REPLACE_WITH_YOUR_D1_ID>"
    }
  ],
  "ai": { "binding": "AI" },
  "vars": { "MODE": "PRODUCTION" },
  "vectorize": [
    { "binding": "VECTORIZE", "index_name": "quotes" }
  ],
  "kv_namespaces": [
    { "binding": "LEADERBOARD", "id": "<REPLACE_WITH_YOUR_KV_ID>" }
  ],
  "workflows": [
    { "name": "publish", "binding": "PUBLISH", "class_name": "PublishWorkflow" },
    { "name": "interaction", "binding": "INTERACTION", "class_name": "InteractionWorkfow" },
    { "name": "leaderboard", "binding": "LEADERBOARD_WORKFLOW", "class_name": "LeaderboardWorkflow" },
    { "name": "autoquote", "binding": "AUTOQUOTE", "class_name": "AutoQuoteWorkflow" }
  ],
  "triggers": { "crons": ["*/30 * * * *"] }
}
```

What to update exactly:
- name: keep `quotes` or set your preferred name.
- main: must be `src/index.tsx`.
- compatibility_date: set to `2025-03-07`.
- compatibility_flags: include `nodejs_compat`.
- observability: set `enabled: true`, `head_sampling_rate: 1`.
- assets: set `directory` to `public` and `binding` to `ASSETS`.
- d1_databases[0].database_id: replace with your real D1 database id.
- vectorize[0].index_name: set to `quotes` (or your index name).
- kv_namespaces[0].id: replace with your KV namespace id.
- workflows: ensure all entries are present with exact class names.
- triggers: keep the 30-minute cron or adjust as needed.

After any change, re-run:

```bash
npm run cf-typegen
```

## Environment variables & secrets

- Non-secret config is defined under `vars` in `wrangler.jsonc` (e.g., `MODE`).
- Do NOT store secrets in `wrangler.jsonc`. Use Wrangler secrets instead:

```bash
npx wrangler secret put OPENAI_API_KEY
```

TypeScript typing for secrets:
- We augment the Worker `Env` interface in `src/env.d.ts` so TypeScript knows `OPENAI_API_KEY` exists at runtime.
- Wrangler typegen generates `worker-configuration.d.ts` from `wrangler.jsonc`. Keep it committed so other devs have matching types.

If you use `nodejs_compat`, install Node types if needed for your tooling:

```bash
npm i -D @types/node
```

## One-time Cloudflare setup

1) D1 database

```bash
npx wrangler d1 create quotes

# Update wrangler.jsonc d1_databases[0].database_id with the returned id

# Apply schema locally
npx wrangler d1 migrations apply quotes

# (Optional) Apply to remote
npx wrangler d1 migrations apply quotes --remote
```
** change the binding name for the d1 quotes to "DB" as shown in the wrangler.jsonc example above**

2) Vectorize index

```bash
npx wrangler vectorize create quotes --preset "@cf/baai/bge-large-en-v1.5"
```

3) KV namespace

```bash
npx wrangler kv namespace create LEADERBOARD

# Update wrangler.jsonc kv_namespaces[0].id with the returned id
```

4) Optional AI Gateway

Create an AI Gateway named `quotes` in the Cloudflare Dashboard if you want gateway logging/metrics. Workers AI works without it.

5) Secrets

```bash
npx wrangler secret put OPENAI_API_KEY
```

## Local development

```bash
npm run dev
```

The app serves:
- API under `/api/...`
- Static assets from `public/`
- Pages routed by Hono with TSX templates

## Build & Deploy

```bash
# Regenerate types and type-check
npm run build

# Deploy
npm run deploy
```

## Initialize with data (batch import)

This repo includes `INITIAL.txt`. To batch import:

1) Start dev, then call the batch route or use the npm command:

```bash
npm run load:local
# or manually
curl -X POST "http://localhost:8787/api/quotes/batch?file=/INITIAL.txt"
```

This will insert quotes and enqueue publish workflows for each. The batch route accepts a `limit` param to restrict imported items.

## Wipe & Load shortcuts

Use these helpers to clear data and load the initial dataset.

```bash
# wipe data only (local / remote / both)
npm run wipe:local
npm run wipe:remote
npm run wipe:both

# load initial data
npm run load:local
# remote: set your deployed base URL explicitly (workers.dev or custom domain)
REMOTE_BASE_URL="https://<your-site>" npm run load:remote
# both (local then remote)
REMOTE_BASE_URL="https://<your-site>" npm run load:both
```

## Notes

- Ensure `wrangler.jsonc` IDs match your account resources (D1 id, KV id).
- Re-run `npm run cf-typegen` after changing `wrangler.jsonc`.
- We generate types using `wrangler types` and include `worker-configuration.d.ts` in `tsconfig.json`.
- Avoid committing secrets; use Wrangler secrets for anything sensitive.