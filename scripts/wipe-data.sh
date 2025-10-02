#!/usr/bin/env bash
set -euo pipefail

# Wipe all data (rows only) from D1 tables and clear the leaderboard KV key.
# Does NOT drop tables or indexes. Safe to run repeatedly.
#
# Usage:
#   bash scripts/wipe-data.sh --local   # wipe local D1 + local KV
#   bash scripts/wipe-data.sh --remote  # wipe remote D1 + remote KV
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

case "$MODE" in
  local)
    wipe_local
    ;;
  remote)
    wipe_remote
    ;;
  both)
    wipe_local
    wipe_remote
    ;;
esac

echo "[wipe] Done."


