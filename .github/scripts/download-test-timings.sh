#!/usr/bin/env bash
# Every shard reads the timings of the same main run, the last one that
# passed before this run started, so all shards split the files alike.
set -euo pipefail
created=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" --jq .created_at)
source=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=30" \
  --jq "[.workflow_runs[] | select(.updated_at < \"$created\")][0].id // empty")
count=0
if [ -n "$source" ]; then
  count=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$source/artifacts" \
    --jq '[.artifacts[] | select(.name | startswith("test-timings-"))] | length')
fi
echo "Timings from run ${source:-none}: $count artifacts"
if [ "$count" -gt 0 ]; then
  gh run download "$source" --pattern 'test-timings-*' --dir "$RUNNER_TEMP/timings"
  mkdir -p .cache/test-timings
  for file in "$RUNNER_TEMP"/timings/*/*.json; do
    cp "$file" ".cache/test-timings/$(basename "$(dirname "$file")").json"
  done
fi
