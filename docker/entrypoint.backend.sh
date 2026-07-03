#!/bin/sh
set -e

echo "[entrypoint] applying database migrations"
(cd /app/packages/backend && bun run db:migrate)

echo "[entrypoint] migrations applied, starting server"
exec "$@"
