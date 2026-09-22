# ProjectProject

A markdown-first project management tool, built as a vehicle for learning Effect deeply.

The full spec lives in [`docs/PROJECTPROJECT.md`](docs/PROJECTPROJECT.md). The chapter-by-chapter learning material lives in [`docs/chapters/`](docs/chapters/). The teaching workflow that governs how this repo evolves lives in [`CLAUDE.md`](CLAUDE.md).

## Layout

```
projectproject/
├── package.json              # Bun workspaces root
├── tsconfig.base.json        # Shared compiler options
├── docs/
│   ├── PROJECTPROJECT.md     # The spec
│   └── chapters/             # Learning material + exercises
├── apps/
│   ├── backend/              # Bun HttpApi server, services, db
│   └── frontend/             # React SPA, atoms, routes
├── packages/
│   ├── shared/               # HttpApi contract + Schemas + tagged errors
└── data/                     # Markdown source of truth (gitignored)
```

## Prerequisites

- Node.js 24.15.0 (`.node-version`) — frontend tooling runs on Node; `engines`
  accepts `^22.18.0 || >=24.11.0`.
- [Bun](https://bun.sh) 1.3.13 (`packageManager`) — installs dependencies and
  runs the backend.
- Docker with Compose — provides local Postgres for development and creates an
  isolated database for each `bun run test`. The test suite needs no `.env`.

## Getting started

```bash
bun install
```

Install runs `effect-tsgo patch`, which patches TypeScript 7 so both
command-line typechecks and the native editor language service report Effect
diagnostics. Install the recommended TypeScript native preview extension and
select the workspace TypeScript version when prompted.

```bash
bun run dev           # Postgres, then backend + frontend in parallel
bun run check         # Format, lint, and typecheck
bun run test          # Backend, frontend, and shared suites
bun run build         # Frontend production build
```

`bun run dev` waits for the Postgres container to report healthy
(`docker compose up --wait`), then runs the frontend (`vite`) and backend
(`bun --watch`) dev scripts in parallel. Postgres stays up after you exit;
stop it with `bun run dev:stop`.

## Tooling

Bun, Turborepo, and the standalone frontend tools split the work:

| Concern                                  | Tool                                             |
| ---------------------------------------- | ------------------------------------------------ |
| Dependencies, workspaces, lockfile       | Bun (`bun.lock`)                                 |
| Backend runtime and watcher              | Bun (`bun --watch src/main.ts`)                  |
| Script running, filtering, caching       | Turborepo                                        |
| Dev server and production build          | Vite                                             |
| Tests                                    | Vitest 4.1.11                                    |
| Lint and format                          | Oxlint and Oxfmt                                 |
| Typecheck                                | TypeScript 7 patched with `@effect/tsgo`         |

`turbo.json` owns the task graph and cache policy. Root `vitest.config.ts`
owns the test projects (`apps/*/vite.config.ts` and
`packages/*/vite.config.ts`, four workers). `.oxlintrc.json` and
`.oxfmtrc.json` own lint and format policy. Each workspace's `vite.config.ts`
owns its root, plugins, build, and named test project. The workspace-only lint
rule lives in `tools/oxlint-plugin-workspace.js`.

Run one suite with `bunx vitest run --project backend` (or `db`,
`server-core`, `frontend`, or `shared`), and
`bun run --cwd apps/backend test:watch` for backend watch mode.
`bun run lint:fix` and `bun run format` apply fixes.

Lint severities: `correctness` is an error, `suspicious` and `perf` warn, and
the React compiler rules (`refs`, `set-state-in-effect`, `immutability`,
`static-components`) warn. Formatting skips generated Drizzle snapshots,
`routeTree.gen.ts`, the vendored Everhour schema, and markdown.

Turborepo runs one `tsc --noEmit` per workspace through the patched
TypeScript 7, preserving the Effect diagnostics configured in
`tsconfig.base.json`. The frontend's typecheck compiles Paraglide messages
first, and the Paraglide Vite plugin does the same for dev, build, and test.

Every Effect package, `@effect/vitest` included, is pinned to
`4.0.0-rc.112`. Upgrade the Vitest pin and rerun the full suite.

Frontend tests run in forked workers with Node's native web storage disabled,
so jsdom supplies browser-local storage.

CI installs Node and Bun explicitly, then runs `bun install --frozen-lockfile`
followed by `bun run check`, `test`, and `build`. The Docker images build on
`node:24.15.0-bookworm-slim` with the Bun binary copied in for installs; the
backend runtime image is `oven/bun:1.4.2-slim`.

The setup follows [T3 Code's tooling layout](https://github.com/pingdotgg/t3code),
with Bun retained for this project's runtime and package manager.

## Bootstrapping a fresh instance

ProjectProject is **invite-only**. There is no public "first user creates the
org" flow, and org creation stays gated (`allowUserToCreateOrganization: false`
in `apps/backend/src/auth.ts`). A fresh instance is seeded once, then grows
by invitation.

1. **Seed the first org + owner.** Set the `BOOTSTRAP_*` values in `.env` (see
   [`.env.example`](.env.example) — org slug/name and the owner's email, name,
   and optional username), then run the seeding script:

   ```bash
   bun --filter @pp/backend run bootstrap:org
   ```

   It creates the organization, the owner identity, and their `owner`
   membership. The command is repeat-safe: re-running reports the existing
   records instead of creating duplicates. Use the same email the owner will
   sign in with (magic link or Google).

2. **Owner signs in and invites the team.** The owner signs in with the
   configured email, opens org settings → members, and invites teammates by
   email.

3. **Invited users land from their invite.** Each invitation produces a link
   (`/invite/<invitationId>`, logged by `sendInvitationEmail`). Opening it
   sends a signed-out user through login (with the invite preserved) and then
   drops them on a focused accept screen; accepting sets the invited org active
   and lands them inside it. Signed-in users can also review every pending
   invitation at `/welcome`. Invites match on email, so members sign in with the
   address they were invited under.

For production and Docker specifics (running the seed inside the container,
migrations, reverse proxy) see [`docs/deploy.md`](docs/deploy.md).

## Conventions

- **Effect v4 release candidate.** Core APIs come from `effect`; HTTP, SQL, and atom modules live under `effect/unstable`. See [the migration handoff](docs/migrations/effect-v4-handoff.md).
- **The shared package is the contract.** Endpoints declared in `packages/shared/src/api.ts` drive both the backend implementation and the frontend's typed client.
- **Markdown is the source of truth.** Postgres holds only auth + a thin project index; everything else lives under `data/projects/`.
