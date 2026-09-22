# T-172 Effect Jira Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PR 235's hand-rolled Jira migration worker with a restart-safe Effect Workflow implementation that satisfies every T-172 migration, privacy, atomic-publication, cancellation, discard, and retention requirement.

**Architecture:** Keep `JiraMigrations` as the only application-facing service and turn `jira_migration` into a fenced UI projection. Effect Workflow owns lifecycle state; small, versioned Activities write deterministic artifacts and hidden project state; one PostgreSQL transaction flips the project visible and records success. DurableDeferred handles user gates and retries, DurableClock handles Jira rate limits, and a separate cleanup workflow owns reset, discard, expiry, and post-success cleanup.

**Tech Stack:** TypeScript, Effect v4 `4.0.0-rc.112`, `effect/unstable/workflow`, `effect/unstable/cluster`, SQL-backed `SingleRunner`, Drizzle/PostgreSQL, S3-compatible organization storage, Effect HttpApi, TanStack Start, `@effect/atom-react`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-t172-effect-jira-migration-design.md`

## Global Constraints

- Begin implementation from PR 235 head `origin/feat/T-172-migrate-a-jira-cloud-project-into-projectproject` at `994455a26be958db47826c7425efedfdf84aea90`; the local branch with that name is stale at `463aff48` and must not be reset or overwritten.
- At execution time use `superpowers:using-git-worktrees` to create an isolated branch such as `codex/T-172-effect-workflow` from the verified remote head.
- Read the design spec, `docs/PROJECTPROJECT.md`, and `node_modules/effect/AGENTS.md` before changing code; follow the linked Effect v4 guides relevant to Workflow, Cluster, Stream, Schema, and SQL.
- Do not add a dependency or widen a shared HTTP API without Wouter's approval. The required Effect modules are already present.
- The repository and PR have no committed browser-automation harness. Task 13 uses the connected in-app browser for release verification; adopting Playwright or another harness remains a separate architectural decision.
- Treat workflow tags, Activity names, deferred names, and every Schema persisted in workflow history as immutable versioned contracts. Initial names use `ProjectProject/JiraMigration/v1`, `ProjectProject/JiraMigrationCleanup/v1`, and `v1/...` Activity/deferred prefixes.
- Store only identifiers, counters, warnings, and artifact references in workflow history. Raw Jira responses, ADF, attachment bytes, generated Markdown, archives, and reports belong in organization storage.
- Never query or mutate Effect cluster tables from application code. Compose the SQL runner through public Effect layers.
- Every projection or destination write from a workflow must compare both `workflowExecutionId` and `workflowAttempt`; stale executions may finish bounded work but may not mutate current state or publish.
- Scanning must create no destination project. Import materialization may create a hidden project with `publishedAt = null`; all public read, authorization, route, and MCP paths must require non-null `publishedAt`.
- Do not use the preserved T-172 preview database or bucket in tests. SQL restart tests use disposable PostgreSQL and isolated test storage.
- Keep existing user-facing Jira API shapes and message IDs. New user-facing strings go through Paraglide; surfaced errors go through `packages/frontend/src/lib/errorMessage.ts`.
- Follow repository mutation conventions: family-key mutation atoms, `Atom.optimistic`/`Atom.optimisticFn`, refresh the private base atom, and render every `AsyncResult` branch.
- Write no explanatory code comments. Use names and small functions to carry intent.
- Remove the manual lease/heartbeat worker and its schema columns only after workflow-backed coverage passes. Remove unrelated banner prototype images from the feature branch before final verification.

## Review Focus

1. Process death after an external side effect but before Activity result persistence must retry onto the same object/database identity without duplicate Jira fetches, attachments, documents, or rows.
2. Cancellation racing the publication transaction must end in exactly one coherent state: visible plus `succeeded`, or invisible plus `cancelled`; never visible plus `cancelled`.
3. The exclusion policy must prevent restricted bodies and ADF from entering the permanent project archive while preserving non-sensitive IDs, counts, hashes, metadata, and the exclusion reason.
4. Concurrent create, rescan, retry, and discard calls using the same or stale revisions must have one winner and leave neither an orphan workflow nor a split projection.
5. Cursor repetition and malformed or large Jira `Retry-After` values must not create an infinite scan or unbounded sleep; valid delays are honored durably and invalid input becomes a typed retryable failure.

---

## Execution Baseline

Before Task 1, create the implementation worktree and prove its base:

```bash
git fetch origin feat/T-172-migrate-a-jira-cloud-project-into-projectproject
git rev-parse origin/feat/T-172-migrate-a-jira-cloud-project-into-projectproject
git worktree add ../project-project-t172-effect -b codex/T-172-effect-workflow 994455a26be958db47826c7425efedfdf84aea90
cd ../project-project-t172-effect
git restore --source=main -- docs/superpowers/specs/2026-09-22-t172-effect-jira-migration-design.md docs/superpowers/plans/2026-09-22-t172-effect-jira-migration.md
git add docs/superpowers/specs/2026-09-22-t172-effect-jira-migration-design.md docs/superpowers/plans/2026-09-22-t172-effect-jira-migration.md
git commit -m "docs: add T-172 Effect migration design and plan"
git status --short
bun install
bun run typecheck
```

Expected remote revision: `994455a26be958db47826c7425efedfdf84aea90`. Record any baseline test failure in the implementation handoff before changing code. Copy neither `docs/runbooks/` nor `packages/frontend/src/components/Lexical/figmaPasteConflict.test.ts` from the main worktree; they are unrelated user-owned files.

## File Structure

### New backend modules

- `packages/backend/src/Jira/MigrationWorkflow.ts` — persisted workflow/deferred schemas, stable names, migration lifecycle, retry generations, finalizer.
- `packages/backend/src/Jira/MigrationActivities.ts` — bounded Activity constructors, Activity inputs/results, and stable name helpers.
- `packages/backend/src/Jira/MigrationProjection.ts` — projection codecs, ownership reads, compare-and-set transitions, action derivation, public detail mapping.
- `packages/backend/src/Jira/MigrationArtifacts.ts` — deterministic keys, artifact codecs, checksums, manifest assembly, archive promotion, prefix deletion.
- `packages/backend/src/Jira/CleanupWorkflow.ts` — cleanup payload/schema, idempotent cleanup stages, retention cleanup workflow.
- `packages/backend/src/Jira/Retention.ts` — scoped schedule that claims expired projections and only starts cleanup workflows.
- `packages/backend/src/db/projectVisibility.ts` — the single reusable public-project predicate.
- `packages/backend/src/Jira/WorkflowRestart.postgres.test.ts` — real SQL runner kill/restart proof.
- `packages/backend/src/Jira/PublicationFaults.postgres.test.ts` — publication/cancellation fault-injection proof.

### Reworked backend modules

- `packages/backend/src/Jira/Migrations.ts` — public service, authorization, projection reads, workflow commands, deferred completion.
- `packages/backend/src/Jira/Client.ts` and `ClientSchemas.ts` — one request/page per operation, typed rate limits, cursor/offset page schemas.
- `packages/backend/src/Jira/Scan.ts` — pure normalization plus stream composition over page Activities.
- `packages/backend/src/Jira/Manifest.ts` — manifest v2 with artifact-backed provenance and complete T-172 categories.
- `packages/backend/src/Jira/Import.ts` — hidden materialization, deterministic attachment identity, object verification, atomic publish.
- `packages/backend/src/Jira/Preflight.ts`, `PublicationPlan.ts`, `Report.ts`, `Mappings.ts`, `Adf.ts` — completed pure domain transformations retained from PR 235.
- `packages/backend/src/Layers/S3Storage.ts` and `Services/S3Storage.ts` — paginated prefix listing and bulk deletion primitives.
- `packages/backend/src/Layers/TicketIndex.ts` — pure index-row builders reusable inside a caller-owned transaction.
- `packages/backend/src/db/schema.ts` plus generated migration — projection fencing/retention fields and nullable `project_index.publishedAt`.
- Public project consumers under `packages/backend/src/Layers/`, `packages/backend/src/auth.ts`, and `packages/backend/src/main.ts` — enforce published visibility.
- `packages/backend/src/runtime.ts` and `packages/backend/src/main.ts` — SQL SingleRunner, workflow engine, registered workflow layers, retention layer.
- Delete `packages/backend/src/Jira/Worker.ts` after cutover.

### Reworked frontend modules

- `packages/frontend/src/atoms/jiraMigration.ts` — private base atoms and explicit refresh mutation.
- `packages/frontend/src/hooks/useJiraMigrationPolling.ts` — refresh only through the public atom API.
- `packages/frontend/src/forms/jiraMigration/index.tsx` and step components — save the complete draft on every step transition and before leaving.
- `packages/frontend/src/JiraMigration/JiraMigrationPage.tsx` and `JiraMigrationShell.tsx` — coordinate a bounded server draft flush before navigation.
- `packages/frontend/src/components/ui/button.tsx` — reusable step-navigation variant if the wizard still needs one-off button chrome.

### Retained seams

- `packages/shared/src/schemas/JiraMigration.ts` and the existing Jira HttpApi endpoints retain their public shapes unless an implementation-blocking mismatch is found and approved.
- OAuth, credential encryption, comment provenance, route structure, Paraglide keys, and the approved wizard visual design remain intact.

### Task 1: Persisted Workflow Contracts and In-Memory Runtime Proof

**Files:**
- Create: `packages/backend/src/Jira/MigrationWorkflow.ts`
- Create: `packages/backend/src/Jira/MigrationActivities.ts`
- Test: `packages/backend/src/Jira/MigrationWorkflow.test.ts`
- Modify: `packages/backend/src/Jira/Blocked.ts`

**Interfaces:**
- Consumes: Existing `JiraMigrationSource`, `JiraMigrationDetail`, and tagged domain errors from the PR branch.
- Produces: `JiraMigrationWorkflow`, `StartImportSignal`, `RetrySignal`, `startImportDeferred(scanRevision)`, `retryDeferred(failureSequence)`, their stable name helpers, `activityName(parts)`, and small Schema-encoded workflow/activity contracts. `JiraMigrationCleanupWorkflow` is introduced in Task 11.

- [ ] **Step 1: Write contract and replay tests against the memory engine**

```ts
it.effect("replays a completed activity without repeating its effect", () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make(0)
    const executionId = yield* TestMigrationWorkflow.execute(payload, {
      discard: true
    })
    yield* TestWorkflowHarness.restart
    yield* TestWorkflowHarness.resume(executionId)
    expect(yield* Ref.get(calls)).toBe(1)
  }).pipe(Effect.provide(TestWorkflowLayer)))

