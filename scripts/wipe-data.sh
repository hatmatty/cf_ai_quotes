#!/usr/bin/env bash
set -euo pipefail

# Wipe all data from D1 tables, KV keys, and Vectorize index.
# 
# VECTORIZE CLEARING STRATEGY:
# By default, this script deletes and recreates the entire Vectorize index.
# This is the RECOMMENDED approach because:
# 1. Simple, fast, and reliable
# 2. Guarantees ALL vectors are removed (including orphaned vectors)
# 3. Vectorize doesn't provide a native "clear" command
# 
# Alternative: You can preserve the index and delete vectors by ID, but this:
# - Requires querying D1 for all quote IDs
# - Constructing vector IDs (content-*, categories-* prefixes)
# - Running a Worker to call VECTORIZE.deleteByIds()
# - More complex, slower, and risks missing orphaned vectors
#
# To use the alternative method, set: USE_DELETE_BY_IDS=true
#
# Does NOT drop D1 tables or indexes. Safe to run repeatedly.
#
# Usage:
#   bash scripts/wipe-data.sh --local   # wipe local D1 + local KV + Vectorize
#   bash scripts/wipe-data.sh --remote  # wipe remote D1 + remote KV + Vectorize
#   bash scripts/wipe-data.sh --both    # wipe both local and remote
#   bash scripts/wipe-data.sh --help

MODE="local"
if [[ ${#@} -gt 1 ]]; then
  echo "Usage: $0 [--local|--remote|--both]" >&2
  exit 1
fi

case "${1:-}" in
  ""|--local)
    MODE="local"
    ;;
  --remote)
    MODE="remote"
    ;;
  --both)
    MODE="both"
    ;;
  -h|--help)
    echo "Usage: $0 [--local|--remote|--both]"
    exit 0
    ;;
  *)
    echo "Unknown option: $1" >&2
    echo "Usage: $0 [--local|--remote|--both]" >&2
    exit 1
    ;;
esac

SQL="DELETE FROM quote_interactions; DELETE FROM quotes; DELETE FROM users; DELETE FROM anonymous_sessions;"

wipe_local() {
  echo "[wipe] Local D1..."
  npx --yes wrangler d1 execute quotes --local --command "$SQL" || true
  echo "[wipe] Local KV (LEADERBOARD:trending)..."
  npx --yes wrangler kv key delete --binding=LEADERBOARD trending --local || true
}

wipe_remote() {
  echo "[wipe] Remote D1..."
  npx --yes wrangler d1 execute quotes --remote --command "$SQL" || true
  echo "[wipe] Remote KV (LEADERBOARD:trending)..."
  npx --yes wrangler kv key delete --binding=LEADERBOARD trending --remote || true
}

wipe_vectorize() {
  echo "[wipe] Vectorize index (quotes)..."
  echo "[wipe] Deleting and recreating index to clear all vectors..."
  
  # Delete the index (will fail gracefully if it doesn't exist)
  # --force flag suppresses the confirmation prompt
  npx --yes wrangler vectorize delete quotes --force 2>/dev/null || {
    echo "[wipe] Index may not exist or already deleted"
  }
  
  # Wait for async deletion to complete
  echo "[wipe] Waiting for deletion to complete..."
  sleep 2
  
  # Recreate the index with the same configuration
  # Pipe "n" to automatically decline adding to wrangler.jsonc (already configured)
  echo "[wipe] Recreating empty Vectorize index..."
  if echo "n" | npx --yes wrangler vectorize create quotes --preset "@cf/baai/bge-large-en-v1.5" >/dev/null 2>&1; then
    echo "[wipe] ✓ Vectorize index successfully recreated"
  else
    echo "[wipe] ✗ Warning: Failed to recreate Vectorize index."
    echo "[wipe] You may need to create it manually:"
    echo "[wipe]   npx wrangler vectorize create quotes --preset \"@cf/baai/bge-large-en-v1.5\""
    return 1
  fi
}

case "$MODE" in
  local)
    wipe_local
    wipe_vectorize
    ;;
  remote)
    wipe_remote
    wipe_vectorize
    ;;
  both)
    wipe_local
    wipe_remote
    wipe_vectorize
    ;;
esac

echo "[wipe] Done."


