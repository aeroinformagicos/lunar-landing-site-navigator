#!/usr/bin/env bash
# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
# Publish web/dist (app + light data origin) to Cloudflare Pages. Needs CLOUDFLARE_API_TOKEN
# and CLOUDFLARE_ACCOUNT_ID in the environment (never in the repository).
set -euo pipefail
cd "$(dirname "$0")/.."
node ops/tasks.mjs deploy