it.effect("uses a new deferred generation after a retryable failure", () =>
  Effect.gen(function* () {
    const first = retryDeferredName(1)
    const second = retryDeferredName(2)
    expect(first).toBe("Retry/v1/1")
    expect(second).toBe("Retry/v1/2")
    expect(first).not.toBe(second)
  }))
```

Also assert exact workflow tag, `StartImport/v1/{scanRevision}`, encoded payload round trips, encoded success/failure round trips, and defects are captured by the default workflow behavior.

- [ ] **Step 2: Run the focused test and verify the missing contracts fail**

Run: `cd packages/backend && bun run test -- src/Jira/MigrationWorkflow.test.ts`

Expected: FAIL because `MigrationWorkflow.ts`, stable names, and the workflow layer do not exist.

- [ ] **Step 3: Define the persisted Schemas and stable naming surface**

```ts
export const JiraMigrationWorkflowCommand = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("Create"),
    organizationId: Schema.NonEmptyString,
    userId: Schema.NonEmptyString,
    requestId: Schema.NonEmptyString,
    source: PersistedJiraMigrationSource
  }),
  Schema.Struct({
    _tag: Schema.Literal("Rescan"),
    migrationId: Schema.NonEmptyString,
    expectedRevision: Schema.Int,
    workflowAttempt: Schema.Int,
    scanRevision: Schema.Int
  })
])

export const JiraMigrationWorkflowPayload = Schema.Struct({
  command: JiraMigrationWorkflowCommand
})

export const JiraMigrationWorkflow = Workflow.make(
  "ProjectProject/JiraMigration/v1",
  {
    payload: JiraMigrationWorkflowPayload,
    success: JiraMigrationWorkflowSuccess,
    error: JiraMigrationWorkflowError,
    idempotencyKey: ({ command }) =>
      command._tag === "Create"
        ? `create:${command.organizationId}:${command.userId}:${command.requestId}`
        : `${command.migrationId}:${command.workflowAttempt}`
  }
)

export const startImportDeferredName = (scanRevision: number) =>
  `StartImport/v1/${scanRevision}`

export const retryDeferredName = (failureSequence: number) =>
  `Retry/v1/${failureSequence}`

export const StartImportSignal = Schema.Struct({ scanRevision: Schema.Int })
export const RetrySignal = Schema.Struct({ failureSequence: Schema.Int })
export const startImportDeferred = (scanRevision: number) =>
  DurableDeferred.make(startImportDeferredName(scanRevision), {
    success: StartImportSignal
  })
export const retryDeferred = (failureSequence: number) =>
  DurableDeferred.make(retryDeferredName(failureSequence), {
    success: RetrySignal
  })
export const activityName = (parts: ReadonlyArray<string | number>) =>
  `v1/${parts.map(String).join("/")}`
export const JiraMigrationWorkflowSuccess = Schema.Struct({
  migrationId: Schema.NonEmptyString
})
export const JiraMigrationWorkflowFailure = Schema.TaggedStruct(
  "JiraMigrationWorkflowFailure",
  {
    reason: Schema.NonEmptyString,
    retryable: Schema.Boolean
  }
)
export const JiraMigrationWorkflowError = JiraMigrationWorkflowFailure
```

Define explicit Schemas for Activity references and errors. Do not put `Schema.Unknown`, OAuth credentials, response bodies, or bytes in any persisted result.

- [ ] **Step 4: Add a minimal injectable workflow body and Activity constructor**

Create `makeJiraMigrationWorkflow(activities)` so tests can supply bounded fakes. Register one `v1/start` Activity, one deferred pause, and `Workflow.addFinalizer`; return small success data. The lifecycle becomes complete in Tasks 5–10, but Task 1 must prove execute, pause, resume, replay, and finalization with `WorkflowEngine.layerMemory`.

```ts
export interface MigrationActivities {
  readonly start: (input: {
    readonly payload: typeof JiraMigrationWorkflowPayload.Type
    readonly executionId: string
  }) =>
    Effect.Effect<void, typeof JiraMigrationWorkflowFailure.Type>
  readonly finalize: (input: {
    readonly executionId: string
    readonly exit: Exit.Exit<unknown, unknown>
  }) => Effect.Effect<void>
}

export const makeJiraMigrationWorkflow = (activities: MigrationActivities) =>
  JiraMigrationWorkflow.toLayer((payload, executionId) =>
    Effect.gen(function* () {
      yield* Workflow.addFinalizer((exit) =>
        activities.finalize({ executionId, exit })
      )
      yield* activities.start({ payload, executionId })
      yield* DurableDeferred.await(startImportDeferred(1))
      return { migrationId: executionId }
    })
  )
```

- [ ] **Step 5: Run the workflow contract test and backend typecheck**

Run: `cd packages/backend && bun run test -- src/Jira/MigrationWorkflow.test.ts && bun run typecheck`

Expected: PASS with the Activity counter equal to one after replay.

- [ ] **Step 6: Commit the persisted contract boundary**

```bash
git add packages/backend/src/Jira/MigrationWorkflow.ts packages/backend/src/Jira/MigrationActivities.ts packages/backend/src/Jira/MigrationWorkflow.test.ts packages/backend/src/Jira/Blocked.ts
git commit -m "feat(jira): define durable migration workflow contracts"
```

### Task 2: Hidden-Project Schema and Visibility Barrier

**Files:**
- Create: `packages/backend/src/db/projectVisibility.ts`
- Modify: `packages/backend/src/db/schema.ts`
- Create: generated `packages/backend/src/db/migrations/20260922120000_jira_effect_workflow/migration.sql`
- Create: generated `packages/backend/src/db/migrations/20260922120000_jira_effect_workflow/snapshot.json`
- Modify: `packages/backend/src/Layers/Projects.ts`
- Modify: `packages/backend/src/Layers/Attachments.ts`
- Modify: `packages/backend/src/Layers/EverhourIntegrations.ts`
- Modify: `packages/backend/src/Layers/EverhourTimeTracking.ts`
- Modify: `packages/backend/src/Layers/FigmaLinks.ts`
- Modify: `packages/backend/src/Layers/GitHubIntegrations.ts`
- Modify: `packages/backend/src/Layers/ProjectStatuses.ts`
- Modify: `packages/backend/src/Layers/Tags.ts`
- Modify: `packages/backend/src/Layers/TicketIndex.ts`
- Modify: `packages/backend/src/Layers/Tickets.ts`
- Modify: `packages/backend/src/Layers/TicketIndexReconciler.ts`
- Modify: `packages/backend/src/auth.ts`
- Modify: `packages/backend/src/main.ts`
- Test: `packages/backend/src/Layers/Projects.access.test.ts`
- Test: `packages/backend/src/Layers/TicketIndex.publication.test.ts`
- Test: relevant MCP route tests colocated with `packages/backend/src/main.ts`

**Interfaces:**
- Consumes: Existing `projectIndex` joins and public authorization helpers.
- Produces: nullable `projectIndex.publishedAt` and `publishedProject()` returning the Drizzle `isNotNull(projectIndex.publishedAt)` predicate.

- [ ] **Step 1: Add failing public-visibility tests**

Insert one normal row and one `publishedAt: null` row with otherwise valid ownership/membership. Assert the hidden slug is absent from project lists, returns `NotFound` from project lookup and ticket routes, is rejected by authorization, is absent from MCP resources, and is skipped by the index reconciler. Assert migration-internal direct lookup by project ID can still find it.

```ts
expect(yield* projects.listForOrganization(org.id, user.id)).toEqual([
  expect.objectContaining({ slug: "published" })
])
expect(yield* Effect.exit(projects.get(org.id, "hidden", user.id))).toMatchObject({
  _tag: "Failure"
})
```

- [ ] **Step 2: Run the visibility tests and verify hidden rows leak**

Run: `cd packages/backend && bun run test -- src/Layers/Projects.access.test.ts src/Layers/TicketIndex.publication.test.ts src/main.test.ts`

Expected: FAIL because `publishedAt` and the shared visibility predicate do not exist.

- [ ] **Step 3: Add and generate the schema migration**

Add `publishedAt` as nullable timestamptz. Backfill existing projects from `createdAt`, then set a database default for normal inserts while keeping the column nullable for migration staging. Change `jira_migration.id` from UUID to text; add `workflowExecutionId`, `workflowAttempt`, `scanRevision`, `failureSequence`, `retainedUntil`, and `cleanupExecutionId`; do not remove lease fields in this task.

Run `cd packages/backend && bun run db:generate -- --name jira_effect_workflow`, rename the generated timestamp directory to the exact Files path if Drizzle chose a different timestamp, inspect the SQL, and add an explicit backfill:

```sql
UPDATE project_index
SET published_at = created_at
WHERE published_at IS NULL;
```

- [ ] **Step 4: Centralize and apply the public predicate**

```ts
export const publishedProject = () => isNotNull(projectIndex.publishedAt)
```

Add this predicate to every public query named in the Files section. Keep one explicit migration-internal repository path that selects by hidden project ID and does not use the predicate. Make normal project creation write `publishedAt: now` explicitly so behavior does not depend only on the database default.

- [ ] **Step 5: Run schema, visibility, auth, route, and MCP tests**

Run: `cd packages/backend && bun run test -- src/Layers/Projects.access.test.ts src/Layers/TicketIndex.publication.test.ts src/Layers/Attachments.test.ts src/main.test.ts && bun run typecheck`

Expected: PASS; the hidden project cannot be reached through any public seam.

- [ ] **Step 6: Commit the visibility barrier**

```bash
git add packages/backend/src/db packages/backend/src/Layers packages/backend/src/auth.ts packages/backend/src/main.ts
git commit -m "feat(jira): hide unpublished migration projects"
```

### Task 3: Fenced Migration Projection and Execute-First Handshake

**Files:**
- Create: `packages/backend/src/Jira/MigrationProjection.ts`
- Create: `packages/backend/src/Jira/MigrationProjection.test.ts`
- Create: `packages/backend/src/Jira/MigrationHandlers.test.ts`
- Modify: `packages/backend/src/Jira/Migrations.ts`
- Modify: `packages/backend/src/Jira/Migrations.test.ts`
- Modify: `packages/backend/src/Jira/Migrations.actions.test.ts`
- Modify: `packages/backend/src/Jira/MigrationWorkflow.ts`

**Interfaces:**
- Consumes: Task 1 workflow contract and Task 2 projection columns.
- Produces: `JiraMigrationProjectionShape`, `JiraMigrationProjection`, `ProjectionOwner`, `AttemptFence`, `ensureCreated`, `beginRescan`, `saveConfiguration`, `advance`, `recordFailure`, `claimCleanup`, `releaseCleanup`, `deleteAfterCleanup`, `owned`, `listOwned`, `toDetail`, and `actionsFor`.

- [ ] **Step 1: Write compare-and-set and handshake race tests**

Cover these concrete cases: handler inserts first, workflow inserts first, repeated create with identical request/source converges, repeated request ID with a different source returns `Conflict`, two rescans from one revision produce one current attempt, a stale attempt cannot change progress, cleanup versus retry has one winner, and a late old-workflow finalizer cannot overwrite the new attempt.

```ts
it.effect("fences writes from a superseded workflow", () =>
  Effect.gen(function* () {
    const current = yield* projection.beginRescan(rescan)
    const changed = yield* projection.advance(oldFence, {
      status: "failed",
      phase: "scan"
    })
    expect(changed).toBe(false)
    expect((yield* projection.owned(owner, migrationId)).workflowAttempt)
      .toBe(current.workflowAttempt)
  }))
