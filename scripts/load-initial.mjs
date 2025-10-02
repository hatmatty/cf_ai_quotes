#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const mode = args[0] || '--local';

function getRemoteBaseUrlOrThrow() {
  const base = process.env.REMOTE_BASE_URL;
  if (!base) throw new Error('REMOTE_BASE_URL is required for --remote/--both. Example: REMOTE_BASE_URL=https://quotes.example.com');
  return base.replace(/\/$/, '');
}

async function main() {
  let baseUrl;
  if (mode === '--local') {
    baseUrl = process.env.LOCAL_BASE_URL || 'http://localhost:8787';
  } else if (mode === '--remote') {
    baseUrl = getRemoteBaseUrlOrThrow();
  } else if (mode === '--both') {
    // Run local then remote sequentially
    process.argv[2] = '--local';
    await main();
    process.argv[2] = '--remote';
    await main();
    return;
  } else {
    console.error('Usage: node scripts/load-initial.mjs [--local|--remote|--both]');
    process.exit(1);
  }

  const url = `${baseUrl}/api/quotes/batch?file=/INITIAL.txt`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[load-initial] ${res.status} ${res.statusText}: ${text}`);
    process.exit(1);
  }
  const json = await res.json();
  console.log(`[load-initial] Loaded from ${url}`);
  console.log(JSON.stringify(json));
}

main().catch((e) => {
  console.error('[load-initial] Error:', e.message || e);
  process.exit(1);
});


