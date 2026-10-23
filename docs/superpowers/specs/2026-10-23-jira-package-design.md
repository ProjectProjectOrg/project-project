# Jira package conversion — architecture proposal

Date: 2026-10-23. Status: accepted; implementation in progress.

## Recommendation

Extract `@pp/integration-jira` as the owner of Jira authentication, capture, conversion, mapping and durable migration control flow. Supply PP publication, cleanup, storage and encryption through backend adapters. Reuse the existing workflow/activity interfaces instead of introducing a general importer framework or a large host that repeats them.

The main seam is a versioned prepared publication plus attachment outcomes, followed by a finalized publication plan and verification receipt. Keep all destination writes behind the backend adapters. Keep the final visibility flip and migration success in one PostgreSQL transaction.

Unlike GitHub and Figma, no production core module outside the Jira directory consumes Jira. There is no reason to retain a permanent Jira port in core. Core supplies its existing PP capabilities to the backend; the backend composes those with the integration package.

## Baseline and scope

Inspected worktree: `1a9cb3082e861a4645c434c55fa3e81fb5ad9b0e`. Compared the Jira directory and Jira backend routes with fetched main `9138ae3f54d022e74eaca727de8596cab04c0716`: no differences. Runtime/schema changes between those trees are from the merged Everhour extraction and do not alter Jira's current flow. Implement from latest main when authorized.

This proposal complements the existing [T-172 durable migration design](2026-09-22-t172-effect-jira-migration-design.md). It changes ownership, not that workflow's recovery model. The [new provider research](../../jira-package-research.md) revalidates the relevant Atlassian contracts; the [earlier research](../../jira-cloud-migration-research.md) remains background context.

No source code, tests, configuration, live services or databases were changed or executed for this investigation. The only outputs are research/design documents and a diagram.

## What the code already provides

| Module | Existing behavior | Extraction implication |
| --- | --- | --- |
| [Client](../../../packages/integration-jira/src/Client.ts), [OAuth](../../../packages/integration-jira/src/OAuth.ts), [Credentials](../../../packages/integration-jira/src/Credentials.ts) | Typed requests, enhanced search and sprint cursors, raw/decoded responses, streamed attachments, user-bound OAuth state, encrypted rotating credentials and DB refresh leases | Provider behavior belongs together. Preserve the real transport/token-endpoint injection seams and crypto adaptation. |
| [Scan](../../../packages/integration-jira/src/Scan.ts), [ScanV2](../../../packages/integration-jira/src/ScanV2.ts), [Manifest](../../../packages/integration-jira/src/Manifest.ts), [Adf](../../../packages/integration-jira/src/Adf.ts) | Raw/normalized capture, versioned manifests, source references, conversion diagnostics and category coverage | Keep this source knowledge inside the package. Raw artifacts and fidelity warnings have recovery value. |
| [Mappings](../../../packages/integration-jira/src/Mappings.ts), [Preflight](../../../packages/integration-jira/src/Preflight.ts), [PublicationPlan](../../../packages/integration-jira/src/PublicationPlan.ts), [Report](../../../packages/integration-jira/src/Report.ts) | Explicit mapping/restriction decisions, deterministic identities, frozen preparation, attachment outcomes, two-pass rewriting, document/index plans and provenance reports | Most logic is already data-oriented. Isolate its two core formatting dependencies without copying PP's codecs. |
| [MigrationWorkflow](../../../packages/integration-jira/src/MigrationWorkflow.ts), [MigrationActivities](../../../packages/integration-jira/src/MigrationActivities.ts), [MigrationProjection](../../../packages/integration-jira/src/MigrationProjection.ts), [Migrations](../../../packages/integration-jira/src/Migrations.ts) | Durable execution, page/stage identities, revision/attempt fences, retry gates, projection progress and the user-facing command module | Move the existing state machine; preserve persisted identities and schemas. No new worker. |
| [Import](../../../apps/backend/src/jira/PublicationLive.ts) | Mixes source-plan preparation with PP environment queries, hidden project creation, document writes, attachment copying, verification and atomic publication | Split by responsibility, not by moving the whole file to one owner. |
| [CleanupOperations](../../../apps/backend/src/jira/CleanupLive.ts), [CleanupWorkflow](../../../packages/integration-jira/src/CleanupWorkflow.ts), [Retention](../../../packages/integration-jira/src/Retention.ts) | Fenced cleanup claims, ordered deletion, archive verification and retention scheduling | Keep durable control flow in the package and PP effects in the backend. Preserve the recovery handle until cleanup completes. |
| [MigrationArtifacts](../../../packages/integration-jira/src/MigrationArtifacts.ts), [MigrationProduction](../../../apps/backend/src/jira/ProductionActivities.ts), [backend WorkflowRuntime](../../../apps/backend/src/jira/WorkflowRuntime.ts) | Artifact storage interface/live adapter, concrete activity assembly and shared SQL workflow runtime | Existing seams can be reused rather than wrapped in another universal host. |