```

- [ ] **Step 2: Run the focused projection/service tests and verify they fail**

Run: `cd packages/backend && bun run test -- src/Jira/MigrationProjection.test.ts src/Jira/Migrations.test.ts src/Jira/Migrations.actions.test.ts`

Expected: FAIL because mutations still write queue state directly and lack execution fencing.

- [ ] **Step 3: Move all row mapping and state transitions into the projection module**

Use these stable input shapes:

```ts
export interface AttemptFence {
  readonly migrationId: string
  readonly workflowExecutionId: string
  readonly workflowAttempt: number
}

export interface ProjectionOwner {
  readonly organizationId: string
  readonly userId: string
}

export interface JiraMigrationProjectionShape {
  readonly ensureCreated: (input: EnsureCreatedInput) =>
    Effect.Effect<JiraMigrationRow, Conflict | JiraError>
  readonly beginRescan: (input: BeginRescanInput) =>
    Effect.Effect<BeginRescanResult, Conflict | Validation | JiraError>
  readonly advance: (fence: AttemptFence, patch: ProjectionPatch) =>
    Effect.Effect<boolean, JiraError>
  readonly saveConfiguration: (input: SaveConfigurationInput) =>
    Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
}
```

Every update uses a SQL `WHERE` clause matching all fence fields. Treat zero affected rows as stale work, not as permission to retry an unfenced update.

- [ ] **Step 4: Change `JiraMigrations.create` to execute first and converge on the projection**

```ts
const executionId = yield* JiraMigrationWorkflow.execute({ command: createPayload }, {
  discard: true
})
yield* projection.ensureCreated({ ...createPayload, executionId })
return yield* projection.owned(owner, executionId)
```

Make the workflow's first `v1/start` Activity call the same `ensureCreated`. Implement rescan as execute-next-attempt followed by idempotent `beginRescan`; after the compare-and-set installs the new execution, interrupt the superseded execution. Preserve all eight public `JiraMigrationsShape` methods.

- [ ] **Step 5: Run projection, actions, handler, and type tests**

Run: `cd packages/backend && bun run test -- src/Jira/MigrationProjection.test.ts src/Jira/Migrations.test.ts src/Jira/Migrations.actions.test.ts src/Jira/MigrationHandlers.test.ts && bun run typecheck`

Expected: PASS; the public detail/actions shape is unchanged.

- [ ] **Step 6: Commit the fenced projection**

```bash
git add packages/backend/src/Jira/MigrationProjection.ts packages/backend/src/Jira/MigrationProjection.test.ts packages/backend/src/Jira/Migrations.ts packages/backend/src/Jira/Migrations.test.ts packages/backend/src/Jira/Migrations.actions.test.ts packages/backend/src/Jira/MigrationWorkflow.ts
git commit -m "refactor(jira): make migrations a fenced workflow projection"
```

### Task 4: Deterministic Artifact Store and Manifest v2

**Files:**
- Create: `packages/backend/src/Jira/MigrationArtifacts.ts`
- Create: `packages/backend/src/Jira/MigrationArtifacts.test.ts`
- Modify: `packages/backend/src/Jira/Manifest.ts`
- Modify: `packages/backend/src/Jira/Manifest.test.ts`
- Modify: `packages/backend/src/Services/S3Storage.ts`
- Modify: `packages/backend/src/Layers/S3Storage.ts`
- Modify: `packages/backend/src/Layers/S3Storage.test.ts`

**Interfaces:**
- Consumes: Existing `OrgStorage` resolution and `S3Storage` object primitives.
- Produces: `JiraArtifactRef`, `JiraMigrationArtifactsShape`, deterministic `artifactKey`, `writeJson`, `readJson`, `verify`, `listPrefix`, `deletePrefix`, and `JIRA_MIGRATION_MANIFEST_VERSION = 2`.

- [ ] **Step 1: Write artifact identity, checksum, pagination, deletion, and manifest tests**

Assert identical logical coordinates overwrite the same key, changed bytes change the SHA-256 checksum, list follows every `ListObjectsV2` continuation token, delete removes every page, and manifest v2 round-trips every required category. Assert raw response bodies do not appear in the Activity result fixture.

```ts
expect(artifactKey({
  migrationId: "m1",
  scanRevision: 3,
  area: "raw",
  kind: "issues",
  identity: "page-0004-abc123"
})).toBe("migrations/jira/m1/scan-3/raw/issues/page-0004-abc123.json")
```

- [ ] **Step 2: Run artifact/storage/manifest tests and verify they fail**

Run: `cd packages/backend && bun run test -- src/Jira/MigrationArtifacts.test.ts src/Jira/Manifest.test.ts src/Layers/S3Storage.test.ts`

Expected: FAIL because prefix listing and artifact-backed manifest v2 do not exist.

- [ ] **Step 3: Extend the S3 service with paginated key listing**

```ts
readonly listObjectKeys: (
  connection: S3Connection,
  prefix: string
) => Effect.Effect<ReadonlyArray<string>, S3Unavailable>
```

Implement AWS `ListObjectsV2` pagination through Effect v4's `Stream.paginate`; reject a repeated continuation token with `S3Unavailable` instead of looping. Implement `deletePrefix` in `MigrationArtifacts` as bounded deletion over the returned exact keys.

- [ ] **Step 4: Implement encoded artifact references and manifest v2**

```ts
export const JiraArtifactRef = Schema.Struct({
  key: Schema.NonEmptyString,
  contentType: Schema.NonEmptyString,
  byteSize: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  sha256: Schema.NonEmptyString
})
```

Manifest v2 stores artifact references and normalized records, not a `rawPages: Unknown[]` blob. Include source/project metadata, visible account caveat, field definitions, workflow metadata, issues, comments, changelogs, worklogs, watchers, votes, attachments, parents/subtasks, epics, sprints, versions/releases, rank, typed links, restrictions, product/app detection, custom fields, coverage, warnings, and schema/converter versions. Normalize every stable-ID collection before encoding.

- [ ] **Step 5: Add corruption and secret-safe reference assertions**

Make `readJson` verify byte size and SHA-256 before Schema decoding. Add a fixture whose artifact contains a unique sensitive marker and assert workflow-facing references contain only key, content type, size, and checksum—not the marker or raw JSON.

```ts
const ref = yield* artifacts.writeJson(coordinates, {
  body: "SENSITIVE-MARKER"
})
expect(JSON.stringify(ref)).not.toContain("SENSITIVE-MARKER")
const corrupted = yield* Effect.result(
  artifacts.readJson(
    { ...ref, sha256: "wrong" },
    Schema.Struct({ body: Schema.String })
  )
)
expect(corrupted._tag).toBe("Failure")
```

- [ ] **Step 6: Run tests and commit the artifact contract**

Run: `cd packages/backend && bun run test -- src/Jira/MigrationArtifacts.test.ts src/Jira/Manifest.test.ts src/Layers/S3Storage.test.ts && bun run typecheck`

```bash
git add packages/backend/src/Jira/MigrationArtifacts.ts packages/backend/src/Jira/MigrationArtifacts.test.ts packages/backend/src/Jira/Manifest.ts packages/backend/src/Jira/Manifest.test.ts packages/backend/src/Services/S3Storage.ts packages/backend/src/Layers/S3Storage.ts packages/backend/src/Layers/S3Storage.test.ts
git commit -m "feat(jira): persist versioned migration artifacts"
```

### Task 5: Single-Page Jira Client with Typed Rate Limits

**Files:**
- Modify: `packages/backend/src/Jira/ClientSchemas.ts`
- Modify: `packages/backend/src/Jira/Client.ts`
- Modify: `packages/backend/src/Jira/Client.test.ts`
- Modify: `packages/backend/src/Jira/Blocked.ts`

**Interfaces:**
- Consumes: Existing credential refresh and Jira transport services.
- Produces: `JiraCursorPage<A>`, `JiraOffsetPage<A>`, `JiraRateLimited`, `JiraTransientFailure`, and one-request methods `searchIssuesPage`, `commentsPage`, `worklogsPage`, `changelogsPage`, `componentsPage`, `versionsPage`, `boardsPage`, `sprintsPage`, and `sprintIssuesPage`.

- [ ] **Step 1: Write client boundary tests**

Assert each page method makes one Jira request, a `401` permits exactly one forced credential refresh, a second `401` becomes reconnect-required, network/`5xx` becomes a typed transient failure for the Activity layer, `429` is never slept or looped inside the client, and repeated cursors fail. Cover valid `Retry-After` delta seconds and HTTP dates, negative values, malformed values, and values above the maximum delay.

```ts
const result = yield* Effect.result(client.searchIssuesPage(input))
expect(result._tag).toBe("Failure")
if (result._tag === "Failure") {
  expect(result.failure).toEqual(
    new JiraRateLimited({ retryAfterMillis: 15_000, operation: "issues" })
  )
}
expect(transport.requests).toHaveLength(1)
```

- [ ] **Step 2: Run the client test and verify the manual loop fails expectations**

Run: `cd packages/backend && bun run test -- src/Jira/Client.test.ts`

Expected: FAIL because the PR client owns pagination/sleep/retry loops and lacks the required typed failures.

- [ ] **Step 3: Add decoded page and failure contracts**

```ts
export interface JiraCursorPage<A> {
  readonly values: ReadonlyArray<A>
  readonly nextPageToken: string | null
}

export interface JiraOffsetPage<A> {
  readonly values: ReadonlyArray<A>
  readonly startAt: number
  readonly maxResults: number
  readonly total: number | null
  readonly isLast: boolean
}

