# T-172 Effect Jira Migration Design

Date: 2026-09-22

Status: Approved replacement architecture for PR 235; create handshake, rescan identity, and staged composition amended with Wouter’s approval on 2026-09-22

Source requirements: [T-172](https://projectproject.missler.xyz/orgs/project-project/projects/project-project/tickets/T-172)

Reviewed implementation: PR 235 at `994455a26be958db47826c7425efedfdf84aea90`

## Summary

PR 235 contains useful Jira extraction, conversion, mapping, preflight, publication-plan, reporting, OAuth, and wizard work. Its execution model should be replaced rather than incrementally repaired.

The migration will use Effect's durable workflow stack:

- `effect/unstable/workflow/Workflow` for the migration lifecycle
- `Activity` for every durable external side-effect boundary
- `DurableDeferred` for the scan-to-configuration pause and user-triggered retries
- `DurableClock` for restart-safe Jira rate-limit delays
- `Workflow.interrupt` for cancellation
- `ClusterWorkflowEngine` with SQL-backed `SingleRunner` for durable execution in the current single-process deployment

The existing `JiraMigrations` service remains the sole application-facing interface. The workflow engine owns execution. The `jira_migration` row becomes a read model for the wizard, not a queue.

The design preserves the complete T-172 scope: a fixed point-in-time scan, explicit mappings, resumability, Jira `Retry-After`, a versioned manifest, two-pass link rewriting, raw provenance, hidden staging, atomic publication, cancellation, diagnostics, explicit discard, and 30-day retention.

## Intent and success criteria

The user should be able to start a Jira migration, leave at any point, restart the backend, reconnect Jira, finish configuration, retry transient failures, cancel, or explicitly discard without losing completed work or exposing a partial ProjectProject project.

The implementation succeeds when:

- the backend can be terminated after any completed Activity and continue without repeating that external work
- completed Jira pages are not fetched again after process restart
- rescanning deliberately creates a new snapshot and never replays an older scan as current
- no workflow lease, heartbeat, database polling loop, or custom job runner remains
- a failed or cancelled migration has no visible destination project
- a successful migration becomes visible through one PostgreSQL commit after all required files and objects exist
- every T-172 omission, transformation, unsupported value, skip, and failure is represented in the archive or report without exposing content the user chose to exclude

## Alternatives considered

### Repair the current worker

This would retain the queue row, claim query, lease, heartbeat, poll loop, checkpoint protocol, retry classification, cancellation checks, and terminal projection as custom infrastructure. It duplicates capabilities already provided by Effect Workflow and leaves the hardest failure windows for the application to solve. This option is rejected.

### Use PersistedQueue or effect-mq

Both can durably deliver work, but the migration is a stateful, multi-stage process with a human pause, replay boundaries, cancellation, retry, and finalization. A queue would still require a custom workflow protocol around each message. This option is rejected.

### Use Effect Workflow with SQL SingleRunner

This matches the process directly, requires no new package, and keeps the deployment model unchanged. Activity results, deferred signals, interruption, and workflow history survive backend restarts. This is the selected approach.

`effect/unstable/workflow` and `effect/unstable/cluster` are unstable APIs. Their tags, Activity names, payload schemas, result schemas, and runtime wiring are treated as persisted contracts and covered by restart tests before PR 235 becomes release-ready.

## Architectural boundaries

The deep public module remains `JiraMigrations`:

```text
list
get
create
configure
rescan
run
cancel
discard
```

HTTP handlers and frontend atoms do not call Workflow, Activity, S3, or projection helpers directly. They use `JiraMigrations` and receive the existing shared `JiraMigrationDetail` shape.

Internally, the subsystem has five responsibilities:

```text
JiraMigrations
  -> workflow commands and projection reads

JiraMigrationWorkflow
  -> deterministic lifecycle and durable control flow

JiraMigrationActivities
  -> bounded calls to Jira, storage, markdown, and Postgres

JiraMigrationProjection
  -> compare-and-set wizard state and progress

JiraMigrationArtifacts
  -> raw pages, normalized chunks, manifest, archive, and report
```

Bulk Jira responses never become workflow payloads or Activity results. They live in organization storage. Workflow history contains small schemas and artifact references only.

## Runtime composition

The backend runtime provides:

```text
SqlClient
  -> SingleRunner.layer({ runnerStorage: "sql" })
  -> ClusterWorkflowEngine.layer
  -> JiraMigrationWorkflow.toLayer(...)
  -> JiraMigrationCleanupWorkflow.toLayer(...)
```

The SQL-backed SingleRunner supplies sharding, runners, runner storage, and message storage for the current single backend process. The runtime also provides the existing Bun crypto layer required by SQL message storage. Effect owns the cluster tables and migrations. Application code does not query or mutate those tables directly.

The workflow layers are scoped as part of `AppLive`. `Worker.ts`, its detached fiber, and its polling schedule are removed.

Until Task 11's production cutover, `JiraMigrationsLive` remains the existing production implementation. Task 3 exposes a separate `JiraMigrationsWorkflowLive` layer factory for isolated composition and tests; production does not provide or run it beside the worker. The factory requires implementations of the existing `run`, `cancel`, and `discard` methods, supplied by Task 7's durable command orchestration. Tests supply explicit operations for these later-task boundaries. Legacy discard is not reused for workflow rows because its unfenced deletion and swallowed cleanup errors violate cleanup ownership. Task 3 supplies the fenced projection claim, release, and delete-last primitives; Task 11 supplies the actual cleanup runtime. Task 11 replaces the production layer and removes compatibility code; no workflow-created row is sent to the old worker.

If ProjectProject later runs multiple backend replicas, the workflow definition and domain interfaces remain unchanged. Only the cluster runner topology changes.

## Persisted identity and versioning

The initial workflow tag is `ProjectProject/JiraMigration/v1`. The cleanup workflow tag is `ProjectProject/JiraMigrationCleanup/v1`.

Workflow payloads, success values, typed failures, deferred values, Activity successes, and Activity failures all use Effect Schema. A persisted schema is never silently changed in place. An incompatible change receives a new workflow or Activity version.

Activity names include the minimum coordinates needed to distinguish semantic work:

```text
v1/start
v1/scan/project
v1/scan/fields
v1/scan/issues/{scanRevision}/{pageOrdinal}/{cursorHash}/{operationTry}
v1/scan/comments/{scanRevision}/{issueId}/{pageOrdinal}/{cursorHash}/{operationTry}
v1/build-manifest/{scanRevision}
v1/import/preflight/{scanRevision}
v1/import/attachment/{jiraAttachmentId}/{operationTry}
v1/import/write-documents/{publicationRevision}
v1/import/write-archive/{publicationRevision}
v1/import/publish/{publicationRevision}
v1/finalize
```

Opaque cursors are hashed before use in Activity names. Source IDs remain in encoded Activity input and artifact metadata.

An Activity writes to a deterministic object key or database identity. If the process dies after the side effect but before Effect persists the Activity result, re-execution converges on the same state.

## Workflow start handshake

Starting durable execution and creating the public projection are separate persistence systems. The design avoids a database row that can be stranded before enqueue and avoids a workflow that can be enqueued without a discoverable migration.

For `create`:

1. The handler executes `JiraMigrationWorkflow` with a create payload and `discard: true`.
2. The idempotency key is derived from organization ID, initiating user ID, and the caller's request ID.
3. The returned workflow execution ID is the public migration ID.
4. The workflow's first `v1/start` Activity is the sole creator of the projection row, using the source accepted by the engine and that execution ID.
5. The handler observes the owned projection with a bounded one-second wait and 20 ms polling interval. It never inserts a projection.
6. The handler compares every requested source field against the accepted projection and returns its existing public detail shape. A mismatch returns the existing `Conflict`; if the projection is not available within the bound, the existing `JiraError({ reason: "timeout" })` is returned without cancelling durable execution.

The projection operation compares the complete source identity. Reusing a request ID for a different Jira cloud or project returns the existing conflict instead of silently reusing the first payload.

If the handler disappears after enqueue, the workflow still creates the projection. Retrying the same request reaches the same execution ID and row. There is no row-before-enqueue failure window. Concurrent callers with different sources cannot race an unaccepted source into the projection: only the engine-accepted payload can create it. This replaces the original handler-or-workflow insertion handshake, whose two writers could disagree about the accepted source.

For a rescan after a prior execution has completed or been superseded, the payload carries the existing migration ID, `supersededExecutionId` from the owned projection before enqueue, expected projection revision, next workflow attempt, and next scan revision. The workflow idempotency key is:

```text
{migrationId}:{workflowAttempt}:{expectedRevision}
```

The handler validates the current action before enqueue; the workflow compare-and-set remains authoritative against races. After enqueue, both the handler and the workflow's first Activity call the same idempotent compare-and-set operation. The initial compare-and-set validates `supersededExecutionId` against the current execution, records the new execution ID, and fences the previous execution. The operation succeeds when it performs the expected revision change or observes the exact target execution already installed. Both paths return the persisted command’s predecessor ID. The durable start always interrupts that predecessor idempotently, including on replay after the projection was installed but before interruption completed. This closes the handler-interruption and process-crash window between those effects. Concurrent rescans derived from the same revision therefore converge on one attempt rather than creating two active snapshots. Including the expected revision gives a later request a distinct execution when an earlier rescan lost its projection revision race. It cannot install an execution whose persisted start already failed against an older revision. This identity amendment was approved before the workflow was deployed.

## Projection model

`jira_migration` remains a small Postgres record for queries and UI state. It is not scanned for executable jobs.

Its primary key changes from UUID to text because the initial Effect workflow execution ID is the public migration ID. The shared migration ID schema already accepts a non-empty string, so this does not widen the HTTP contract.

It retains:

- request identity and ownership
- Jira source identity
- public status, phase, revision, and progress
- `manifestVersion` and artifact prefix
- scan summary and configuration draft
- destination identity
- report and failure information
- timestamps

It adds:

- `workflowExecutionId`
- `workflowAttempt`
- `scanRevision`
- `failureSequence`
- `retainedUntil`
- `cleanupExecutionId`

It removes:

- `leaseId`
- `leaseExpiresAt`
- the worker lease index

All workflow-originated writes require the current `workflowExecutionId` and `workflowAttempt`. A superseded workflow may finish an already-running Activity, but it cannot alter the current projection or publish a project.

The public statuses remain:

```text
scanning
needs_configuration
ready
migrating
cancelling
reconnect_required
failed
cancelled
succeeded
```

Discard progress is internal through `cleanupExecutionId`; it does not add a public migration status. While cleanup is active, `canDiscard` is false. Successful cleanup removes the projection. Failed cleanup clears `cleanupExecutionId`, retains the recovery handle, and makes discard available again.

## Scan phase

The scan runs before any destination project row is created.

Top-level source metadata is fetched through individual Activities. Collection endpoints use Effect streaming pagination. Each page is its own dynamically named Activity and writes two deterministic artifacts:

- the original response needed for provenance
- a normalized chunk keyed by stable Jira IDs

The Activity result contains counts, the next cursor, warnings, and artifact references. The workflow folds those small results into progress and continues the stream.

Issue-dependent collections use bounded Effect concurrency. Comments, changelogs, worklogs, watchers, votes, and attachment metadata retain separate page boundaries so one large issue does not make the whole scan a single replay unit.

The scan captures, when visible:

- site and project metadata
- field definitions and populated custom fields
- workflow and status metadata
- issue types, priorities, labels, components, and versions
- issues with original JSON and ADF
- comments, changelogs, worklogs, watchers, and votes
- attachments and download metadata
- parents, subtasks, epics, sprints, releases, and typed links
- restriction metadata
- detectable Jira Software, Work Management, Service Management, Product Discovery, and app-defined data

After all chunks exist, `build-manifest` reads them and writes a complete versioned manifest plus wizard requirements. It validates uniqueness and references before projecting `needs_configuration`.

Backend restart replays successful page Activities from Effect's SQL history. It does not call Jira for those pages again. An explicit rescan increments `scanRevision`, creating new Activity identities and a new snapshot timestamp.

## Rate limiting and retry

Jira `429` is a typed failure containing the parsed `Retry-After` duration. The workflow uses `DurableClock.sleep` for that duration, increments `operationTry`, and repeats the same logical page with a new Activity identity. The delay survives process restart.

Network timeouts and Jira `5xx` responses use a bounded Effect Schedule with exponential backoff and jitter inside the Activity. After exhaustion, the workflow:

1. records a retryable public failure
2. increments `failureSequence`
3. awaits `Retry/v1/{failureSequence}` through DurableDeferred
4. increments `operationTry`
5. continues from the failed logical unit

Completed page Activities and written artifacts remain replayable. User retry does not restart the scan or import.

OAuth refresh failures project `reconnect_required` and await the same generation-specific retry signal. After the user reconnects Jira and presses Retry, the Activity resolves fresh credentials and continues.

The workflow does not rely on `Workflow.SuspendOnFailure` for user-visible retry. Re-running a workflow with the same failed Activity identity would replay the persisted failure. Explicit retry generations make re-execution deterministic.

## Server-side configuration

After scan completion, the workflow awaits `StartImport/v1/{scanRevision}`.

The existing `configure` command becomes a revision-checked draft save. The frontend sends the whole current configuration at every completed wizard step and before navigating away. The server stores incomplete arrays and derives:

- `needs_configuration` when any required decision is missing or invalid
- `ready` when `isCompleteJiraConfiguration` succeeds against the current requirements

A rescan invalidates the configuration because its requirements belong to the previous manifest. The UI may use old values as local suggestions, but it must save a newly validated configuration for the new scan revision.

`run` behaves according to state:

- from `ready`, it completes the current `StartImport` deferred
- from retryable `failed` or `reconnect_required`, it completes the current `Retry` deferred
- from every other state, it returns the existing validation or revision error

The handler completes the appropriate durable token and waits for the projection to advance with a short bounded Effect Schedule. A timeout returns the current detail rather than cancelling execution; normal frontend detail refresh then observes the durable transition. This wait is response coordination, not job execution or polling infrastructure.

## Mapping and preflight

The current pure mapping, ADF conversion, preflight, and publication-plan code remains the basis of the import. It must be completed to cover all T-172 archive categories and converted from custom unknown-value inspection to Effect Schema decoding.

Preflight validates the frozen manifest and saved configuration against current destination state. It blocks:

- incompatible project keys
- project slug or key collisions
- ticket ID collisions
- tag normalization collisions
- invalid or incomplete identity, status, type, priority, sprint, restriction, or attachment choices
- custom status slug, label, or semantic conflicts

Custom statuses are represented in the publication plan but are not created before import. They remain nonterminal. Only the existing `done` status has terminal semantics.

The publication plan is immutable and versioned. It contains the final project identity, deterministic target IDs, members, statuses, tags, groups, tickets, comments, attachment mapping, archive decisions, report inputs, and database index rows.

## Hidden materialization

After preflight succeeds, the workflow creates a hidden destination by inserting `project_index` with `publishedAt = null`. This happens after the scan and user confirmation, satisfying the requirement that scanning creates no destination project.

`publishedAt` is added to `project_index`:

- existing projects are backfilled from `createdAt`
- normal project creation always writes the current timestamp
- all public project list, lookup, authorization, MCP, and route-read paths require a non-null value
- migration internals address the hidden row directly by project ID

The hidden row reserves the globally unique slug and organization key using the existing database constraints. It prevents another project from claiming the destination while files are materialized without introducing a second reservation system.

No project member is inserted until the final publication transaction. The `publishedAt` predicate remains mandatory defense in depth rather than relying on absent membership alone.

Materialization Activities are idempotent:

- the hidden project row is inserted or verified against the migration ID
- custom statuses, tags, groups, and member plans use deterministic identities
- project, ticket, group, and comment documents overwrite deterministic hidden paths
- target attachment IDs derive from migration ID and Jira attachment ID
- attachment objects and pending index rows reuse that identity, never filename plus byte size
- two-pass rewriting runs after every final ticket ID and attachment URL is known
- archive and report files are written to their final hidden project paths before publication

The final project archive path is:

```text
imports/jira/{migrationId}/
```

## Restricted content

The configuration requires one of the approved restriction policies.

When the user accepts destination-wide disclosure, restricted records may become native content and their raw source data may enter the project archive.

When the user chooses exclusion:

- restricted native content is omitted
- restricted raw bodies and ADF are omitted from the successful project archive
- the archive and report retain source IDs, restriction metadata, counts, hashes where useful, and the explicit exclusion reason
- raw scan artifacts containing the excluded content remain private migration diagnostics only until successful staging cleanup or the failed/cancelled retention deadline

This prevents the provenance archive from bypassing the user's security decision.

Migration diagnostics are only accessible through migration-owner authorization. Storage object keys are never exposed as unauthenticated URLs.

## Atomic publication

External files and objects cannot share a transaction with Postgres. Atomicity is achieved through reachability: every required file is written under a hidden project, then one database transaction makes that project visible.

Immediately before publication, a validation Activity verifies:

- the projection still points to this workflow attempt
- the immutable publication plan matches the hidden project
- every expected project, ticket, group, archive, report, and attachment object exists
- every attachment has a pending index row and expected content metadata
- source-to-destination rewrites contain no unresolved in-scope reference
- the destination remains unpublished

The final publication Activity runs one PostgreSQL transaction that:

1. revalidates the current workflow attempt and unpublished project
2. inserts statuses, tags, members, and attachment references
3. inserts or replaces ticket and comment index rows from the publication plan using the transaction handle
4. marks migrated attachments live
5. sets `project_index.publishedAt`
6. sets the migration destination, report path, and `succeeded` outcome

No service that captured the outer database client may be called from this transaction. Index-building functions used here accept the transaction client explicitly or produce rows for direct insertion.

The visibility flip and migration success are the same commit. A crash before it leaves a hidden project. A crash after it leaves a complete visible project and a successful migration.

Post-publication cleanup may remove duplicate staging artifacts, but it is not required for project correctness and cannot downgrade success.

## Cancellation and supersession

`cancel` calls `JiraMigrationWorkflow.interrupt` for the current execution ID. Effect interruption is the execution primitive; there is no cancellation flag polled by a worker.

Activities are deliberately bounded because an active Activity may finish before interruption is observed. Every Activity that writes projection or destination state is fenced by workflow execution ID and attempt.

Publication and cancellation may race. The final database transaction is the linearization point:

- if publication commits first, the migration remains `succeeded` and cancellation cannot overwrite it
- if interruption closes the workflow first, the finalizer records `cancelled` and publication cannot pass its attempt/status guard

The workflow finalizer projects typed failures, captured defects, and interruption. It only updates a projection still owned by its execution. Defects are captured by Workflow's default `CaptureDefects` behavior; no custom defect wrapper is required.

A rescan starts a new workflow attempt and scan revision. Its start Activity fences the prior execution before interrupting it. A late finalizer from the old workflow cannot overwrite the new scan.

If a failed import had created a hidden destination, rescan first removes that hidden destination and import materialization through the cleanup workflow. Prior diagnostic scan generations remain retained until success, explicit discard, or expiry.

## Failure model

Failures are divided by recovery action:

- automatic transient: Jira `429`, network timeout, or `5xx` within bounded policy
- reconnect: missing or invalid Jira authorization; wait for user reconnection
- user-retryable: exhausted transient Jira, storage, or markdown failure; wait at the failed logical unit
- configuration-blocked: invalid mapping, collision, restriction, or attachment decision; return to configuration or rescan
- terminal: corrupt persisted schema, violated publication invariant, or unsupported internal state
- cancelled: explicit workflow interruption

The projection stores a stable public reason and retryability. Full typed error or defect details go to structured logs and private diagnostic artifacts. Tokens, authorization headers, raw restricted bodies, and attachment bytes are never logged.

Every failed or cancelled outcome receives `retainedUntil = finishedAt + 30 days`. A user-triggered retry clears `finishedAt` and `retainedUntil` before work resumes. A failure after hidden materialization leaves that project unpublished.

## Discard and retention

`JiraMigrationCleanupWorkflow` owns explicit discard, expiry cleanup, rescan reset, and post-success staging cleanup. Its idempotency key identifies the migration, cleanup mode, and cleanup generation.

The modes are:

- `reset_import`: remove the unpublished destination and pending import artifacts before a rescan, while preserving the migration row and prior diagnostic scan generations
- `discard`: remove all migration artifacts and then remove the projection
- `expire`: perform the same complete removal after the 30-day deadline
- `post_success`: remove private staging after the permanent project archive has been verified

Explicit discard starts cleanup with `discard: true`, records `cleanupExecutionId`, interrupts any workflow waiting for a retry, and disables another discard command while cleanup is active. Complete cleanup removes:

- hidden project index rows and their dependent database rows
- pending attachment index and reference rows
- migrated attachment objects
- hidden project, ticket, group, archive, and report files
- scan manifests, raw pages, normalized chunks, and staging reports

Each cleanup Activity is idempotent. `discard` and `expire` delete the projection row only after every cleanup stage succeeds. `reset_import` clears the cleanup marker and returns control to the new scan attempt. Failure retains the row and all remaining recovery metadata.

Retry and cleanup use compare-and-set transitions around `cleanupExecutionId` and `retainedUntil`. If retry wins, it clears retention and cleanup cannot claim the row. If cleanup wins, retry is rejected until cleanup either completes or releases its failed claim.

A scoped Effect retention process periodically selects failed or cancelled rows whose `retainedUntil` has passed and starts the same cleanup workflow. Expiry cleanup interrupts a workflow still waiting for a retry before deleting its artifacts. This process only schedules cleanup; it does not execute migrations or duplicate workflow semantics.

Successful project archives are permanent project data. Private migration staging is removed after the final archive has been verified.

Effect's cluster message tables remain owned by Effect. T-172 does not delete their rows through private SQL. Activity results stay small to bound their growth, and storage growth is monitored before deciding on a framework-supported history-retention policy.

## Archive and report contract

The versioned archive records:

- source site, project, account-visibility caveat, and scan timestamp
- original visible Jira JSON and ADF allowed by the restriction decision
- field definitions, workflow metadata, statuses, issue types, and priorities
- original and mapped values
- custom fields without native destinations
- changelogs, worklogs, watchers, votes, and counts
- parents, subtasks, epics, sprints, versions, rank, and typed relationships
- Jira Software, Work Management, Service Management, Product Discovery, and app-defined detection
- identities and explicit linking choices
- attachment outcomes keyed by Jira attachment ID
- unsupported ADF nodes and readable degradation decisions
- restricted-content decisions and exclusions
- normalization, collision, skip, and failure records
- manifest, archive, and converter schema versions

The report presents the same information for a human reader: source visibility, native counts, archived categories, transformations, skips, warnings, partial-success decisions, and inaccessible-data caveats.

Unsupported data is not appended to ticket descriptions. The archive remains provenance rather than runtime state.

## Authorization and credentials

The existing project-creation permission remains the authorization gate. Migration records remain scoped to the organization and initiating user.

Workflow payloads and Activity history contain Jira cloud/project identifiers, never OAuth access or refresh tokens. Jira Activities resolve the initiating user's encrypted integration immediately before the request. Rotated refresh tokens are persisted through the existing credential service.

A disconnected integration does not destroy the migration. It projects `reconnect_required` and resumes from the failed logical unit after reconnection.

## Module structure

The PR implementation is reorganized under the existing `packages/backend/src/Jira` module:

```text
Migrations.ts
  Public service, authorization, projection reads, and workflow commands.

MigrationWorkflow.ts
  Workflow definitions, deferred names, lifecycle, retry loops, and finalizer.

MigrationActivities.ts
  Activity constructors and stable naming helpers.

MigrationProjection.ts
  Row codecs, compare-and-set transitions, action derivation, and detail mapping.

MigrationArtifacts.ts
  Artifact keys, chunk codecs, manifest assembly, archive promotion, and deletion.

CleanupWorkflow.ts
  Explicit discard and retention cleanup.

Scan.ts
  Pure normalization and Effect stream composition over page Activities.

Import.ts
  Hidden materialization and transaction-bound publication operations.

Client.ts
  One Jira HTTP request/page at a time; typed rate-limit and transport failures.

Manifest.ts, Mappings.ts, Preflight.ts, PublicationPlan.ts, Report.ts, Adf.ts
  Pure versioned domain transformations retained and completed from PR 235.
```

`Worker.ts` is deleted. Runtime wiring replaces `JiraMigrationWorkerLive` with the SQL SingleRunner, workflow engine, registered workflow layers, and scoped retention scheduler.

The existing frontend wizard remains the product surface. Its polling hook may continue polling the public detail endpoint for now; workflow execution does not depend on browser polling. Polling must read the public optimistic atom rather than an exported base atom.

## Testing strategy

### Pure domain tests

Retain and expand focused tests for:

- ADF-to-Markdown conversion
- two-pass ticket, mention, media, and cross-project reference rewriting
- mappings and generated nonterminal statuses
- restriction filtering
- manifest decoding and versioning
- preflight blockers
- publication-plan determinism
- report and archive completeness

### Workflow tests

Exercise `JiraMigrations`, not internal call order, with `WorkflowEngine.layerMemory`, fake Jira responses, and real artifact/destination test stores.

Cover:

- create request idempotency and the execute-first projection handshake
- page replay after simulated workflow restart
- configuration draft persistence and resume
- `429` plus exact `Retry-After`
- bounded transient retry and user-triggered retry generation
- reconnect and continuation
- rescan producing a new snapshot and fencing the old workflow
- cancellation during scan, attachment copy, document writing, and publication race
- typed failure, defect, and interruption finalization
- explicit discard and failed cleanup recovery

### SQL-backed restart proof

Run a dedicated integration test against disposable Postgres and storage:

1. start the real SQL SingleRunner and workflow layers
2. complete several scan page Activities
3. terminate the runtime without graceful workflow completion
4. start a new runtime against the same Postgres and storage
5. assert the workflow completes and the fake Jira server did not receive duplicate calls for completed pages

Repeat the proof while waiting for configuration and while sleeping for `Retry-After`.

The test must never use the preserved T-172 preview database or bucket.

### Publication fault injection

At every materialization boundary, force failure and assert that project list, get, authorization, MCP, tickets, and direct routes cannot observe the hidden project.

Force failure immediately before and after the publication transaction:

- before commit: migration remains retryable or failed and the project is invisible
- after commit: migration is succeeded, every canonical read works, attachments are live, and report/archive paths resolve

### Frontend and browser tests

Retain route/component coverage for scan progress, saved draft resume, mappings, restrictions, validation, retry, cancellation, report, and completion. Add one browser happy path against the public API seam.

## Migration from PR 235

The rewrite keeps work that expresses T-172's domain and product behavior:

- OAuth, credentials, Jira site/project selection, and typed client schemas
- ADF conversion
- manifest normalization where complete
- mapping defaults and explicit choices
- preflight and publication-plan construction
- imported comment provenance
- archive/report rendering
- the approved wizard and shared API shapes, subject to server-side draft persistence fixes

The rewrite removes or replaces:

- `Worker.ts`
- lease columns and claim queries
- heartbeat and polling loops
- manual retry loops in the Jira client
- cancellation polling
- monolithic scan and migrate effects
- filename-and-size attachment reuse
- success-before-finalization publication
- cleanup that swallows failures

Unrelated banner prototype assets are removed from the T-172 branch rather than carried into the rewrite.

## T-172 requirement coverage

| Requirement | Design mechanism |
| --- | --- |
| Point-in-time scan before project creation | Scan workflow and manifest complete before hidden materialization |
| Resume long scans/imports | SQL workflow history plus page/item Activities |
| Checkpoint extraction and writing | Persisted Activity results and deterministic artifact keys |
| Honor `429` and `Retry-After` | Typed rate-limit failure plus `DurableClock.sleep` |
| Server-side wizard state | Revisioned projection draft plus DurableDeferred review gate |
| Explicit mappings and warnings | Existing configuration, completed preflight, immutable publication plan |
| Compatible issue keys and gaps | Deterministic publication plan and collision blockers |
| Two-pass link rewriting | Final ID map before document materialization |
| Comments and authorship | Existing imported-comment provenance model |
| Attachments | Jira-ID-derived target identities and pending-to-live publication |
| Complete provenance archive | Versioned raw and normalized artifacts plus report contract |
| No partial project | Nullable `publishedAt` and hidden materialization |
| Atomic publication | One transaction flips visibility, indexes, attachments, and migration success |
| Deterministic retry | Stable Activity identities plus explicit retry generation |
| Cancellation | `Workflow.interrupt`, fenced Activities, terminal finalizer |
| Explicit discard | Durable cleanup workflow |
| 30-day diagnostics | `retainedUntil` plus Effect-scheduled cleanup |
| Create source-named statuses | Publication-plan statuses created only under hidden import |
| No placeholder identities | Explicit link or don't-link configuration |
| Unsupported products/data | Detection, archive, and report without new native models |

## Non-goals

- Jira synchronization after the point-in-time migration
- Jira Data Center, Server, CSV, or site-backup ingestion
- a general-purpose ProjectProject job framework
- a second queue abstraction around Effect Workflow
- new native models for Jira custom fields, hierarchy, worklogs, watchers, votes, or typed links
- broader attachment limits or MIME support
- status-category or terminal-status changes
- epic or milestone management UI in T-172
- invite-and-connect behavior from T-173

## Release gate

PR 235 is not release-ready until:

- the lease worker has been removed
- the SQL-backed kill-and-resume proof passes
- the archive contract covers all T-172 categories
- server-side wizard drafts resume correctly
- publication fault-injection proves invisibility before commit
- cancellation cannot result in a `cancelled` migration with a visible project
- explicit discard and 30-day cleanup preserve a recovery handle on cleanup failure
- the full backend, shared, frontend, and browser verification suites pass
