#!/bin/sh
set -e

bun run --filter @pp/db db:migrate

exec "$@"