export class JiraRateLimited extends Data.TaggedError("JiraRateLimited")<{
  readonly operation: string
  readonly retryAfterMillis: number
}> {}
```

Cap accepted `Retry-After` at the explicit module constant `MAX_RETRY_AFTER_MILLIS = 86_400_000`. Missing, malformed, negative, or larger values become `JiraTransientFailure({ reason: "invalid_retry_after" })`; they do not silently become zero or an unbounded wait.

- [ ] **Step 4: Refactor transport to perform one logical request**

Keep credential lookup immediately before every request and token rotation persistence after refresh. Return timeout/network/`5xx` as `JiraTransientFailure`; the Activity in Task 6 owns the bounded Effect `Schedule`. Keep convenience aggregate methods needed by site/project selection, but implement their pagination with Effect v4's `Stream.paginate` and repeated-cursor detection.

```ts
const searchIssuesPage = (input: SearchIssuesPageInput) =>
  request(JiraSearchResponse, {
    operation: "issues",
    path: "/rest/api/3/search/jql",
    query: input
  }).pipe(Effect.map(toCursorPage))
```

- [ ] **Step 5: Run client tests and typecheck**

Run: `cd packages/backend && bun run test -- src/Jira/Client.test.ts src/Jira/Credentials.test.ts && bun run typecheck`

Expected: PASS; a `429` exits after one request with a validated delay.

- [ ] **Step 6: Commit the client boundary**

```bash
git add packages/backend/src/Jira/ClientSchemas.ts packages/backend/src/Jira/Client.ts packages/backend/src/Jira/Client.test.ts packages/backend/src/Jira/Blocked.ts
git commit -m "refactor(jira): expose one-page client operations"
```

### Task 6: Durable Scan Activities and Configuration Pause

**Files:**
- Modify: `packages/backend/src/Jira/MigrationActivities.ts`
- Modify: `packages/backend/src/Jira/MigrationWorkflow.ts`
- Modify: `packages/backend/src/Jira/Scan.ts`
- Modify: `packages/backend/src/Jira/Scan.test.ts`
- Modify: `packages/backend/src/Jira/MigrationWorkflow.test.ts`
- Modify: `packages/backend/src/Jira/MigrationProjection.ts`

**Interfaces:**
- Consumes: Task 3 `AttemptFence`, Task 4 artifact store, Task 5 one-page client.
- Produces: `JiraScanPageInput`, `JiraScanPageResult`, `makeScanPageActivity`, `scanPageActivityName`, `scanSnapshot`, and the workflow transition to `needs_configuration` followed by `StartImport/v1/{scanRevision}`.

- [ ] **Step 1: Add failing scan replay, pagination, concurrency, and rate-limit tests**

Cover a successful multi-page issue scan, an issue with multi-page comments/changelogs/worklogs, bounded dependent-collection concurrency, a repeated Jira cursor, a backend restart after page two, an exact valid `Retry-After`, and exhausted transient failure resumed by `Retry/v1/{failureSequence}`. Assert the fake Jira server sees completed page requests once and the Activity result contains only refs/counts/cursor/warnings.

```ts
expect(fakeJira.callsFor("issues", "cursor-2")).toBe(1)
expect(result).toEqual({
  raw: expect.objectContaining({ sha256: expect.any(String) }),
  normalized: expect.objectContaining({ sha256: expect.any(String) }),
  count: 50,
  nextCursor: "cursor-3",
  warnings: []
})
expect(JSON.stringify(result)).not.toContain("unique-raw-body-marker")
```

- [ ] **Step 2: Run scan/workflow tests and verify the monolithic scan fails**

Run: `cd packages/backend && bun run test -- src/Jira/Scan.test.ts src/Jira/MigrationWorkflow.test.ts`

Expected: FAIL because page-level Activities and durable retry generations are not wired.

- [ ] **Step 3: Build stable page Activity names and deterministic writes**

```ts
export const scanPageActivityName = (input: {
  readonly kind: JiraScanKind
  readonly scanRevision: number
  readonly parentId: string | null
  readonly pageOrdinal: number
  readonly cursorHash: string
  readonly operationTry: number
}) => [
  "v1/scan",
  input.kind,
  String(input.scanRevision),
  input.parentId ?? "root",
  String(input.pageOrdinal),
  input.cursorHash,
  String(input.operationTry)
].join("/")
```

Each Activity fetches one page with a bounded exponential-backoff-and-jitter Effect `Schedule` for timeout/network/`5xx`, Schema-decodes it, writes raw and normalized JSON to Task 4 keys, fences its progress write, and returns a small encoded `JiraScanPageResult`. Hash opaque cursors before placing them in names; retain the source cursor only inside encoded Activity input. Do not retry `JiraRateLimited` inside the Activity.

- [ ] **Step 4: Compose the full point-in-time scan with Effect Stream**

Use `Stream.paginate` for Jira cursor and offset endpoints. Scan the complete manifest-v2 categories from Task 4. Use a named concurrency constant for issue-dependent collections and ensure every nested page has its own Activity. Keep normalization pure in `Scan.ts`; do not make the scanner itself a daemon or database poller.

```ts
const issuePages = Stream.paginate(initialCursor, (cursor) =>
  runPageActivity({ kind: "issues", cursor }).pipe(
    Effect.map((page) => [[page], Option.fromNullable(page.nextCursor)] as const)
  )
)

const dependentPages = Stream.flatMap(
  issuePages,
  (page) => Stream.fromIterable(page.issueIds),
  { concurrency: ISSUE_DEPENDENT_CONCURRENCY }
)
```

- [ ] **Step 5: Implement workflow retry loops and the configuration gate**

On `JiraRateLimited`, run `DurableClock.sleep({ name, duration })` with a stable name containing the logical-unit coordinates and `operationTry`, increment `operationTry`, and rerun the same logical unit under a new Activity name. On exhausted transient/storage/markdown failure, atomically record a retryable failure and increment `failureSequence`, await `Retry/v1/{failureSequence}`, clear retention/failure through the same fence, increment `operationTry`, and continue. On missing/invalid authorization, project `reconnect_required` and await that generation's Retry deferred.

After all artifacts are written, run `v1/build-manifest/{scanRevision}`, validate uniqueness/references, project the summary and requirements, set `needs_configuration`, and await `StartImport/v1/{scanRevision}`.

```ts
const runLogicalPage = (input: LogicalPageInput) =>
  runPageActivity(input).pipe(
    Effect.catchTag("JiraRateLimited", ({ retryAfterMillis }) =>
      DurableClock.sleep({
        name: `v1/rate-limit/${input.logicalUnit}/${input.operationTry}`,
        duration: Duration.millis(retryAfterMillis)
      }).pipe(
        Effect.andThen(runLogicalPage({ ...input, operationTry: input.operationTry + 1 }))
      )
    ),
    Effect.catchTag("JiraTransientFailure", (failure) =>
      awaitUserRetry(input.fence, failure).pipe(
        Effect.andThen(runLogicalPage({ ...input, operationTry: input.operationTry + 1 }))
      )
    )
  )

yield* projection.advance(fence, scanCompletePatch)
yield* DurableDeferred.await(startImportDeferred(scanRevision))
```

- [ ] **Step 6: Run replay and scan coverage**

Run: `cd packages/backend && bun run test -- src/Jira/Scan.test.ts src/Jira/MigrationWorkflow.test.ts src/Jira/MigrationArtifacts.test.ts && bun run typecheck`

Expected: PASS; restart does not repeat completed pages, cursor repetition terminates with a typed failure, and exact rate-limit delay is observed by the test clock.

- [ ] **Step 7: Commit durable scanning**

```bash
git add packages/backend/src/Jira/MigrationActivities.ts packages/backend/src/Jira/MigrationWorkflow.ts packages/backend/src/Jira/MigrationProjection.ts packages/backend/src/Jira/Scan.ts packages/backend/src/Jira/Scan.test.ts packages/backend/src/Jira/MigrationWorkflow.test.ts
git commit -m "feat(jira): scan through durable page activities"
```

### Task 7: Server-Side Drafts, Run, Retry, Reconnect, Rescan, and Cancel

**Files:**
- Modify: `packages/backend/src/Jira/Migrations.ts`
- Modify: `packages/backend/src/Jira/Migrations.test.ts`
- Modify: `packages/backend/src/Jira/Migrations.actions.test.ts`
- Modify: `packages/backend/src/Jira/MigrationProjection.ts`
- Modify: `packages/backend/src/Jira/MigrationWorkflow.ts`
- Modify: `packages/backend/src/Jira/MigrationHandlers.ts`
- Modify: `packages/shared/src/schemas/JiraMigration.test.ts`

**Interfaces:**
- Consumes: Task 6 deferred names and projection generations.
- Produces: revision-checked whole-draft save, derived `needs_configuration`/`ready`, bounded post-signal projection observation, reconnect continuation, rescan fencing, and `Workflow.interrupt` cancellation.

- [ ] **Step 1: Write command-level state-machine tests**

Assert incomplete drafts persist and remain `needs_configuration`; a complete valid draft becomes `ready`; stale revision configure/run/rescan/cancel fails; run from `ready` succeeds the current StartImport deferred; run from retryable `failed` or `reconnect_required` succeeds the current Retry deferred; run elsewhere fails validation; handler response waiting times out to the current detail without interrupting; rescan invalidates the saved configuration and increments attempt/revision; cancel interrupts the current execution.

```ts
const saved = yield* migrations.configure(
  org.id,
  user.id,
  migration.id,
  migration.revision,
  incompleteConfiguration
)
expect(saved.configuration).toEqual(incompleteConfiguration)
expect(saved.status).toBe("needs_configuration")
```

Add a concurrency table whose rows are create/create, rescan/rescan, retry/discard, and cancel/publish. Assert one legal winner and a single current `workflowExecutionId` for each.

- [ ] **Step 2: Run service/handler tests and verify state mismatches fail**

Run: `cd packages/backend && bun run test -- src/Jira/Migrations.test.ts src/Jira/Migrations.actions.test.ts src/Jira/MigrationHandlers.test.ts`

Then run: `cd packages/shared && bun run test -- src/schemas/JiraMigration.test.ts`

Expected: FAIL on incomplete draft persistence and durable signal handling.

- [ ] **Step 3: Make configure a complete revisioned draft save**

Store the provided `JiraMigrationConfiguration` even when incomplete. Decode current requirements from the frozen manifest projection and derive status with `isCompleteJiraConfiguration`. Increment projection revision exactly once per accepted save. A rescan clears the server configuration and points the projection at the new scan revision.

```ts
const nextStatus = isCompleteJiraConfiguration(
  input.configuration,
  current.requirements
) ? "ready" : "needs_configuration"

return yield* projection.saveConfiguration({
  ...input,
  status: nextStatus,
  nextRevision: input.expectedRevision + 1
})
```

- [ ] **Step 4: Route run/retry through the current deferred token**

Derive the durable token with `DurableDeferred.tokenFromExecutionId` and complete only `StartImport/v1/{scanRevision}` or `Retry/v1/{failureSequence}`. After signaling, poll the projection with a short bounded Effect Schedule. Return the latest detail on timeout; do not execute migration work in the request fiber.

```ts
const deferred = row.status === "ready"
  ? startImportDeferred(row.scanRevision)
  : retryDeferred(row.failureSequence)
