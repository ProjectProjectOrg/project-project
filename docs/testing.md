# Test runtimes and isolation

Read before changing test configuration or moving a test between isolated and shared workers. What to test lives in `AGENTS.md`.

Server-core reuses a worker for tests that do not depend on fresh module state. Tests that mock modules, mutate process environment or globals, or require fresh module configuration belong in `isolatedTests` in `packages/server-core/vite.config.ts`. Keep database files serialized. When changing this split, run the full server-core suite with at least two shuffled file-order seeds (`--sequence.shuffle.files --sequence.seed=<seed>`); use file-only shuffling for this check because some existing database suites share state between tests. Root-level filters use `--project "server-core*"` to include both groups.

Frontend tests default to Node with per-file isolation. `domTests` in `apps/frontend/vite.config.ts` selects hooks, editor, upload, storage, and other browser-dependent tests for isolated jsdom. The HTTP test fixture supplies a URL origin when Node has no `location`; do not add DOM shims for tests that belong in jsdom. Root-level filters use `--project "frontend*"` to include both groups.

Shared and database tests reuse their workers. Keep their process globals and module state clean, scope database resources, and validate changes with two shuffled file-order seeds. Backend Vitest uses shorter cluster polling intervals; real retry delays, restart boundaries, and production polling settings stay unchanged.

Package test scripts use Bun to run Vitest for backend, database, shared, access, and the frontend Node project. Frontend jsdom and server-core remain on Node. Use `bun run test:all` for the CI runtime selection; a direct root Vitest invocation uses the runtime that launched it. Keep runtime comparisons on unchanged tests and verify failure exit codes as well as passing results.
