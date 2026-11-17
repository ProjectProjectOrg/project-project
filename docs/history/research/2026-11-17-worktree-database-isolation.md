# Local worktree database isolation

Date: 2026-11-17. Research only; no resources provisioned or runtime behavior changed. Recommendations below are proposals, not architectural decisions. Online sources are primary documentation or first-party source; local observations describe this checkout.

## Recommendation

Use one database and one markdown root per worktree on a shared, explicitly identified local PostgreSQL 16 server. Build each fresh database from that worktree's migrations, then seed a small synthetic PM fixture. Keep Portless for HTTP naming, magic-link sign-in, explicit clean/prune, and the registry at `<git-common-dir>/pp-agent/registry.json`.

This is the simplest fit for trusted local development, with qualifications:

- A shared superuser gives collision avoidance, not a security boundary. Separate application roles can reduce accidental cross-database access, but agents with the shared administrator credentials or Docker access retain that power.
- Treat database, markdown, fixture identity, encryption secrets and any object-storage namespace as one environment. A database copy alone is not a PP snapshot.
- Serialize lifecycle operations and migrations for the same environment. Run one backend/workflow owner per environment.
- Never let worktree setup, stop or clean manage the existing shared Compose project's lifetime. Its database and MinIO volumes also hold other development data.
- Fail closed on incompatible migration or fixture history. Never silently reset user work when a checkout changes branches.

Use a container per worktree only for PostgreSQL version/extension/configuration experiments or stronger separation of server administration. Defer templates, dumps and branching products until measured fixture initialization time warrants them. No startup timings or resource benchmarks were performed.

## What the repository already does

| Evidence | Consequence |
| --- | --- |
| [Architecture](../../PROJECTPROJECT.md) and [glossary](../../../CONTEXT.md): human content is markdown; identity/access, statuses, integrations, indexes, outboxes and durable work are in PostgreSQL. | An org/project fixture needs both stores. An org is not an isolated backend instance. PM means the project role `pm`. |
| [Compose](../../../docker-compose.yml): fixed project `project-project`, container `projectproject-postgres`, `postgres:16-alpine`, port 5432, named `postgres_data`; similarly shared MinIO and `minio_data`. | Worktrees deliberately share infrastructure. Changing only the working directory does not isolate containers or volumes. Published ports are not explicitly loopback-bound. |
| [Test setup](../../../scripts/setup-test-db.ts) validates `projectproject_effect_v4_<16 hex>`, starts Compose, force-drops and recreates that database. [Root scripts](../../../package.json) generate a random name and attempt cleanup after tests. | Database-per-run is already established. The destructive helper is unsuitable for persistent worktree environments; abrupt process termination can bypass shell cleanup. Keep the test and persistent worktree namespaces separate. |
| [Migration entrypoint](../../../packages/db/src/migrate.ts), [folder resolver](../../../packages/db/src/migrations.ts), [Drizzle configuration](../../../packages/db/drizzle.config.ts), [DB wiring](../../../packages/db/src/live.ts). | `DATABASE_URL` selects the database. Migrations come from the current checkout; the CLI loads the root `.env`, so explicit worktree environment precedence must be verified rather than assumed. |
| [Migration fixture](../../../packages/db/src/migrationFixture.ts) creates a derived database, migrates to a historical boundary, inserts SQL and applies remaining migrations. | Historical upgrade testing already uses databases rather than schemas. Child databases also need lifecycle ownership if setup ever reuses this mechanism. |
| [Initial migration](../../../packages/db/src/migrations/20260502140613_closed_bill_hollister/migration.sql), [Jira workflow migration](../../../packages/db/src/migrations/20260922120000_jira_effect_workflow/migration.sql), [rank migration](../../../packages/db/src/migrations/20261112125538_ticket_rank/migration.sql). | History contains DDL and data evolution, not just table creation. Reusing a newer database with older code is unsafe to infer from a successful connection. |
| [Backend boot](../../../apps/backend/src/main.ts) composes library migration, rank backfill, activity recovery, Slack/Everhour runtimes, index reconciliation, attachment reaping and feedback dispatch. [Runtime](../../../apps/backend/src/runtime.ts) supplies integrations and Jira workflows. | Whole-instance workers can mutate data without a browser request. Each process must receive the same isolated configuration before imports initialize pools/auth. |