## Alternatives

| Option | Benefit | Cost | Recommendation |
| --- | --- | --- | --- |
| Client/auth package only | Small first extraction | Leaves the migration subsystem and most Jira knowledge in core | Insufficient final state |
| Move the directory and expose core modules to it | Easy file relocation | Keeps provider-to-core dependencies and obscures PP write ownership | Reject |
| Extract a generic PP import engine first | Could support a future second importer | Adds a new model/framework without a second caller and risks changing existing plan/replay contracts | Defer until another real importer needs it |
| Package Jira behavior; backend implements existing activity/storage seams | Retains durable behavior and makes PP effects explicit; no core package dependency | Requires splitting mixed implementation files and validating composition | Recommended |

## Ownership and dependency direction

| Owner | Responsibilities |
| --- | --- |
| `integration-jira` | Jira HTTP/token protocols, credential rows/leases, captured source schemas, ADF conversion, mapping/preflight rules, prepared/final plan schemas, report/archive semantics, migration command/projection state, activity names, workflow definitions, cleanup orchestration and retention scheduling |
| Backend Jira adapters | PP environment/member/conflict reads, actual secret encryption, artifact storage implementation, hidden project and attachment writes, filesystem paths, PP codecs, verification, the complete publication transaction, destination cleanup, HTTP/session handling and activity assembly |
| `server-core` | Existing markdown, comment, project, ticket, attachment and storage capabilities and PP policy helpers. No imports from the integration; no retained Jira adapter tag merely for compatibility. |
| `db` | All existing tables, relations and migrations, including `jira_migration` and OAuth/refresh-lease state |
| `shared` | Existing HTTP schemas, errors, configuration and response contracts. Do not promote the entire manifest/publication engine into shared. |
| Shared workflow runtime | Existing SQL SingleRunner/WorkflowEngine in [backend workflows/Runtime](../../../apps/backend/src/workflows/Runtime.ts); provision once and reuse across integrations |

The package may depend on existing Effect, Drizzle, `@pp/db`, `@pp/shared` and utility libraries it actually uses. It must not depend on core or apps. The backend imports both. The package deliberately understands shared PP destination concepts: it is a PP Jira integration, not a stand-alone Jira SDK.

## The preparation/publication seam

The current implementation already has two durable planning steps. Preserve both:

1. Capture raw pages and normalized chunks; build and persist the manifest. Freeze the accepted configuration revision.
2. Prepare stable destination identities and attachment decisions in `JiraPreparedPublicationV1`. Save its artifact reference before materialization.
3. Through backend activities, create the hidden destination and copy/adopt attachments. Record outcomes using existing source attachment identities and attempt fences.
4. Finalize `JiraPublicationPlanV1` from the preparation and actual outcomes. It contains the document bytes, indexes, archive/report and checksum identity.
5. Through backend activities, write bounded document batches, archive and report, then verify actual persisted files, objects and pending rows.
6. Through one backend publication operation, atomically publish the destination and mark the migration succeeded.

The final plan cannot precede attachment copying: it incorporates the real outcomes. A single `publish(manifest)` operation that hides the whole process would discard useful durable checkpoints. Conversely, fine-grained public CRUD for every project row would expose implementation detail and invite callers to violate write ordering.

Use the existing `JiraMaterializationDependencies`, publication callback, `MigrationActivities` and `JiraCleanupActivities` as the host interfaces for these steps. They are already consumed by production orchestration and tests. Keep artifact references and small receipts in Activity results; bulk data stays in storage.