const token = DurableDeferred.tokenFromExecutionId(deferred, {
  workflow: JiraMigrationWorkflow,
  executionId: row.workflowExecutionId
})
yield* DurableDeferred.succeed(deferred, { token, value: signal })
return yield* observeProjectionAdvance(row).pipe(
  Effect.timeoutOption("2 seconds"),
  Effect.map(Option.getOrElse(() => currentDetail))
)
```

- [ ] **Step 5: Route cancellation and rescan through Workflow**

Call `JiraMigrationWorkflow.interrupt(current.workflowExecutionId)`. The workflow finalizer must use the fence and map interruption to `cancelled` only if publication has not committed. Failed and cancelled transitions set `finishedAt` and `retainedUntil = finishedAt + 30 days`; accepting a retry clears both before signaling the workflow. Rescan first invokes the cleanup command interface in `reset_import` mode when hidden materialization exists, installs the next attempt with compare-and-set, then interrupts the superseded execution. Task 11 supplies the production cleanup implementation; this task's service tests provide a fake through the explicit cleanup command interface.

```ts
export interface JiraMigrationCleanupCommands {
  readonly start: (input: CleanupCommand) => Effect.Effect<string, Conflict>
}

yield* JiraMigrationWorkflow.interrupt(row.workflowExecutionId)
yield* projection.finalizeInterrupted(fence)
```

- [ ] **Step 6: Run the full Jira command tests**

Run: `cd packages/backend && bun run test -- src/Jira/Migrations.test.ts src/Jira/Migrations.actions.test.ts src/Jira/MigrationHandlers.test.ts src/Jira/MigrationWorkflow.test.ts && bun run typecheck`

Expected: PASS with no queue claim, lease renewal, or request-owned migration work.

- [ ] **Step 7: Commit the public command state machine**

```bash
git add packages/backend/src/Jira/Migrations.ts packages/backend/src/Jira/Migrations.test.ts packages/backend/src/Jira/Migrations.actions.test.ts packages/backend/src/Jira/MigrationProjection.ts packages/backend/src/Jira/MigrationWorkflow.ts packages/backend/src/Jira/MigrationHandlers.ts packages/shared/src/schemas/JiraMigration.test.ts
git commit -m "feat(jira): drive migration commands with durable signals"
```

### Task 8: Complete Preflight and Immutable Publication Plan

**Files:**
- Modify: `packages/backend/src/Jira/Preflight.ts`
- Modify: `packages/backend/src/Jira/Preflight.test.ts`
- Modify: `packages/backend/src/Jira/PublicationPlan.ts`
- Modify: `packages/backend/src/Jira/PublicationPlan.test.ts`
- Modify: `packages/backend/src/Jira/Mappings.ts`
- Modify: `packages/backend/src/Jira/Mappings.test.ts`
- Modify: `packages/backend/src/Jira/Adf.ts`
- Modify: `packages/backend/src/Jira/Adf.test.ts`
- Modify: `packages/backend/src/Jira/Report.ts`
- Modify: `packages/backend/src/Jira/Report.test.ts`
- Modify: `packages/backend/src/Jira/Import.ts`
- Modify: `packages/backend/src/Jira/Import.test.ts`

**Interfaces:**
- Consumes: Manifest v2 and the existing public configuration schema.
- Produces: Schema-decoded `JiraPublicationPlanV1`, deterministic `jiraAttachmentId(migrationId, jiraAttachmentId, migrationCreatedAt)`, complete preflight blockers, two-pass rewrites, archive decisions, and report inputs.

- [ ] **Step 1: Expand pure-domain failure fixtures**

Add explicit tests for project key/slug collision, ticket ID collision and key gaps, tag normalization collision, invalid identity/status/type/priority/sprint/restriction/attachment choices, custom-status semantic conflict, nonterminal generated statuses, two-pass issue/mention/media/cross-project rewriting, unsupported ADF fallback, partial attachment outcomes, and every manifest-v2 archive/report category.

```ts
expect(jiraAttachmentId("migration-1", "jira-attachment-88", createdAt))
  .toBe(jiraAttachmentId("migration-1", "jira-attachment-88", createdAt))
expect(jiraAttachmentId("migration-1", "jira-attachment-88", createdAt))
  .not.toBe(jiraAttachmentId("migration-1", "jira-attachment-89", createdAt))
```

Add the restricted marker assertion from Review Focus: exclusion omits body/ADF from native docs and permanent archive; disclosure retains it.

- [ ] **Step 2: Run all pure Jira domain tests and record failures**

Run: `cd packages/backend && bun run test -- src/Jira/Adf.test.ts src/Jira/Mappings.test.ts src/Jira/Preflight.test.ts src/Jira/PublicationPlan.test.ts src/Jira/Report.test.ts src/Jira/Import.test.ts`

Expected: FAIL on incomplete archive categories, unknown-value inspection, filename/size attachment identity, or early status creation.

- [ ] **Step 3: Decode all inputs with Effect Schema and finish preflight**

Replace ad hoc `unknown` traversal at domain boundaries with named Schemas. Return stable blocking reasons for every invalid choice and collision. Do not create project rows, statuses, tags, members, documents, indexes, or attachment rows during preflight.

```ts
export const decodeFrozenManifest = Schema.decodeUnknownEffect(
  JiraMigrationManifestV2
)

export const preflightJiraMigration = (input: PreflightInput) =>
  validateProjectIdentity(input).pipe(
    Effect.andThen(validateMappings(input)),
    Effect.andThen(validateCollisions(input))
  )
```

- [ ] **Step 4: Build an immutable versioned publication plan**

The plan contains the final project identity, deterministic project/ticket/group/comment/attachment IDs, members, custom nonterminal statuses, tags, documents, source-to-target maps, attachment decisions, permanent archive decisions, report inputs, and exact index rows. Normalize arrays before encoding so equivalent inputs produce byte-identical plans.

Generate stable attachment ULIDs from migration creation time plus a SHA-256-derived deterministic byte stream seeded by migration ID and Jira attachment ID; pass that stream to the repo's existing ULID generator and decode with the shared Attachment ID schema. Filename and size must not participate in identity.

```ts
export const JiraPublicationPlanV1 = Schema.Struct({
  version: Schema.Literal(1),
  migrationId: Schema.NonEmptyString,
  project: PlannedProject,
  members: Schema.Array(PlannedMember),
  statuses: Schema.Array(PlannedStatus),
  tags: Schema.Array(PlannedTag),
  groups: Schema.Array(PlannedGroup),
  tickets: Schema.Array(PlannedTicket),
  comments: Schema.Array(PlannedComment),
  attachments: Schema.Array(PlannedAttachment),
  archive: PlannedArchive,
  report: PlannedReport
})
```

- [ ] **Step 5: Complete archive and report filtering**

The permanent archive uses the plan's restriction decision. For excluded records retain source IDs, restriction source, counts, content hash where useful, and explicit reason; remove raw body, raw ADF, and derived readable text. Report source visibility, native counts, archived categories, mappings, transformations, skips, warnings, partial success, inaccessible-data caveats, and all schema versions. Unsupported data stays in archive/report, never appended to ticket descriptions.

```ts
const archiveRecord = decision === "exclude"
  ? {
      sourceId: record.id,
      restriction: record.restriction,
      contentSha256: hashRestrictedContent(record),
      excludedReason: "excluded_by_user"
    }
  : unrestrictedArchiveRecord(record)