The [Jira harness guide](../../integrations/jira-harness.md), [browser harness](../../../apps/backend/scripts/jira-browser-harness.ts) and [load harness](../../../apps/backend/scripts/jira-load-harness.ts) are useful precedents, not a generic environment manager. Browser setup validates exactly port 55432/database `projectproject_effect_v4_t172_browser`, port 59000/bucket `projectproject-t172-local-browser`, and loopback binding. It sets a checkout-relative `.tmp/jira-browser-projects` root, fixed frontend origin, synthetic secrets, Jira transport/token fixtures, then migrates and creates the bucket. It does not seed a general PM environment. The load harness expects an existing owner with a Jira connection. Two checkouts can have distinct harness markdown roots yet still collide on its fixed database/bucket.

## Comparing the options

These are qualitative judgments for PP, not benchmark results. Snapshot methods are provisioning choices layered on top of database/container isolation.

| Choice | Migration and worker isolation | Cost and limits | Fit |
| --- | --- | --- | --- |
| Database per worktree, shared server | Each connection selects its database; application and migration tables are separate. | Shares server version, roles, WAL, memory, disk, connection limits and failure domain. | Recommended default. Existing DB wiring needs no schema-routing redesign. |
| Schema per worktree, shared database | Requires all pools, auth, migrations and SQL workflow tables to use the intended schema. | Search-path mistakes and explicit schema names escape the partition; database-scoped facilities remain shared. | More configuration and auditing for weaker separation. |
| Container per worktree | Independent PostgreSQL server/catalogs and worker tables; can vary server versions. | Ports, health checks, container names, volumes, image compatibility and memory/process overhead per worktree. | Escape hatch for server-level experiments. |
| Template database | New database copied from a quiescent prepared source. | Same cluster; source must have no sessions. Does not copy markdown or database ACL/settings. Cache invalidation required. | Later optimization for a proven slow fixture. |
| Dump/restore | Portable logical provisioning into a fresh target database. | Export/import time and paired file snapshot management; roles are separate. | Useful for curated reproductions or migration fixtures. |
| Local branching tool | Depends on backend: template databases or separate containers/filesystem clones. | Adds its own lifecycle/state and still does not know PP's markdown/fixtures. | No demonstrated need for another control plane. |