### Backend publication operation

Move `publishJiraMigrationAtomically` as a complete operation into a backend publication adapter. The backend can import the package's plan/checkpoint codecs and `@pp/db`; core does not need to import them. Do not split it into a project publish followed by a package status update, or invent a transaction callback protocol just to move the status statement elsewhere.

The operation must retain all current checks and writes:

- Validate the plan encoding/checksum and verification receipt, then lock the migration and hidden project rows through the transaction client.
- Validate workflow execution/attempt, source organization, plan-reference coordinates, migration status, cleanup ownership, settled remote writes and exact hidden-project identity.
- Recheck mapped users' organization membership in the transaction.
- Insert statuses, matching Git automation defaults, tags, memberships, ticket/comment indexes and attachment references using `tx`.
- Verify each pending attachment's identity/content metadata before marking it live.
- Set `project_index.publishedAt`, destination/report fields, published-plan receipt and migration `succeeded` together.
- Accept only an exact already-published replay. Roll back all SQL writes on a conflicting receipt, lost race or failure.

This is a deliberate coupled write: the package owns the migration state machine, while the backend publication transaction owns the one commit that couples its successful outcome to PP visibility. A separate call to projection mutation after publication would break that invariant. No captured outer core database module may perform work inside this transaction.

## Concrete adapters without a new framework

Suggested final layout:

```text
packages/integration-jira/src/
  Client.ts, ClientSchemas.ts, OAuth.ts, Credentials.ts
  Adf.ts, Manifest.ts, Scan.ts, ScanV2.ts
  Mappings.ts, Preflight.ts, PublicationPlan.ts, Report.ts
  MigrationWorkflow.ts, MigrationActivities.ts, MigrationProjection.ts
  Migrations.ts, CleanupWorkflow.ts, Retention.ts
  MigrationArtifacts.ts       artifact contract, refs and logical keys
  PublicationArtifacts.ts     provider plan loading/persistence, split from Import
  Host.ts                     only remaining PP capabilities not covered above

apps/backend/src/jira/
  Handlers.ts, MigrationHandlers.ts, OAuthRoutes.ts
  WorkflowRuntime.ts          shared engine + actual activity composition
  ProductionActivities.ts     concrete assembly and PP context reads
  PublicationLive.ts          hidden writes, attachment adoption, verify, commit
  CleanupLive.ts              actual destination cleanup operations
  ArtifactsLive.ts            existing org-storage/JSON-integrity adapter
  HostLive.ts                 crypto and pure PP formatting adaptation
```

Names and file subdivision are provisional. Do not introduce a facade/export for every helper. The main application interface stays `JiraMigrations` plus connection/site/project selection; workflow/runtime imports are integration wiring.

### Reuse the existing interfaces

| Needed capability | Proposed implementation |
| --- | --- |
| Artifact read/write/verify/list/delete | Keep `JiraMigrationArtifacts` contract, schema and logical-key conventions in the package; move its concrete org-storage adapter to backend. Preserve JSON encoding, SHA/size/schema verification and logical/physical prefix isolation. Do not expose `S3Connection` to package code. |
| PP environment and identity options | Backend production activities query actual org members, conflicts and storage prefix, then supply plain input to the package planner. The command module's destination-conflict path receives the matching injected query capability. Retain revision/ownership checks in the package and revalidation at commit. |
| Hidden writes and attachment adoption | Backend implements the existing materialization dependencies. It calls the package's attachment stream for source bytes; provider authorization/redirect behavior stays in the client. Preserve pre/post-I/O attempt checks, exact pending-row validation and adoption of already-uploaded objects. |
| Cleanup | Backend implements the existing cleanup stages. Package workflow controls stage names, order, mode, claim/release and delete-last completion. |
| Secrets | A small package-owned host capability delegates seal/open to real `SecretCrypto`, retaining current failure mappings and encrypted storage representation. |
| Comment encoding and attachment object keys | Supply the two existing pure PP operations through the host/planner dependency, using core's actual implementations. `PublicationPlan` currently imports `serializeCommentsRegion` and `attachmentObjectKey`; remove those imports without duplicating codecs or moving gray-matter/Node helpers into browser-shared code. Keep exact document/key bytes and deterministic hashes. |