```

- [ ] **Step 6: Run pure-domain coverage and typecheck**

Run: `cd packages/backend && bun run test -- src/Jira/Adf.test.ts src/Jira/Manifest.test.ts src/Jira/Mappings.test.ts src/Jira/Preflight.test.ts src/Jira/PublicationPlan.test.ts src/Jira/Report.test.ts src/Jira/Import.test.ts && bun run typecheck`

Expected: PASS; publication-plan snapshots are deterministic and the exclusion marker cannot be found in permanent outputs.

- [ ] **Step 7: Commit the publication plan**

```bash
git add packages/backend/src/Jira/Adf.ts packages/backend/src/Jira/Adf.test.ts packages/backend/src/Jira/Mappings.ts packages/backend/src/Jira/Mappings.test.ts packages/backend/src/Jira/Preflight.ts packages/backend/src/Jira/Preflight.test.ts packages/backend/src/Jira/PublicationPlan.ts packages/backend/src/Jira/PublicationPlan.test.ts packages/backend/src/Jira/Report.ts packages/backend/src/Jira/Report.test.ts packages/backend/src/Jira/Import.ts packages/backend/src/Jira/Import.test.ts
git commit -m "feat(jira): build deterministic publication plans"
```

### Task 9: Idempotent Hidden Materialization Activities

**Files:**
- Modify: `packages/backend/src/Jira/MigrationActivities.ts`
- Modify: `packages/backend/src/Jira/MigrationWorkflow.ts`
- Modify: `packages/backend/src/Jira/Import.ts`
- Modify: `packages/backend/src/Jira/Import.test.ts`
- Modify: `packages/backend/src/Jira/MigrationWorkflow.test.ts`

**Interfaces:**
- Consumes: Task 2 hidden-project barrier, Task 4 artifact store, Task 8 `JiraPublicationPlanV1`.
- Produces: bounded Activities `preflight`, `createHiddenProject`, `copyAttachment`, `writeDocuments`, `writeArchive`, `writeReport`, and `verifyMaterialization`, all idempotent under `AttemptFence`.

- [ ] **Step 1: Write materialization idempotency and invisibility tests**

For each boundary—hidden row, each attachment, project document, ticket documents, group documents, archive, report, and verification—inject process death after the side effect and before the simulated result persistence. Rerun and assert one deterministic object/row per plan identity. At every boundary assert project list/get/auth/MCP/ticket route cannot observe the destination.

```ts
for (const boundary of materializationBoundaries) {
  const harness = yield* MaterializationHarness.make({ failAfter: boundary })
  yield* Effect.exit(harness.run)
  yield* harness.restart
  yield* harness.run
  expect(yield* harness.duplicates).toEqual([])
  expect(yield* harness.publiclyVisible).toBe(false)
}
```

- [ ] **Step 2: Run import/workflow tests and verify the old import leaks assumptions**

Run: `cd packages/backend && bun run test -- src/Jira/Import.test.ts src/Jira/MigrationWorkflow.test.ts src/Layers/Projects.access.test.ts`

Expected: FAIL because the PR import publishes incrementally or depends on worker checkpoints.

- [ ] **Step 3: Create or verify the hidden destination after preflight**

The Activity inserts `project_index` with the plan's deterministic project ID and `publishedAt: null`, or verifies an existing row belongs to this migration and identical plan. Reserve slug/key through current constraints. Do not insert project members, statuses, tags, attachment references, ticket/comment index rows, or mark attachments live.

```ts
yield* db.insert(projectIndex).values({
  id: plan.project.id,
  slug: plan.project.slug,
  organizationId: plan.project.organizationId,
  ownerId: plan.project.ownerId,
  publishedAt: null
}).onConflictDoNothing()
yield* verifyHiddenProjectIdentity(fence, plan.project)
```

- [ ] **Step 4: Materialize files and pending attachments through bounded Activities**

Use one Activity per attachment and bounded batches for document writes. Resolve every final ticket and attachment target before writing; apply two-pass rewrites; overwrite deterministic hidden paths. Write archive and report to final paths under `imports/jira/{migrationId}/`. Store attachment index rows as pending, keyed by Task 8's Jira-ID-derived target ID.

```ts
yield* Effect.forEach(plan.attachments, copyAttachmentActivity, {
  concurrency: ATTACHMENT_CONCURRENCY
})
yield* writeDocumentsActivity({ fence, planRef })
yield* writeArchiveActivity({
  fence,
  planRef,
  path: `imports/jira/${fence.migrationId}/archive.json`
})
```

- [ ] **Step 5: Verify the complete hidden graph**

The verification Activity reads the immutable plan and checks the current attempt, hidden project identity, every project/ticket/group/comment/archive/report object, attachment content metadata, pending row, and unresolved-reference count. It returns only verified counts and plan checksum. Any mismatch is a terminal publication-invariant failure and does not flip visibility.

```ts
export const VerifiedMaterialization = Schema.Struct({
  planSha256: Schema.NonEmptyString,
  documentCount: Schema.Int,
  attachmentCount: Schema.Int,
  unresolvedReferenceCount: Schema.Literal(0)
})
```

- [ ] **Step 6: Run materialization and visibility tests**

Run: `cd packages/backend && bun run test -- src/Jira/Import.test.ts src/Jira/MigrationWorkflow.test.ts src/Layers/Projects.access.test.ts src/Layers/TicketIndex.publication.test.ts && bun run typecheck`

Expected: PASS; retries converge, and no materialization boundary exposes the project.

- [ ] **Step 7: Commit hidden materialization**

```bash
git add packages/backend/src/Jira/MigrationActivities.ts packages/backend/src/Jira/MigrationWorkflow.ts packages/backend/src/Jira/Import.ts packages/backend/src/Jira/Import.test.ts packages/backend/src/Jira/MigrationWorkflow.test.ts
git commit -m "feat(jira): materialize imports behind a visibility barrier"
```

### Task 10: Atomic Publication and Cancellation Linearization

**Files:**
- Modify: `packages/backend/src/Layers/TicketIndex.ts`
- Modify: `packages/backend/src/Layers/TicketIndex.test.ts`
- Modify: `packages/backend/src/Jira/Import.ts`
- Modify: `packages/backend/src/Jira/Import.test.ts`
- Modify: `packages/backend/src/Jira/MigrationActivities.ts`
- Modify: `packages/backend/src/Jira/MigrationWorkflow.ts`
- Create: `packages/backend/src/Jira/PublicationFaults.postgres.test.ts`

**Interfaces:**
- Consumes: Task 9 verified hidden graph and caller-owned Drizzle transaction.
- Produces: pure `ticketIndexRowsFor(project, documents)`, `commentIndexRowsFor(project, documents)`, and one `publishJiraMigration(fence, planRef, plan, tx)` transaction that atomically inserts relational state, indexes, flips visibility, and marks success.

- [ ] **Step 1: Write transaction and cancellation-race tests**

Assert a failure immediately before commit leaves the destination hidden and migration retryable/failed; a process death immediately after commit leaves a visible complete project and `succeeded`; cancellation before the transaction wins yields invisible/`cancelled`; cancellation after commit cannot replace success. Query canonical project, auth, ticket, attachment, MCP, archive, and report seams after the successful case.

```ts
expect([outcome.migration.status, outcome.projectVisible]).toEqual(
  cancelWon ? ["cancelled", false] : ["succeeded", true]
)
expect(outcome.migration.status === "cancelled" && outcome.projectVisible)
  .toBe(false)
```

- [ ] **Step 2: Run index/import/fault tests and verify non-atomic behavior fails**

Run: `cd packages/backend && bun run test -- src/Layers/TicketIndex.test.ts src/Jira/Import.test.ts src/Jira/PublicationFaults.postgres.test.ts`

Expected: FAIL because index rebuild captures the outer database service or success/visibility are separate writes.

- [ ] **Step 3: Extract pure index-row builders**

Make document parsing produce normalized `ticketIndex` and `commentIndex` insert rows without writing. Keep normal rebuild behavior by calling these builders and inserting with its existing client. The Jira publish path passes its transaction handle directly; it must not call a service that captured `Db` outside the transaction.

```ts
export const ticketIndexRowsFor = (
  project: IndexedProject,
  documents: ReadonlyArray<TicketDocument>
): ReadonlyArray<typeof ticketIndex.$inferInsert> =>
  documents.map((document) => ticketIndexRowFor(project, document))

export const commentIndexRowsFor = (
  project: IndexedProject,
  documents: ReadonlyArray<TicketDocument>
): ReadonlyArray<typeof commentIndex.$inferInsert> =>
  documents.flatMap((document) => commentIndexRowsForDocument(project, document))
```

- [ ] **Step 4: Implement the single publication transaction**

Inside one transaction: revalidate `workflowExecutionId`, `workflowAttempt`, status, unpublished project, and plan checksum; insert statuses, tags, members, attachment references, ticket rows, and comment rows; mark planned attachments live; set `project_index.publishedAt`; and set destination/report/succeeded fields on the migration. Use conditional updates and require one affected migration/project row.

```ts
yield* db.transaction(
  Effect.fn(function* (tx) {
    yield* assertPublishFence(tx, fence, planRef.sha256)
    yield* insertPublicationRows(tx, plan)
    yield* tx.insert(ticketIndex).values(plan.ticketIndexRows)
    yield* tx.insert(commentIndex).values(plan.commentIndexRows)
    yield* markAttachmentsLive(tx, plan.attachments)
    yield* publishProject(tx, fence, plan.project.id)
    yield* markMigrationSucceeded(tx, fence, plan)
  })
)
```

- [ ] **Step 5: Make the finalizer respect the transaction's outcome**

After interruption or failure, the finalizer attempts its fenced terminal transition. If the publication transaction already recorded `succeeded`, the conditional update affects zero rows and the finalizer leaves success intact. If interruption closed first, publication's status/fence guard fails and the project remains hidden.

```ts
yield* Workflow.addFinalizer((exit) =>
  projection.finalize(fence, exit).pipe(Effect.orDie)
)
yield* workflowBody
```

- [ ] **Step 6: Run Postgres fault injection and normal domain tests**

Run: `cd packages/backend && bun run test -- src/Jira/PublicationFaults.postgres.test.ts src/Jira/Import.test.ts src/Jira/MigrationWorkflow.test.ts src/Layers/TicketIndex.test.ts src/Layers/TicketIndex.postgres.test.ts && bun run typecheck`

Expected: PASS for both race orderings and both sides of the commit boundary.

- [ ] **Step 7: Commit atomic publication**

```bash
git add packages/backend/src/Layers/TicketIndex.ts packages/backend/src/Layers/TicketIndex.test.ts packages/backend/src/Jira/Import.ts packages/backend/src/Jira/Import.test.ts packages/backend/src/Jira/MigrationActivities.ts packages/backend/src/Jira/MigrationWorkflow.ts packages/backend/src/Jira/PublicationFaults.postgres.test.ts
git commit -m "feat(jira): publish imported projects atomically"
```

### Task 11: Cleanup Workflow, Retention, and Production Runtime Cutover

**Files:**
- Create: `packages/backend/src/Jira/CleanupWorkflow.ts`
- Create: `packages/backend/src/Jira/CleanupWorkflow.test.ts`
- Create: `packages/backend/src/Jira/Retention.ts`
- Create: `packages/backend/src/Jira/Retention.test.ts`
- Create: `packages/backend/src/Jira/WorkflowRestart.postgres.test.ts`
- Modify: `packages/backend/src/Jira/Migrations.ts`
- Modify: `packages/backend/src/Jira/MigrationProjection.ts`
- Modify: `packages/backend/src/Jira/MigrationWorkflow.ts`
- Modify: `packages/backend/src/Jira/Blocked.ts`
- Modify: `packages/backend/src/runtime.ts`
- Modify: `packages/backend/src/main.ts`
- Modify: `packages/backend/src/db/schema.ts`
- Create: generated `packages/backend/src/db/migrations/20260922130000_remove_jira_worker_leases/migration.sql`
- Create: generated `packages/backend/src/db/migrations/20260922130000_remove_jira_worker_leases/snapshot.json`
- Delete: `packages/backend/src/Jira/Worker.ts`

**Interfaces:**
- Consumes: Task 4 prefix deletion, Task 10 terminal publication, Effect SQL runner and Bun Crypto layers.
- Produces: `JiraMigrationCleanupWorkflow`, `CleanupMode = "reset_import" | "discard" | "expire" | "post_success"`, cleanup generation/idempotency keys, `JiraMigrationRetentionLive`, and production SQL workflow layers.

- [ ] **Step 1: Write cleanup, retention, and real restart tests**

Cover all four modes. Assert failed cleanup retains the projection and recovery metadata and re-enables discard; complete discard/expire deletes the projection last; reset removes only unpublished destination/import staging and preserves prior scan diagnostics; post-success removes private staging only after permanent archive verification. Assert retry versus cleanup has one compare-and-set winner.

In `WorkflowRestart.postgres.test.ts`, use disposable PostgreSQL and isolated storage to: start real SQL SingleRunner/workflow layers, complete several scan Activities, kill the scope, restart against the same stores, finish, and assert completed Jira pages were called once. Repeat while awaiting configuration and while in DurableClock sleep.

```ts
const firstRuntime = yield* TestWorkflowRuntime.start(resources)
yield* firstRuntime.awaitCompletedActivity("v1/scan/issues/1/root/2")
yield* firstRuntime.close
const secondRuntime = yield* TestWorkflowRuntime.start(resources)
yield* secondRuntime.awaitMigration(migrationId, "needs_configuration")
expect(fakeJira.callsForCompletedPages()).toEqual([1, 1, 1])
```

- [ ] **Step 2: Run cleanup/restart tests and verify they fail before runtime wiring**

Run: `cd packages/backend && bun run test -- src/Jira/CleanupWorkflow.test.ts src/Jira/Retention.test.ts src/Jira/WorkflowRestart.postgres.test.ts`

Expected: FAIL because cleanup and SQL workflow layers do not exist.

- [ ] **Step 3: Implement idempotent cleanup stages**

Use `ProjectProject/JiraMigrationCleanup/v1` and idempotency key `${migrationId}:${mode}:${cleanupGeneration}`. `claimCleanup` increments the projection revision and returns that accepted revision as `cleanupGeneration`; no extra column is needed. Claim `cleanupExecutionId` by compare-and-set. Interrupt a retry-waiting migration for discard/expire, then delete the hidden project graph, pending rows, migrated objects, hidden documents, report/archive staging, manifests, raw pages, and normalized chunks through bounded Activities. Delete the projection last only for discard/expire. On failure, clear the cleanup claim with its generation fence and retain all remaining handles. After successful publication, the migration workflow executes cleanup in `post_success` mode with `discard: true`; cleanup failure is logged and retried independently and never downgrades the published migration.

```ts
export const JiraMigrationCleanupFailure = Schema.TaggedStruct(
  "JiraMigrationCleanupFailure",
  {
    reason: Schema.NonEmptyString,
    retryable: Schema.Boolean
  }
)

