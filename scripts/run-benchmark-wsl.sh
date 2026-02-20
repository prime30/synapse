#!/usr/bin/env bash
# Run the Cursor-only benchmark under WSL. Use from WSL in the project root.
#
# This script runs ONLY the Cursor contender and merges into the latest v2-bench-*.json.
# Synapse and Baseline results appear on the benchmarks page only if they exist in that file
# (from a previous full run). To get Synapse + Baseline + Cursor for all scenarios, run the
# full benchmark once (from WSL, no .env.benchmark):
#   rm -f .env.benchmark; RUN_LIVE_AGENT_TESTS=true BENCHMARK_CURSOR_ONLY=0 CURSOR_PRODUCTION=1 npm run test:run -- tests/integration/v2-live-benchmark.test.ts
# (Requires ANTHROPIC_API_KEY in .env.local; can take many hours.)
#
# Recommended: run from Cursor's integrated terminal with WSL (e.g. "bash scripts/run-benchmark-wsl.sh")
# so the Cursor CLI streams output and env/flags are applied correctly.
#
# If Synapse (Next.js app) keeps hard-reloading during the run, start the app with file watching disabled:
#   DISABLE_FILE_WATCHER=1 npm run dev
# (Restart dev after the benchmark if you need local sync again.)
#
# Prereqs (one-time in WSL):
#   curl https://cursor.com/install -fsS | bash   # install Cursor CLI
#   export PATH="$HOME/.local/bin:$PATH"          # or wherever install put 'agent'
#
# Then (from project root in WSL):
#   bash scripts/run-benchmark-wsl.sh
#
# If you see "bash\r: No such file or directory", fix line endings once:
#   sed -i 's/\r$//' scripts/run-benchmark-wsl.sh
# (chmod is not needed and often fails on /mnt/c.)

set -e
cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

# 1. Reset theme to default
echo "== Resetting theme-workspace to default..."
git checkout -- theme-workspace/
rm -f theme-workspace/sections/announcement-bar-custom.liquid \
      theme-workspace/sections/main-product-legacy.liquid \
      theme-workspace/sections/product-add-to-cart.liquid \
      theme-workspace/sections/product-description.liquid \
      theme-workspace/sections/product-gallery.liquid \
      theme-workspace/sections/product-layout.liquid \
      theme-workspace/sections/product-variants.liquid \
      theme-workspace/snippets/product-setup.liquid \
      theme-workspace/snippets/product-variant-sync.liquid \
      theme-workspace/templates/product.modular.json

# 2. CURSOR_API_KEY is read by the test from .env.local (no need to export here).

# 3. Optional: prime index (comment out if not needed)
# echo "== Priming Cursor index (2 min)..."
# npm run cursor:index || true

# 4. Run Cursor-only benchmark (3 runs per scenario, merge)
#    WSL often invokes Windows npm, so env vars don't reach Node. Write .env.benchmark for the test to load.
echo "== Running Cursor-only benchmark (3 runs per scenario, merge)..."
BENCH_ENV="$PROJECT_ROOT/.env.benchmark"
# Per-run timeout: 30 min so indexing + run can finish on slow/WSL runs. Edit here or set in .env.local to raise (e.g. 45).
printf 'RUN_LIVE_AGENT_TESTS=true\nCURSOR_PRODUCTION=1\nBENCHMARK_CURSOR_ONLY=1\nBENCHMARK_RUNS_PER_PROMPT=3\nCURSOR_RUN_TIMEOUT_MIN=30\nCURSOR_NO_OUTPUT_FAIL_MIN=30\n' > "$BENCH_ENV"
trap 'rm -f "$BENCH_ENV"' EXIT
npm run test:run -- tests/integration/v2-live-benchmark.test.ts

echo ""
echo "Done. Results: lib/benchmarks/latest-results.json"