The artifact contract currently mentions the core-local `S3Unavailable` type. Remove that type dependency as part of the split: the backend maps storage failures into package-owned internal failure data while retaining reason/retryability and the existing workflow-stage/public error mappings. Do not add a new shared HTTP error merely to represent this implementation detail.

Provider planning remains package-owned, including reference rewriting, skipped/excluded content decisions and report semantics. The host's pure formatting operations supply PP representation, not Jira policy. Derive their input shapes from existing planned comment/attachment schemas. Do not make a second plan model with independently copied fields.

Move source-plan preparation/persistence from `Import.ts` into package modules; move PP database/filesystem/object effects into the backend. Legacy helpers in that file need a caller audit rather than automatic permanent exports. The concrete `MigrationProduction` factory becomes backend assembly, while its source scanning and workflow control helpers stay in the package.

## Recovery and compatibility requirements

### Persisted execution identities

Keep `ProjectProject/JiraMigration/v1`, `ProjectProject/JiraMigrationCleanup/v1`, Activity names, page coordinates/cursor hashing, command idempotency keys, `StartImport/v1/*` and `Retry/v1/*` gates, workflow/attempt/revision semantics and cleanup-generation identities unchanged. Moving a source file does not justify a new persisted version.

Retain manifest/preparation/final-plan versions, canonical encodings, source-to-target identities, document bytes/hashes, artifact keys, checkpoint receipts and published archive paths. These are persisted contracts. A new module path or service tag is an implementation concern; a changed persisted name or checksum is a migration concern.

### Remote writes and cleanup

Preserve `withJiraRemoteWriteIntent` and `remoteWritesMayStillCommit`. A callback returning or a fiber being interrupted does not establish that a remote write stopped. Cleanup and supersession must respect the existing uncertainty guard. Keep pre-I/O and post-I/O fences when adapting attachment copying and document writes.

Cleanup modes remain `reset_import`, `discard`, `expire` and `post_success`. Preserve remote-object deletion before pending-row deletion, hidden documents before hidden project deletion, and projection deletion last. Failed cleanup retains its recovery handle. Post-success cleanup verifies the permanent archive before deleting private staging, preserves the published project and cannot downgrade success.

### Credentials and permissions

Move OAuth state, verifier, encrypted credentials and lease logic as one behavior. Preserve guarded one-time user-bound state consumption, safe return paths, actual token scopes, forced-refresh behavior and lease-conditioned rotated-pair writes. Provider reuse grace is not a substitute for the DB lease.

Keep HTTP session/org authorization in backend and migration ownership/revision checks in the command/projection module. Current Jira account/site visibility remains independent from PP project publication permissions. Do not infer user identity mapping, elevated PP roles or unrestricted source visibility from a successful connection.

## Research changes our understanding

These are evidence-backed constraints and follow-ups, not silent scope additions:

1. **A frozen capture is not a transactional Jira snapshot.** Search is eventually consistent and paginated collections can change. The manifest freezes what PP captured; it does not prove every category came from one instant. Keep visibility/coverage caveats in the report. ([Search consistency](https://developer.atlassian.com/cloud/jira/platform/search-and-reconcile/), [pagination](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#pagination))
2. **Continuation state expires.** The published platform search schema documents seven-day tokens. The package must own pagination/error interpretation; a resumed expired cursor needs an explicit recovery outcome, not a promise of indefinite Jira-side resumability. Other cursor lifetimes were not verified. ([Official OpenAPI](https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json))
3. **Rotating credentials require coordinated persistence.** Atlassian documents a ten-minute reuse grace. Preserve PP's existing database lease and conditioned persistence, and investigate result-loss/persistence-failure cases separately. ([3LO refresh](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#use-a-refresh-token-to-get-another-access-token-and-refresh-token-pair))
4. **Media IDs and attachment IDs are different evidence.** Keep current unambiguous resolution and archive provenance; do not invent an ID equivalence or claim all embedded media is preserved from successful downloads alone. ([ADF media](https://developer.atlassian.com/cloud/jira/platform/apis/document/nodes/media/))
5. **HTTP failure classification and durable scheduling are separate responsibilities.** The client interprets status/headers; the workflow owns durable waits. Preserve the current handoff. The current client drops some newer throttle metadata and 5xx retry delays; improving that is a separate, explicit repair. ([Rate limiting](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/))

Jira already uses the enhanced platform search and board-scoped Software sprint-membership endpoints. An API endpoint migration is not a prerequisite to package conversion. PKCE parameters are present in PP, but their enforcement was not established from the reviewed Jira 3LO docs; preserve the existing flow without overstating its guarantees.

## Migration layers

Recommend two layers, each valid and fully checked. Establish independence before moving the package so intermediate branches do not need forbidden imports or duplicated provider contracts.

### 1. Establish the PP adapters in place

Keep Jira protocol/workflow/planning modules at their current paths while moving mixed PP effects to backend. Split `Import`, concrete production activities, cleanup and artifact storage at the interfaces above. Introduce the small host/planner dependencies for crypto and two PP format operations. Inject PP conflict/environment queries. Backend tests exercise the actual adapters and the unchanged atomic transaction.

Exit condition: remaining core Jira implementation has no imports from non-Jira core modules or apps. It depends only on its local Jira modules, shared/db, Effect and used utilities. Core outside Jira still has no dependency on the Jira implementation. No byte/schema/workflow identity changes.

### 2. Extract the independent package and complete wiring

Move those Jira modules, contracts and their owning tests into `integration-jira`; update backend production/HTTP/runtime/harness imports. Remove the old core Jira directory and unused compatibility aliases. Include package manifests/dependencies, lockfile, TypeScript/Vitest routing, `test:db`, Docker manifest/node_modules/runtime copy lists, lint direction and relevant testing exceptions.

Keep the shared workflow engine and register each workflow once. Preserve custom transport/token-endpoint configuration used by the existing harnesses; package relocation must not bypass them.

No database migration, public endpoint change, new generic import package or new external library is required just to move owners. If implementing a discovered correctness repair, identify it explicitly and give it its own behavior proof rather than folding it into a mechanical rename.

## Validation and test ownership

Retain the current strong tests rather than adding parallel inventories. The existing [Import suite](../../../apps/backend/src/jira/PublicationLive.test.ts) already covers real hidden materialization, upload adoption after result loss, publication rollback/replay and cancellation races. Move PP-effect portions to backend; keep source planning/conversion coverage with the package. PP-codec-dependent plan assertions belong with the real backend formatting adapter; package tests must not fake the behavior they claim to prove.

Package tests own requests/auth/pagination, frozen preparation and mapping policy, workflow retry identities, projection fences, plan schemas and cleanup sequencing. Backend tests own actual PP membership/visibility, encryption/storage adaptation, document/attachment mutations and atomic publication. Keep the existing [SQL workflow restart suite](../../../apps/backend/src/jira/WorkflowRestart.postgres.test.ts), [handler suite](../../../apps/backend/src/jira/MigrationHandlers.test.ts) and harnesses in the backend.

Required evidence when implementing:

- Real hidden destination remains unreachable before commit; a failed publication rolls back indexes/visibility/success together; an exact successful replay returns the same outcome.
- Existing attempt/configuration/failure-generation gates, credential leases, uncertain-write guards, attachment result-loss adoption and cleanup modes behave identically through the real adapters.
- Resume SQL workflow history and persisted artifacts across the ownership/package change, not only two restarts of the same newly built code. Extend existing restart proof where practical rather than duplicate its scenarios.
- Run focused owners, full workspace checks and `bun run test:all` with the repo's runtime selection. Keep DB suites serialized and isolated to a test database.
- Moving Jira tests out of the server-core worker split requires the remaining full core suite with two file-order shuffle seeds. Preserve per-file isolation for moved global/environment mocks. Run shared/DB shuffle checks if those workers or their configuration change.
- Verify both frozen-lockfile Docker builds, packaged backend imports, restart/browser harness module resolution, and package inclusion in root DB-test selection.

For this research/design pass, only documentation link/whitespace checks and diagram previews are appropriate; runtime tests do not validate a design that has not been implemented.

## Decision to review

Accept or revise the package-owned migration/control flow, backend-owned PP adapters and indivisible publication commit. The concrete simplification is to reuse the existing activity/artifact seams and remove Jira from core, while keeping replay and storage representations stable. Figma remains deferred; its research/proposal is preserved for later.