export const JiraMigrationCleanupPayload = Schema.Struct({
  migrationId: Schema.NonEmptyString,
  mode: Schema.Literals(["reset_import", "discard", "expire", "post_success"]),
  cleanupGeneration: Schema.Int
})

export const JiraMigrationCleanupWorkflow = Workflow.make(
  "ProjectProject/JiraMigrationCleanup/v1",
  {
    payload: JiraMigrationCleanupPayload,
    success: Schema.Void,
    error: JiraMigrationCleanupFailure,
    idempotencyKey: ({ migrationId, mode, cleanupGeneration }) =>
      `${migrationId}:${mode}:${cleanupGeneration}`
  }
)
```

- [ ] **Step 4: Implement the scoped retention scheduler**

Select only failed/cancelled rows whose `retainedUntil <= now` and have no cleanup claim. Start the same cleanup workflow in `expire` mode with `discard: true`. Use one scoped Effect schedule; it may launch cleanup executions but may not run import stages, poll workflow progress, claim migration work, or mutate Effect-owned cluster tables.

```ts
export const JiraMigrationRetentionLive = Layer.effectDiscard(
  selectExpiredMigrations.pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, startExpiryCleanup)),
    Effect.repeat(Schedule.spaced("1 hour")),
    Effect.forkScoped
  )
)
```

- [ ] **Step 5: Compose the production Effect runtime**

Provide `SingleRunner.layer({ runnerStorage: "sql" })` with `SqlClient` and `BunCrypto.layer`, then `ClusterWorkflowEngine.layer`, both workflow `.toLayer(...)` registrations, and retention. Keep all layers scoped in `AppLive`. Remove `JiraMigrationBackgroundLive`, detached worker fibers, queue polling, heartbeats, claim SQL, and cancellation polling.

```ts
const JiraWorkflowEngineLive = ClusterWorkflowEngine.layer.pipe(
  Layer.provide(SingleRunner.layer({ runnerStorage: "sql" })),
  Layer.provide(BunCrypto.layer)
)

export const JiraWorkflowsLive = Layer.mergeAll(
  makeJiraMigrationWorkflow(activities),
  makeJiraMigrationCleanupWorkflow(cleanupActivities),
  JiraMigrationRetentionLive
).pipe(Layer.provide(JiraWorkflowEngineLive))
```

- [ ] **Step 6: Remove lease schema and the worker**

After the SQL restart suite passes, remove the lease fields from `schema.ts` and run `cd packages/backend && bun run db:generate -- --name remove_jira_worker_leases`; rename the generated timestamp directory to the exact Files path if necessary. Delete `Worker.ts` and its `JiraMigrationLeaseLost` error from `Blocked.ts`. Search for the obsolete model:

```bash
rg -n "leaseId|leaseExpiresAt|heartbeat|claimNext|JiraMigrationWorker|JiraMigrationBackgroundLive" packages/backend/src
```

Expected: no results outside historical migration snapshots.

- [ ] **Step 7: Run cleanup, restart, publication, and type suites**

Run: `cd packages/backend && bun run test -- src/Jira/CleanupWorkflow.test.ts src/Jira/Retention.test.ts src/Jira/WorkflowRestart.postgres.test.ts src/Jira/PublicationFaults.postgres.test.ts src/Jira/MigrationWorkflow.test.ts && bun run typecheck`

Expected: PASS; completed page calls remain one across real runtime restart, and sleeping/waiting executions resume.

- [ ] **Step 8: Commit the runtime cutover**

```bash
git add packages/backend/src/Jira/CleanupWorkflow.ts packages/backend/src/Jira/CleanupWorkflow.test.ts packages/backend/src/Jira/Retention.ts packages/backend/src/Jira/Retention.test.ts packages/backend/src/Jira/WorkflowRestart.postgres.test.ts packages/backend/src/Jira/Migrations.ts packages/backend/src/Jira/MigrationProjection.ts packages/backend/src/Jira/MigrationWorkflow.ts packages/backend/src/Jira/Blocked.ts packages/backend/src/runtime.ts packages/backend/src/main.ts packages/backend/src/db
git rm packages/backend/src/Jira/Worker.ts
git commit -m "feat(jira): run migrations on Effect Workflow"
```

### Task 12: Wizard Draft Persistence and Public Atom Polling

**Files:**
- Modify: `packages/frontend/src/atoms/jiraMigration.ts`
- Create: `packages/frontend/src/atoms/jiraMigration.test.ts`
- Modify: `packages/frontend/src/hooks/useJiraMigrationPolling.ts`
- Create: `packages/frontend/src/hooks/useJiraMigrationPolling.test.ts`
- Modify: `packages/frontend/src/forms/jiraMigration/index.tsx`
- Modify: `packages/frontend/src/forms/jiraMigration/index.test.tsx`
- Modify: `packages/frontend/src/forms/jiraMigration/opts.ts`
- Modify: `packages/frontend/src/JiraMigration/JiraMigrationPage.tsx`
- Modify: `packages/frontend/src/JiraMigration/JiraMigrationShell.tsx`
- Modify: `packages/frontend/src/JiraMigration/JiraMigrationShell.test.tsx`
- Modify: `packages/frontend/src/JiraMigration/JiraSnapshotStep.test.tsx`
- Modify: `packages/frontend/src/components/ui/button.tsx`

**Interfaces:**
- Consumes: Unchanged Jira migration HttpApi/detail shapes and server whole-draft behavior from Task 7.
- Produces: private detail/list base atoms, `refreshJiraMigrationAtom(key)`, a registered `draftSaveRef`, and navigation that awaits a bounded server draft flush.

- [ ] **Step 1: Write frontend behavior tests**

Assert the full current configuration is sent when advancing and going back; leaving the wizard awaits a successful save before navigation; a failed leave-save stays on the page and renders the mapped error; remount resumes the server draft; polling invokes the public refresh command and never imports a base atom; terminal states stop polling; concurrent resources have independent mutation `AsyncResult` state.

```tsx
await user.click(screen.getByRole("button", { name: /next/i }))
expect(configure).toHaveBeenCalledWith(expect.objectContaining({
  configuration: expect.objectContaining({
    identities: currentIdentities,
    statuses: currentStatuses
  })
}))
```

- [ ] **Step 2: Run frontend tests and verify draft/polling failures**

Run: `cd packages/frontend && bun run test -- src/forms/jiraMigration/index.test.tsx src/JiraMigration/JiraMigrationShell.test.tsx src/JiraMigration/JiraSnapshotStep.test.tsx src/atoms/jiraMigration.test.ts src/hooks/useJiraMigrationPolling.test.ts`

Expected: FAIL because step changes are local-only or polling reaches an exported base atom.

- [ ] **Step 3: Make base atoms private and expose an explicit refresh command**

```ts
const jiraMigrationBaseAtom = Atom.family((key: string) =>
  runtime.atom(loadJiraMigration(key)).pipe(Atom.setIdleTTL("5 minutes"))
)

export const jiraMigrationAtom = Atom.family((key: string) =>
  Atom.optimistic(jiraMigrationBaseAtom(key))
)

export const refreshJiraMigrationAtom = Atom.family((key: string) =>
  runtime.fn(Effect.fn(function* (_: void, get) {
    get.refresh(jiraMigrationBaseAtom(key))
  }))
)
```

Keep every mutation family-keyed. Mutation success refreshes the private base atom, never the optimistic wrapper. Polling calls `refreshJiraMigrationAtom` and stops for `cancelled`/`succeeded` or when the component unmounts.

- [ ] **Step 4: Persist the complete draft at every navigation boundary**

Use this parent-owned interface:

```ts
type DraftSave = () => Promise<boolean>
type DraftSaveRef = React.MutableRefObject<DraftSave | null>
```

`JiraMigrationPage` creates the ref and passes it to the form and shell. The form registers a memoized `saveDraft` that serializes every current field and current server revision, updates the accepted revision after success, maps failure through `errorMessage`, and returns false on failure. Every forward/back step action awaits it. `JiraMigrationShell` replaces its leave Link with an accessible button that awaits `onBeforeLeave`; navigate only on true. Use the `react-useeffect` skill during implementation to keep registration synchronized without using an Effect for event-derived state.

- [ ] **Step 5: Add or use a reusable button variant**

Add a typed `step` variant to `button.tsx` and replace the wizard's one-off navigation chrome with it. It must include the global hover transition convention and `transition-transform duration-100 active:scale-[0.97]`. Do not add raw JSX strings; retain the Jira Paraglide message IDs.

```ts
step: "transition-colors transition-transform duration-100 active:scale-[0.97]"
```

- [ ] **Step 6: Run frontend tests, typecheck, and lint**

Run: `cd packages/frontend && bun run test -- src/forms/jiraMigration/index.test.tsx src/JiraMigration/JiraMigrationShell.test.tsx src/JiraMigration/JiraSnapshotStep.test.tsx src/atoms/jiraMigration.test.ts src/hooks/useJiraMigrationPolling.test.ts && bun run typecheck && cd ../.. && bun run lint`

Expected: PASS; leave waits for save, resumed state comes from the server, and base atoms are not exported.

- [ ] **Step 7: Commit the wizard corrections**

```bash
git add packages/frontend/src/atoms/jiraMigration.ts packages/frontend/src/atoms/jiraMigration.test.ts packages/frontend/src/hooks/useJiraMigrationPolling.ts packages/frontend/src/hooks/useJiraMigrationPolling.test.ts packages/frontend/src/forms/jiraMigration packages/frontend/src/JiraMigration packages/frontend/src/components/ui/button.tsx
git commit -m "fix(jira): persist wizard drafts across navigation"
```

### Task 13: Disposable Browser Harness

**Files:**
- Create: `packages/backend/src/Jira/BrowserFixtures.ts`
- Create: `packages/backend/src/Jira/BrowserFixtures.test.ts`
- Create: `packages/backend/scripts/jira-browser-harness.ts`
- Create: `packages/backend/src/Jira/BrowserHarness.test.ts`

**Interfaces:**
- Consumes: Production HttpApi handlers with injectable Jira transport/token endpoint, local PostgreSQL, and local MinIO.
- Produces: `JiraBrowserScenario`, `makeJiraBrowserFixture()`, local-only scenario control endpoints, and a runnable backend harness for the public frontend.

- [ ] **Step 1: Write deterministic fixture and safety tests**

Assert the fixture exposes every manifest-v2 source category, paginates issues and dependent collections, records calls by logical page, can emit one `429`, can expire OAuth once, and can pause one attachment response for cancellation. Assert the script rejects database names not beginning `projectproject_effect_v4_` and buckets not beginning `projectproject-t172-local-`.

```ts
const fixture = yield* makeJiraBrowserFixture("happy_path")
expect(fixture.categories).toEqual(expect.arrayContaining([
  "issues",
  "comments",
  "changelogs",
  "worklogs",
  "watchers",
  "votes",
  "attachments",
  "sprints",
  "versions",
  "links",
  "restrictions"
]))
expect(validateBrowserDatabase("projectproject")._tag).toBe("Left")
```

- [ ] **Step 2: Run harness tests and verify the fixture is missing**

Run: `cd packages/backend && bun run test -- src/Jira/BrowserFixtures.test.ts src/Jira/BrowserHarness.test.ts`

Expected: FAIL because the deterministic fixture and runnable harness do not exist.

- [ ] **Step 3: Implement the fake Jira and OAuth services**

```ts
export const JiraBrowserScenario = Schema.Literals([
  "happy_path",
  "rate_limited_once",
  "reconnect_once",
  "pause_attachment"
])

