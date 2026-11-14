#!/usr/bin/env bash
# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
# Publish $LLSN_DATA_DIR/out/heavy (heavy origin: cube, layers, map) to the Cloudflare Pages project
# aeroinformagicos-llsn-data (decision D-45), with a `_headers` file that opens CORS, and write its URL
# as heavy_base_url in web/public/config.json. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in
# the environment (never in the repository). DRY_RUN=1 lists the files and `_headers` and uploads nothing.
set -euo pipefail
cd "$(dirname "$0")/.."
node ops/tasks.mjs deploy-heavy