PostgreSQL distinguishes cluster-level objects (including roles) from databases and their schemas. A connection accesses one database; separate databases still share WAL and server administration. This supports the database boundary for unrelated environments, without implying independent server resources. [PostgreSQL database overview](https://www.postgresql.org/docs/16/manage-ag-overview.html).

Schemas are namespaces inside one database. Unqualified names use `search_path`; adding a writable schema to that path trusts its creators. A per-schema setup would need every connection initialized correctly and no fallback to another worktree's schema. [PostgreSQL schemas](https://www.postgresql.org/docs/16/ddl-schemas.html).

The pinned [Drizzle version](../../../packages/db/package.json) is `1.0.0-rc.5`. Its [node-postgres migrator](https://unpkg.com/drizzle-orm@1.0.0-rc.5/node-postgres/migrator.js) delegates to the [async PostgreSQL session migrator](https://unpkg.com/drizzle-orm@1.0.0-rc.5/pg-core/async/session.js). The latter defaults history to `drizzle.__drizzle_migrations`, reads applied history and computes pending work before opening the transaction that runs SQL and records it; this function contains no migration advisory lock. PP supplies only `migrationsFolder`. Consequently, setting an application `search_path` alone would leave migration history shared. A schema design must configure history too and audit the workflow engine's runtime-created tables. Database-per-worktree avoids that work.

### Concurrency and permissions

Different worktree databases can migrate concurrently: their ordinary relation locks concern different objects. Shared catalogs and server resources can still contend. PostgreSQL exposes database-qualified relation locks and shared-object locks; this is not a promise of zero interference. [Lock catalog](https://www.postgresql.org/docs/16/view-pg-locks.html).

For one database, enforce one lifecycle/migration owner before reading history, and keep its backend stopped during incompatible DDL. A migration transaction does not by itself prevent two launchers selecting the same pending work. A session advisory lock on a dedicated connection is one possible database-side mechanism; transaction locks are a different lifetime. Every caller must cooperate. [PostgreSQL locking](https://www.postgresql.org/docs/16/explicit-locking.html). A local lifecycle lock can suffice for the first version if all supported launch/migration entrypoints use it; direct `db:migrate` remains a documented bypass.

The Docker image creates `POSTGRES_USER` with superuser power on an empty data directory. Existing volumes retain their initialized state, so verify actual privileges during implementation rather than assuming current environment variables describe them. [Official Postgres image](https://hub.docker.com/_/postgres). PostgreSQL superusers bypass permission checks; a different database name does not constrain such a credential. [Role attributes](https://www.postgresql.org/docs/16/role-attributes.html).

If accidental cross-access protection is required, propose one non-superuser owner/login per worktree, without `CREATEDB`, `CREATEROLE` or memberships in other owners. Provisioning retains a separate administrator credential. New databases grant `CONNECT`/`TEMPORARY` to `PUBLIC` by default, so database ACLs must be explicit. Do not change privileges on the daily-driver database as a side effect. [PostgreSQL privileges](https://www.postgresql.org/docs/16/ddl-priv.html). This protects cooperating application connections; it does not sandbox an agent that can read admin credentials, access sibling files or control Docker.

### Templates, restore and branching tools

`CREATE DATABASE ... TEMPLATE` requires a disconnected source, runs outside a transaction, and does not inherit database-level permissions/settings. It creates another database in the same cluster, not a cross-version clone. If later adopted, use an immutable, disconnected synthetic fixture database, serialize template build/publication, and apply target ownership/ACL/settings separately. Ordinary creation from a pristine template remains simpler initially. [CREATE DATABASE](https://www.postgresql.org/docs/16/sql-createdatabase.html).

`pg_dump` produces a consistent database snapshot during concurrent use, but includes neither markdown nor cluster-global roles. Its client cannot dump a newer server major than it supports; moving data backward to older servers is not guaranteed. [pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html). For PP, quiesce the backend before taking a paired DB/file snapshot, or use deterministic fresh seeds. Restore into a precreated target and avoid `--create`: that option restores to the database name embedded in the archive. Stop on errors; `--single-transaction` can make a compatible restore all-or-nothing. [pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html).

Two genuinely relevant local tools were examined:

- [pgbranch (clement-tourriere)](https://github.com/clement-tourriere/pgbranch) offers template mode and local Docker/filesystem copy-on-write mode, including APFS. Its README says local cloning pauses the parent container before copying and uses a full copy where filesystem support is absent. Its Git hooks and database lifecycle do not coordinate PP markdown, permissions fixtures, auth or workers. These are maintainer-described capabilities, not verified here.
- [DBLab](https://postgres.ai/docs/dblab-howtos/administration/install-dle-manually) targets thin clones with additional Docker/storage infrastructure such as ZFS. That is relevant to large, realistic database copies; a small synthetic PM fixture supplies no evidence that this infrastructure pays for itself.

Neither removes the need for PP's registry and paired-store lifecycle. Do not adopt or install either now. Cloud branches are outside this local-only requirement.

## Whole-instance state and fixture correctness

The [workflow engine](../../../apps/backend/src/workflows/WorkflowEngine.ts) uses `SingleRunner.layer({ runnerStorage: "sql" })`; [Jira workflow composition](../../../apps/backend/src/jira/WorkflowRuntime.ts) shares it. The harness guide explicitly permits one harness process per database. Use one backend owner per worktree database, including any headless harness; never run an old branch's worker against a new branch's database. An org slug is insufficient because engine state, polling, recovery and reconciliation operate within the backend's configured stores.

Recommended fixture contract:

1. Create a fresh database, migrate it, and allocate an empty owned markdown root. Use a synthetic user with stable fixture identity/email, org membership and an explicit `pm` membership on the fixture project. Magic-link login must resolve that same identity; an org owner alone does not guarantee project content-editing permissions. See [access model](../../PROJECTPROJECT.md#access).
2. Create project, statuses, tags, library definitions, tickets and sprints through existing domain write paths where practical. Keep frontmatter user IDs, project keys, ticket IDs, assignees, ranks and indexes consistent. SQL-only seeding of ticket indexes misses the authoritative files; copying files alone misses access/configuration.
3. Mark the fixture complete only after both stores validate. A database transaction cannot roll back file writes. Interrupted initial seeding can be rebuilt as a pair while still unpublished; never rerun an overwrite seed against a ready environment with edits.
4. Default to synthetic data without external connections, tokens, SMTP, webhooks, pending outboxes or live feedback destinations. Copying a live database can resume outbound work even if no one opens the UI. Jira's in-process transport replacement demonstrates a deliberate fixture boundary, not a blanket integration stub.
5. If attachments/images are included, allocate a worktree-owned bucket or a genuinely supported isolated storage namespace, with matching DB configuration and encryption key. Do not copy the daily-driver storage credentials. A metadata row pointing at missing/shared objects is not a complete fixture. The simplest first fixture can omit object storage and state that limitation.

Retain fixture version plus migration fingerprint in environment metadata. If snapshot caching is later justified, its key must also cover fixture source, PostgreSQL major and markdown format. Never clone an actively changing markdown tree using hardlinks: writes would share files. A filesystem copy/reflink must preserve independent subsequent writes.

## Portless and magic links

Portless supplies named local HTTP URLs and allocated application ports; it does not route PostgreSQL connections or select a database. Its current README describes HTTPS defaults, certificate trust setup, a `PORT` environment variable, explicit names and worktree-derived names. It is pre-1.0, so pin and verify the chosen version. Use an explicit environment-ID-derived hostname: branch suffixes can collide and branch names can change. [Portless first-party README](https://raw.githubusercontent.com/vercel-labs/portless/main/README.md).

Keep browser API/auth requests on the same worktree origin through the frontend proxy. [Vite configuration](../../../apps/frontend/vite.config.ts) currently defaults proxy traffic to localhost:3000 and has a Jira-specific override. [Auth configuration](../../../apps/backend/src/auth/config.ts) reads `BETTER_AUTH_URL`, includes it in trusted origins, and prints magic links. Set the exact public origin before importing auth; route `/api`, `/mcp` and `/.well-known/` to the matching backend. Use independent environment secrets and host-scoped cookies; avoid a shared parent-domain cookie. Verify redirects, secure cookies and proxy headers against the pinned Portless version during implementation. The Jira harness's fixed frontend origin/callback validation needs explicit adaptation, not guard removal.

## Registry, interruption and cleanup

The proposed common-directory registry is appropriate: all worktrees of one repository can find it, and it stays outside tracked project content. Resolve it with `git rev-parse --path-format=absolute --git-common-dir`, not by appending to `.git` (a linked worktree has a `.git` file). [git-rev-parse](https://git-scm.com/docs/git-rev-parse). Use `git worktree list --porcelain -z` for membership checks; Git's prune only cleans Git administrative metadata, not PP databases. Locked/temporarily unavailable worktrees need special care. [git-worktree](https://git-scm.com/docs/git-worktree).

Proposed minimal lifecycle, to settle before implementation:

- Assign a random opaque environment ID, record the canonical worktree location and repo ownership identity, and derive a conservative database name from that ID. Branch names are display metadata. Separate clones have separate common directories, so names must not rely on a repo-local sequence. Keep filesystem and SQL identifier validation independent.
- Serialize registry read/modify/write with a sibling lock. Atomic file replacement prevents partial JSON reads but not lost updates. For a first local version, one registry lifecycle lock is simpler than multiple locks; it serializes setup across worktrees but does not prevent their backends running concurrently. Narrow its scope only if actual setup delays justify it.
- Exclusive lockfile creation can use `wx`; that fails if the file exists. It is not an automatically released OS lock, and network filesystems have caveats. Record owner PID, host and an ownership token; do not steal it solely because a timeout elapsed or a PID happens to exist. Fail closed on uncertain ownership, with explicit stale-lock recovery. [Node filesystem documentation](https://nodejs.org/api/fs.html#file-system-flags).
- Reserve an entry in `provisioning` before creating external resources. Persist exact database/server identity, markdown root and ownership marker; record fixture/migration version and any bucket. Publish `ready` only after validation. Use temp-file replacement in the same directory; do not store login tokens or admin secrets in the JSON.
- On restart, reconcile recorded and actual resources. A crash after database creation but before publication must leave a recognizable pending entry. An unexpectedly existing database is not permission to drop or adopt it. Corrupt/missing registry data is not permission to delete by prefix.
- Serialize clean against setup/start. Mark `deleting`, stop only the owned backend/worker processes, close pools, then delete only recorded, verified resources. Persist partial progress and remove the registry entry last. PID alone is insufficient to identify a process after reuse; retain/check its start identity and launch ownership.
- Prune should first report candidates and reasons. Worktree disappearance or age alone is insufficient: check Git registration, locks, process ownership, pending lifecycle state and resource markers. Keep uncertain entries for explicit repair. Orphans with no trustworthy ownership evidence are report-only. A moved worktree needs identity reconciliation, not automatic destruction.

`DROP DATABASE` cannot run inside a transaction or while connected to that target. `FORCE` tries to terminate eligible sessions but can still fail with prepared transactions or replication resources. Stop the environment first; never terminate all sessions on the shared server. [DROP DATABASE](https://www.postgresql.org/docs/16/sql-dropdatabase.html).

Clean must not call the current Compose `down`, `down -v`, a volume prune, or shared Postgres stop. Project names group Compose resources, and explicit container names still collide even if a different project name is chosen. A container-per-worktree alternative therefore needs its own names, ports and volumes. [Compose project names](https://docs.docker.com/compose/how-tos/project-name/). Named volumes normally survive `down`; `down -v` removes declared named volumes. For the recommended shared server, dropping one owned database releases its logical storage while the shared volume remains. [Compose down](https://docs.docker.com/reference/cli/docker/compose/down/). Container-based environments must likewise retain volumes on stop and remove only owned volumes on explicit clean.

## Version skew and decision points

Compare the current checkout's ordered migration names/content hashes against the applied environment manifest before startup. Compatible append-only history can migrate forward while stopped. Missing, changed or divergent applied migrations should block startup and offer explicit rebuild of the database/markdown pair. Record successful state after migration. Do not use commit SHA alone: unrelated commits need not invalidate a fixture, while edited migration contents must. Also validate fixture/markdown format compatibility because boot migrations can rewrite files independently of SQL history.

All databases in a shared server use its one PostgreSQL version. A branch requiring a different major, server extension binary or global setting needs a separate instance. Never let a branch's changed Compose image upgrade the shared volume. PostgreSQL major upgrades require a supported migration process rather than arbitrary data-directory reuse. [PostgreSQL upgrading](https://www.postgresql.org/docs/16/upgrading.html).

**Concise recommendation:** retain Portless + per-worktree database/markdown + PM fixture + magic links + explicit clean/prune + common-dir registry. Start with fresh migrations and deterministic seeding. Add ownership checks, lifecycle serialization, version validation and one backend owner. Do not add schema routing, snapshot caches or a branching product initially.

**Unresolved decisions:**

1. Shared existing development server with strict lifecycle exclusion, or a single additional agent-only shared server? The latter protects the daily-driver server's operational lifetime at the cost of one more instance; neither is per-worktree container infrastructure.
2. Accept shared-superuser collision isolation initially, or provision per-worktree non-superuser application roles now? Do not describe either as an agent sandbox.
3. PM fixture contents and identity, and whether attachments are required in the first fixture. Omission avoids mandatory bucket provisioning.
4. Confirm a global local lock/recovery contract and explicit ownership markers. Define clean/prune authorization and moved-worktree handling before exposing destructive commands.
5. Choose the Portless version and public hostname policy; define explicit rebuild behavior for incompatible SQL/markdown history. No automatic destructive reset.