export interface JiraBrowserFixture {
  readonly transport: JiraTransportShape
  readonly tokenEndpoint: JiraTokenEndpointShape
  readonly setScenario: (
    scenario: typeof JiraBrowserScenario.Type
  ) => Effect.Effect<void>
  readonly releaseAttachment: Effect.Effect<void>
  readonly calls: Effect.Effect<ReadonlyArray<JiraFixtureCall>>
}
```

Use Refs/Deferreds inside the fixture; route requests through the same JSON bodies and headers that the production client decodes. Expose call counts and scenario changes only from the standalone harness process, never from `main.ts` or `AppLive`.

- [ ] **Step 4: Compose the local-only backend harness**

The script validates the database/bucket prefixes before applying migrations or deleting fixture data, provisions the local MinIO bucket, composes the production API with fake Jira transport/OAuth endpoint layers, and exposes control endpoints on loopback only:

```ts
const controlRoutes = {
  "POST /__jira-harness/scenario": setScenario,
  "POST /__jira-harness/release-attachment": releaseAttachment,
  "GET /__jira-harness/calls": listCalls
}

const BrowserHarnessLive = BrowserHarnessApiLive.pipe(
  Layer.provide(FakeJiraServicesLive),
  Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port: 3000 }))
)
BunRuntime.runMain(
  validateLocalResources({ databaseUrl, bucket }).pipe(
    Effect.andThen(Layer.launch(BrowserHarnessLive))
  )
)
```

Use the existing Better Auth local signup/signin UI for the browser user. Point the injected Jira OAuth authorization URL to the loopback harness, have it redirect with a valid state/code, and let the production OAuth callback and encrypted credential service complete normally.

- [ ] **Step 5: Prove the harness through public HTTP seams**

Start the script with a disposable database named `projectproject_effect_v4_t172_browser` and a bucket named `projectproject-t172-local-browser`. Through HttpApi routes, create a migration, set a scenario, inspect fake-server call counts, and release the paused attachment. Assert the control routes are absent from the production `AppLive` route table.

- [ ] **Step 6: Run tests and commit the harness**

Run: `cd packages/backend && bun run test -- src/Jira/BrowserFixtures.test.ts src/Jira/BrowserHarness.test.ts && bun run typecheck`

```bash
git add packages/backend/src/Jira/BrowserFixtures.ts packages/backend/src/Jira/BrowserFixtures.test.ts packages/backend/src/Jira/BrowserHarness.test.ts packages/backend/scripts/jira-browser-harness.ts
git commit -m "test(jira): add a disposable browser migration harness"
```

### Task 14: End-to-End Release Gate and Branch Cleanup

**Files:**
- Modify: Jira backend/frontend tests named in Tasks 1–12 only when a release-gate assertion exposes a real gap
- Delete: `packages/frontend/src/components/project-banner-prototype-canyon.jpg`
- Delete: `packages/frontend/src/components/project-banner-prototype-coast.jpg`
- Delete: `packages/frontend/src/components/project-banner-prototype-dunes.jpg`
- Delete: `packages/frontend/src/components/project-banner-prototype-forest.jpg`
- Delete: `packages/frontend/src/components/project-banner-prototype-ocean.jpg`
- Delete: `packages/frontend/src/components/project-banner-prototype-sample.jpg`

**Interfaces:**
- Consumes: All preceding tasks through public HTTP/UI seams.
- Produces: browser-control evidence for one happy path and one reconnect/retry/cancel path through public UI/API seams, a clean feature diff, and release evidence for T-172. No browser automation dependency is added by this plan.

- [ ] **Step 1: Inventory the final diff and identify only PR-owned unrelated images**

```bash
git diff --name-status origin/main...HEAD
git diff --name-only origin/main...994455a26be958db47826c7425efedfdf84aea90 -- '*.jpg' '*.jpeg'
```

The expected matches are the six files named in this task's Files block. Confirm each exists only on PR 235, then delete those exact paths with `git rm`. Do not delete pre-existing main-branch assets or user-owned untracked files.

- [ ] **Step 2: Verify the browser happy path through public APIs**

Start local PostgreSQL/MinIO and recreate only the isolated browser database:

```bash
docker compose up --wait postgres minio
docker exec projectproject-postgres dropdb --if-exists -U projectproject projectproject_effect_v4_t172_browser
docker exec projectproject-postgres createdb -U projectproject projectproject_effect_v4_t172_browser
```

Then run these in separate terminals:

```bash
PROJECTPROJECT_TEST_DATABASE_URL=postgres://projectproject:projectproject_dev@127.0.0.1:5432/projectproject_effect_v4_t172_browser JIRA_BROWSER_BUCKET=projectproject-t172-local-browser bun --env-file=.env packages/backend/scripts/jira-browser-harness.ts
bun run dev:frontend
```

Then use the `browser:control-in-app-browser` skill at `http://127.0.0.1:5173` to exercise Jira connection/site/project selection, scan progress, persisted draft reload, all mappings/restriction choice, start import, completion, project navigation, imported ticket/comment/attachment, permanent archive, and report. Control only the browser and fake Jira server; do not invoke internal projection, Workflow, Activity, or storage helpers during the walkthrough. Record the exact fake-server call counts and observed terminal URL in the implementation handoff.

- [ ] **Step 3: Verify reconnect/retry/cancel in the browser**

Expire the fake credential during a page request, assert `reconnect_required`, reconnect, click Retry, and assert progress resumes without repeating completed pages. In a second scenario cancel during bounded attachment materialization, assert `cancelled`, no public project, discard, and eventual migration removal.

- [ ] **Step 4: Run all focused release proofs**

```bash
cd packages/backend
bun run test -- src/Jira src/Layers/Projects.access.test.ts src/Layers/TicketIndex.publication.test.ts
cd ../shared
bun run test -- src/schemas/JiraMigration.test.ts src/schemas/Comment.test.ts
cd ../frontend
bun run test -- src/JiraMigration src/forms/jiraMigration src/atoms/jiraMigration.test.ts src/hooks/useJiraMigrationPolling.test.ts
```

Expected: PASS, including the real SQL restart proof and publication fault injection.

- [ ] **Step 5: Repeat the browser release walkthrough after focused tests**

Use `browser:control-in-app-browser` against disposable test services. Expected: the happy path, reconnect/retry, and cancel/discard scenarios pass without access to the preview database or bucket. Capture any browser console error and network failure before declaring the walkthrough complete.

- [ ] **Step 6: Run the repository-wide quality gate**

```bash
bun run test
bun run typecheck
bun run lint
bun run format:check
```

Expected: all commands exit zero.

- [ ] **Step 7: Perform release-gate searches**

```bash
rg -n "leaseId|leaseExpiresAt|heartbeat|claimNext|JiraMigrationWorker|JiraMigrationBackgroundLive" packages/backend/src --glob '!db/migrations/**'
rg -n "export const jiraMigrationBaseAtom|jiraMigrationRefreshAtom" packages/frontend/src
rg -n "Schema\.Unknown|rawPages" packages/backend/src/Jira/MigrationWorkflow.ts packages/backend/src/Jira/MigrationActivities.ts
git status --short
```

Expected: the first three searches return no matches. `git status` contains only the intentional release-gate changes.

- [ ] **Step 8: Commit release proof and cleanup**

```bash
git add packages/backend packages/shared packages/frontend
git add -u
git commit -m "test(jira): prove durable migration release gates"
```

## Completion Checklist

- [ ] The implementation diff starts from PR 235 head and preserves OAuth, credential, converter, mapping, report, provenance, API, and wizard work that still matches the spec.
- [ ] `Worker.ts`, leases, heartbeats, queue polling, cancellation polling, and client-owned retry loops are gone.
- [ ] SQL workflow history contains only small versioned values and artifact references.
- [ ] Create and rescan handshakes converge under retries and races.
- [ ] Completed scan/import Activities replay without repeating external work.
- [ ] Configuration drafts survive step changes, navigation, reload, reconnect, and backend restart.
- [ ] Restricted exclusion cannot leak body/ADF into permanent project data.
- [ ] Hidden projects are unreachable through list, get, auth, tickets, attachments, integrations, routes, MCP, and reconciler paths.
- [ ] Visibility, relational publication, attachment liveness, indexes, and migration success share one PostgreSQL commit.
- [ ] Cancellation/publication and retry/cleanup race tests prove one coherent winner.
- [ ] Discard, expiry, reset, and post-success cleanup are durable and recoverable.
- [ ] Real SQL kill/restart tests pass during active scan, configuration wait, and rate-limit sleep.
- [ ] Browser happy path, reconnect/retry, and cancel/discard pass.
- [ ] Backend, shared, frontend, browser, typecheck, lint, and format gates pass.
