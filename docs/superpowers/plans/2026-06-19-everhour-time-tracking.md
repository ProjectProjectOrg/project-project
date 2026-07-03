# Everhour Time Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track time on tickets and sprints by orchestrating Everhour's native timers against per-sprint, per-work-type tasks, with ProjectProject owning ticket attribution and reporting.

**Architecture:** "Model B" — an Everhour task represents `(sprint × work-type)`, not a ticket. PP starts/stops Everhour timers (and adds manual time), stamps the ticket id into the Everhour record comment, and keeps a **rebuildable index** mapping `everhourTimeId → ticketId`. Everhour mints every second and remains the source of truth for durations; PP never fabricates or deletes time. The existing structural mirror in `b52f754` (ticket = Everhour task) is **rebuilt** to this model — it is unmerged scaffolding, so there is no live data to migrate.

**Tech Stack:** Effect v3 (`HttpApi`, `Effect.gen`, Layers, tagged errors), Drizzle + Postgres (`@effect/sql-drizzle`), Better Auth, Bun, `@effect/vitest`; frontend TanStack Start/Router + `@effect-rx/rx-react` atoms + shadcn/ui. Background design doc: `docs/everhour-time-plan.md`.

## Global Constraints

- **North star:** the `Sprint X — <work-type>` task totals in Everhour are 100% accurate. Per-ticket attribution is best-effort and secondary. PP never writes a duration Everhour did not generate, and never deletes/destroys an Everhour time record (worst case: close/archive).
- **No comments** in code (CLAUDE.md). Single exception in this plan: one explicitly-requested `FIXME` line at the work-type reconcile site (Task 1.5).
- **i18n:** every user-facing string goes through paraglide `m.*`; no raw literals in JSX. New `time_` prefix in a new file `packages/frontend/messages/en/time.json`; update the CLAUDE.md i18n table **and** the Inlang `pathPattern` in the same change (Task 3.1).
- **Buttons:** `active:scale-[0.97]` + `transition-transform duration-100` on every clickable button (CLAUDE.md "press feel"). Hover state changes pair with `transition-colors` ("instant in, eased out").
- **Optimistic mutations:** use `Atom.optimistic` / `Atom.optimisticFn`, family-keyed by resource, refresh the **base** atom after landing (CLAUDE.md). Mirror `packages/frontend/src/atoms/everhour.ts`.
- **Render all four `Result` variants** with `Result.matchWithError` + `ErrorPage` (CLAUDE.md).
- **Errors** surfaced in UI map through `packages/frontend/src/lib/errorMessage.ts`.
- **Commands:** tests `bun --filter @projectproject/backend test`; typecheck `bun run typecheck`; migrations `cd packages/backend && bun db:generate` then `bun db:migrate`; lint `bun run lint`; format `bun run format`.
- **Work-type keys** are stable slugs; labels are display text. Default set seeded on connect: `development` "Development", `design` "Design", `project_management` "Project Management", `meetings` "Meetings & Workshops", `testing` "Testing". `development` is `isDefault`.

---

## Phase 1 — Structure

Rebuild the structural sync from "ticket = task" to "(sprint × work-type) = task". Pure structure; verifiable directly in an Everhour board. No time capture yet.

Reference files to mirror: `packages/backend/src/Layers/EverhourIntegrations.ts` (sync logic, `syncSections`, `syncTasks`, `mutate`, `recordProjectSync`), `packages/backend/src/Services/Everhour.ts` (client), `packages/backend/src/db/schema.ts` (tables 190–458), `packages/backend/src/Layers/Tickets.test.ts` (test/fake-layer style).

### Task 1.1: Org work-type config — schema, types, seed-on-connect

**Files:**
- Modify: `packages/backend/src/db/schema.ts` (add `config` jsonb to `organizationIntegration`, ~190-222)
- Create: `packages/shared/src/schemas/WorkType.ts`
- Modify: `packages/shared/src/index.ts` (export WorkType)
- Modify: `packages/backend/src/Layers/EverhourIntegrations.ts` (`connectProfile` is user-level; seed config in `createOrReuseProjectLink` org-integration upsert, ~494-537)

**Interfaces:**
- Produces: `WorkType = { key: string; label: string; order: number; isDefault: boolean }`; `DEFAULT_WORK_TYPES: ReadonlyArray<WorkType>`; `OrgEverhourConfig = { workTypes: ReadonlyArray<WorkType> }`. Drizzle column `organizationIntegration.config: jsonb` typed `OrgEverhourConfig | null`.

- [ ] **Step 1: Define the shared schema.** In `packages/shared/src/schemas/WorkType.ts`:

```ts
import * as Schema from "effect/Schema"

export const WorkType = Schema.Struct({
  key: Schema.String.pipe(Schema.pattern(/^[a-z][a-z0-9_]*$/)),
  label: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  order: Schema.Number,
  isDefault: Schema.Boolean
})
export type WorkType = typeof WorkType.Type

export const OrgEverhourConfig = Schema.Struct({
  workTypes: Schema.Array(WorkType)
})
export type OrgEverhourConfig = typeof OrgEverhourConfig.Type

export const DEFAULT_WORK_TYPES: ReadonlyArray<WorkType> = [
  { key: "development", label: "Development", order: 0, isDefault: true },
  { key: "design", label: "Design", order: 1, isDefault: false },
  { key: "project_management", label: "Project Management", order: 2, isDefault: false },
  { key: "meetings", label: "Meetings & Workshops", order: 3, isDefault: false },
  { key: "testing", label: "Testing", order: 4, isDefault: false }
]
```

- [ ] **Step 2: Export it** from `packages/shared/src/index.ts` (follow existing `export * from "./schemas/..."` lines).

- [ ] **Step 3: Add the `config` column.** In `schema.ts`, inside `organizationIntegration` columns add (import `jsonb` from `drizzle-orm/pg-core` if not present):

```ts
config: jsonb("config").$type<import("@projectproject/shared").OrgEverhourConfig>(),
```

- [ ] **Step 4: Seed defaults on connect.** In `EverhourIntegrations.ts` `createOrReuseProjectLink`, where `organizationIntegration` is inserted (~511-524), set `config: { workTypes: DEFAULT_WORK_TYPES }` on insert; on the update branch (~526-536) set config only if currently null (`config: orgIntegration.config ?? { workTypes: DEFAULT_WORK_TYPES }`). Import `DEFAULT_WORK_TYPES`.

- [ ] **Step 5: Generate the migration.**

Run: `cd packages/backend && bun db:generate`
Expected: a new `0018_*.sql` adding `config jsonb` to `organization_integration`. Inspect it.

- [ ] **Step 6: Typecheck + commit.**

Run: `bun run typecheck`
Expected: PASS

```bash
git add packages/shared/src/schemas/WorkType.ts packages/shared/src/index.ts packages/backend/src/db/schema.ts packages/backend/src/db/migrations packages/backend/src/Layers/EverhourIntegrations.ts
git commit -m "feat(everhour): org work-type config + default seed"
```

### Task 1.2: Work-type task link table; retire ticket task link

**Files:**
- Modify: `packages/backend/src/db/schema.ts` (replace `everhourTaskLink` ~433-458 with `everhourWorkTypeTaskLink`; remove its relations if any)
- Modify: `packages/backend/src/Layers/EverhourIntegrations.ts` (remove imports of `everhourTaskLink`)

**Interfaces:**
- Produces: table `everhourWorkTypeTaskLink` with PK `(projectIntegrationLinkId, groupId, workTypeKey)`, columns `everhourTaskId text notNull`, `name text notNull`, `status text {active,archived,broken} notNull`, `lastSyncedAt timestamptz`.

- [ ] **Step 1: Replace the table.** In `schema.ts`:

```ts
export const everhourWorkTypeTaskLink = pgTable(
  "everhour_work_type_task_link",
  {
    projectIntegrationLinkId: uuid("project_integration_link_id").notNull(),
    groupId: text("group_id").notNull(),
    workTypeKey: text("work_type_key").notNull(),
    everhourTaskId: text("everhour_task_id").notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "archived", "broken"] }).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
  },
  (t) => [
    primaryKey({ columns: [t.projectIntegrationLinkId, t.groupId, t.workTypeKey] }),
    foreignKey({
      name: "everhour_work_type_task_link_project_link_fkey",
      columns: [t.projectIntegrationLinkId],
      foreignColumns: [projectIntegrationLink.id]
    }).onDelete("cascade")
  ]
)
```

Delete the `everhourTaskLink` definition.

- [ ] **Step 2: Generate migration.** `cd packages/backend && bun db:generate` → `0019_*.sql` drops `everhour_task_link`, creates `everhour_work_type_task_link`. Inspect.

- [ ] **Step 3: Typecheck.** `bun run typecheck` will now FAIL in `EverhourIntegrations.ts` (references to `everhourTaskLink`). That's expected — Task 1.3 removes them. Commit schema only:

```bash
git add packages/backend/src/db/schema.ts packages/backend/src/db/migrations
git commit -m "feat(everhour): replace ticket task link with work-type task link"
```

### Task 1.3: Everhour client — section/task helpers for work-type sync

The existing `Everhour` client (`Services/Everhour.ts` + `Layers/Everhour.ts`) already has `createSection`, `updateSection`, `createTask`, `updateTask`, `getTask`, `getProject`, `createProject`, `updateProject`. No client change is needed for structure — work-type tasks reuse `createTask`/`updateTask`. Confirm and skip if so.

- [ ] **Step 1: Verify** `createTask(apiKey, projectId, payload)` and `updateTask(apiKey, taskId, payload)` exist with `EverhourTaskPayload = { name, section, labels, description, status }`. No commit needed.

### Task 1.4: Rebuild `syncTasks` → `syncWorkTypeTasks`

**Files:**
- Modify: `packages/backend/src/Layers/EverhourIntegrations.ts` (replace `syncTasks` ~721-881; adjust `syncSections` to drop the synthetic backlog; remove `sectionForTicket` ~193-207 and `managedLabels`/`typeLabel` if now unused; update `runFullSync` ~933-934)
- Create test: `packages/backend/src/Layers/EverhourIntegrations.test.ts`

**Interfaces:**
- Consumes: `OrgEverhourConfig` (read from `organizationIntegration.config`), `everhourSectionLink` (one row per sprint), `everhourWorkTypeTaskLink`.
- Produces: `syncWorkTypeTasks(apiKey, link, summary, orgSlug, slug)` that, for every **open** sprint section, ensures one Everhour task per configured work-type named `"{sprintName} — {workTypeLabel}"`; renames on drift; closes on sprint completion.

- [ ] **Step 1: Drop the synthetic backlog section.** In `syncSections` (~624-632) remove the `{ localKey: "backlog", ... }` entry from `desired` so only sprint sections are created. Keep archive-on-complete behavior. Remove the `backlogSectionId` write (~659-670) — leave the column for now (harmless), but stop setting it.

- [ ] **Step 2: Write `syncWorkTypeTasks`.** Replace `syncTasks` with logic that:
  1. Reads `config = orgIntegration.config ?? { workTypes: DEFAULT_WORK_TYPES }`.
  2. Loads sprint groups (reuse the `groupDocs` sprint-loading from `syncSections`).
  3. Loads existing `everhourWorkTypeTaskLink` rows for `link.linkId`.
  4. For each sprint × each work-type: desired task `name = "${sprint.name} — ${workType.label}"`, `section = <sprint's everhourSectionId>`, `status = sprint.completedAt ? "closed" : "open"`, `description = ""`, `labels = []`. If no link row → `everhour.createTask` (wrapped in `mutate`), insert row (`status:"active"`). If row exists and `name`/closed-state drifted → `everhour.updateTask`, update row. Count into `summary.tasksCreated/tasksUpdated/tasksClosed`.
  5. For sprints that no longer exist or are completed: set the matching task `status:"closed"` via `updateTask` and mark the link row `status:"archived"`. **Never delete.**

Sketch (mirror `syncSections` style; `mutate` and `db` are in closure scope):

```ts
const syncWorkTypeTasks = (apiKey, link, summary, orgSlug, slug, config) =>
  Effect.gen(function* () {
    const now = yield* DateTime.nowAsDate
    const sections = yield* db.query.everhourSectionLink.findMany({
      where: eq(everhourSectionLink.projectIntegrationLinkId, link.linkId)
    }).pipe(Effect.orDie)
    const existing = yield* db.query.everhourWorkTypeTaskLink.findMany({
      where: eq(everhourWorkTypeTaskLink.projectIntegrationLinkId, link.linkId)
    }).pipe(Effect.orDie)
    const byKey = new Map(existing.map((r) => [`${r.groupId}:${r.workTypeKey}`, r]))
    for (const section of sections.filter((s) => s.groupId !== null)) {
      const closed = section.status === "archived"
      for (const wt of config.workTypes) {
        const name = `${section.name} — ${wt.label}`
        const row = byKey.get(`${section.groupId}:${wt.key}`)
        const payload = { name, section: section.everhourSectionId, labels: [], description: "", status: closed ? "closed" as const : "open" as const }
        if (!row) {
          const created = yield* mutate(everhour.createTask(apiKey, link.everhourProjectId, payload))
          yield* db.insert(everhourWorkTypeTaskLink).values({
            projectIntegrationLinkId: link.linkId, groupId: section.groupId!,
            workTypeKey: wt.key, everhourTaskId: created.id, name: created.name,
            status: closed ? "archived" : "active", lastSyncedAt: now
          }).pipe(Effect.orDie)
          summary.tasksCreated++
        } else if (row.name !== name || (closed && row.status !== "archived")) {
          yield* mutate(everhour.updateTask(apiKey, row.everhourTaskId, payload))
          yield* db.update(everhourWorkTypeTaskLink).set({
            name, status: closed ? "archived" : "active", lastSyncedAt: now
          }).where(and(
            eq(everhourWorkTypeTaskLink.projectIntegrationLinkId, link.linkId),
            eq(everhourWorkTypeTaskLink.groupId, section.groupId!),
            eq(everhourWorkTypeTaskLink.workTypeKey, wt.key)
          )).pipe(Effect.orDie)
          if (closed) summary.tasksClosed++; else summary.tasksUpdated++
        }
      }
    }
  })
```

- [ ] **Step 3: Wire it into `runFullSync`.** Replace the `yield* syncTasks(...)` call (~934) with reading the org config then `yield* syncWorkTypeTasks(apiKey, link, summary, orgSlug, slug, config)`. Load config via `db.query.organizationIntegration.findFirst` for the link's org integration (the join already resolves `organizationId`).

- [ ] **Step 4: Remove now-dead code.** Delete `sectionForTicket`, `managedLabels`, `typeLabel`, the `ticketDocs`/`ticketIndex` uses that only served ticket-tasks if unused elsewhere in this file. Keep `bestEffortCloseDeletedTicket`? It targets `everhourTaskLink` which is gone — **delete `bestEffortCloseDeletedTicket`** and remove its interface entry (Task 1.6 cleans the handler/tickets caller).

- [ ] **Step 5: Write the test.** In `EverhourIntegrations.test.ts`, using the `@effect/vitest` + fake-layer pattern from `Tickets.test.ts`, build a fake `Everhour` client that records `createTask`/`updateTask` calls, fake `GroupDocs` returning two sprints (one open, one completed) and the config, and assert: open sprint → one task per work-type named `"<sprint> — <label>"`; completed sprint → tasks created with `status:"closed"`; a second sync run creates nothing new (idempotent). Assert no `createTask` is called per-ticket.

- [ ] **Step 6: Run tests + typecheck.**

Run: `bun --filter @projectproject/backend test` and `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit.**

```bash
git add packages/backend/src/Layers/EverhourIntegrations.ts packages/backend/src/Services/EverhourIntegrations.ts packages/backend/src/Layers/EverhourIntegrations.test.ts
git commit -m "feat(everhour): sync per-sprint work-type tasks, retire ticket tasks"
```

### Task 1.5: Sprint-lifecycle triggers; FIXME for future config edits

**Files:**
- Modify: `packages/backend/src/handlers/tickets.ts` (remove `bestEffortProjectSync` / `bestEffortCloseDeletedTicket` calls — ticket mutations no longer change Everhour structure)
- Modify: `packages/backend/src/handlers/groups.ts` (keep `bestEffortProjectSync` on create/update/complete/delete — already present)
- Modify: `packages/backend/src/Layers/EverhourIntegrations.ts` (add FIXME)

- [ ] **Step 1: Strip ticket-side sync.** In `handlers/tickets.ts`, remove the `EverhourIntegrations` import and every `bestEffortProjectSync` / `bestEffortCloseDeletedTicket` call (the commit `b52f754` added 28 lines here). Tickets handlers return to their pre-Everhour shape.

- [ ] **Step 2: Confirm group triggers remain.** `handlers/groups.ts` keeps `bestEffortProjectSync` on `create`, `update`, `updateTickets`→ may drop (ticket membership no longer structural; leave `update`/`complete`/`delete`). Remove the `updateTickets`/`updateTicketOrder` sync calls (no structural effect). Keep `create`, `update`, `complete`, `delete`.

- [ ] **Step 3: Add the FIXME** at the top of `syncWorkTypeTasks` (single line, explicitly user-requested):

```ts
// FIXME: when the org-settings work-type editor lands, propagate set edits to open sprints (rename→rename, add→create, remove→archive); completed sprints stay frozen.
```

- [ ] **Step 4: Typecheck + test + commit.**

Run: `bun run typecheck` && `bun --filter @projectproject/backend test`
Expected: PASS

```bash
git add packages/backend/src/handlers/tickets.ts packages/backend/src/handlers/groups.ts packages/backend/src/Layers/EverhourIntegrations.ts
git commit -m "feat(everhour): structural sync only on sprint lifecycle"
```

### Task 1.6: Manual verification checkpoint (Phase 1)

- [ ] **Step 1:** Run migrations against a dev DB (`cd packages/backend && bun db:migrate`).
- [ ] **Step 2:** Connect a project to Everhour (existing `connectProject` flow), create a sprint, and confirm in the Everhour board: a section per sprint, and 5 tasks `"<sprint> — Development|Design|Project Management|Meetings & Workshops|Testing"`. Complete the sprint → tasks become closed. No per-ticket tasks appear.

---

## Phase 2 — Capture

Add timer + manual time capture, the active-timer and attribution tables, the webhook, and the atoms. Reference: `Services/Everhour.ts`, `Layers/Everhour.ts`, `handlers/everhour.ts`, `shared/src/api.ts` (`EverhourGroup` ~377-450), `shared/src/errors.ts` (~178-205), `atoms/everhour.ts`, the GitHub webhook raw-route pattern in `main.ts`.

### Task 2.1: Everhour client — timers + add time

**Files:**
- Modify: `packages/backend/src/Services/Everhour.ts` (extend `EverhourShape`)
- Modify: `packages/backend/src/Layers/Everhour.ts` (implement)

**Interfaces:**
- Produces on `EverhourShape`:
  - `startTimer(apiKey, input: { task: string; comment?: string; userDate?: string }) => Effect<EverhourTimer, EverhourClientError>`
  - `stopTimer(apiKey) => Effect<EverhourTimeRecord | null, EverhourClientError>` (returns created record; `null` if none running)
  - `getCurrentTimer(apiKey) => Effect<EverhourTimer | null, EverhourClientError>`
  - `addTime(apiKey, input: { task: string; time: number; date: string; comment?: string }) => Effect<EverhourTimeRecord, EverhourClientError>`
  - Types: `EverhourTimer = { id: string | null; status: "active" | "stopped"; taskId: string | null; userId: string | null; startedAt: string | null }`; `EverhourTimeRecord = { id: string; taskId: string | null; userId: string | null; seconds: number; date: string; comment: string | null }`.

- [ ] **Step 1:** Add the types + method signatures to `EverhourShape` in `Services/Everhour.ts`.

- [ ] **Step 2:** Implement in `Layers/Everhour.ts` using the existing `request` helper and mappers. Endpoints (from `docs/everhour-api-schema.yml`): `POST /timers` body `{ task, comment?, userDate? }`; `DELETE /timers/current` (stop); `GET /timers/current`; `POST /time` body `{ task, time, date, comment? }`. Add `mapTimer` and `mapTimeRecord` mirroring `mapTask`. `stopTimer`/`getCurrentTimer` must treat a "no active timer" 404/`status:"stopped"` body as `null`, not an error.

- [ ] **Step 3:** Typecheck. `bun run typecheck` → PASS.

- [ ] **Step 4: Commit.**

```bash
git add packages/backend/src/Services/Everhour.ts packages/backend/src/Layers/Everhour.ts
git commit -m "feat(everhour): timer + add-time client methods"
```

### Task 2.2: Capture tables — active timer + attribution

**Files:**
- Modify: `packages/backend/src/db/schema.ts`
- Modify: `packages/backend/src/db/schema.ts` (add `webhookId`, `webhookSecret` to `projectEverhourIntegration` ~377-408)

**Interfaces:**
- Produces:
  - `everhourActiveTimer` PK `everhourUserId text`; cols `userId text notNull`, `projectIntegrationLinkId uuid notNull`, `ticketId text` (nullable), `groupId text notNull`, `workTypeKey text notNull`, `everhourTaskId text notNull`, `everhourTimerId text`, `startedAt timestamptz notNull`.
  - `everhourTimeAttribution` PK `everhourTimeId text`; cols `projectIntegrationLinkId uuid notNull`, `ticketId text` (nullable), `groupId text notNull`, `workTypeKey text notNull`, `everhourUserId text notNull`, `userId text notNull`, `seconds integer notNull`, `date text notNull`, `updatedAt timestamptz notNull`.
  - `projectEverhourIntegration.webhookId text`, `.webhookSecret text`.

- [ ] **Step 1:** Add both tables (FKs to `projectIntegrationLink.id`, `onDelete("cascade")`), indexes on `(projectIntegrationLinkId, ticketId)` for attribution and `(userId)` for active timer. Add the two columns to `projectEverhourIntegration`.

- [ ] **Step 2:** `cd packages/backend && bun db:generate` → inspect `0020_*.sql`.

- [ ] **Step 3: Typecheck + commit.**

```bash
git add packages/backend/src/db/schema.ts packages/backend/src/db/migrations
git commit -m "feat(everhour): active-timer + time-attribution tables"
```

### Task 2.3: Shared API — errors, schemas, endpoints

**Files:**
- Modify: `packages/shared/src/errors.ts` (add `EverhourTimerConflict` if needed; reuse existing Everhour errors otherwise)
- Create: `packages/shared/src/schemas/TimeTracking.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/api.ts` (extend `EverhourGroup`)

**Interfaces:**
- Produces schemas:
  - `WorkTypeOption = { key, label }` (resolved from org config for a ticket's sprint)
  - `StartTimerInput = { workTypeKey: string; comment?: string }` (path carries org/project/ticket; sprint resolved server-side)
  - `StartSprintTimerInput = { workTypeKey: string; comment?: string }`
  - `LogTimeInput = { workTypeKey: string; seconds: number; date: string; comment?: string; ticketId?: string | null }`
  - `ActiveTimer = { ticketId: string | null; ticketTitle: string | null; groupId: string; workTypeKey: string; workTypeLabel: string; everhourTaskId: string; startedAt: Date }` (nullable wrapper: endpoint returns `ActiveTimer | null`)
  - `TicketTimeSummary = { ticketId: string; totalSeconds: number; userSeconds: number }`
- Produces endpoints on `EverhourGroup` (all `.middleware(Authentication)` already on group):
  - `GET /orgs/:orgSlug/projects/:slug/tickets/:ticketId/everhour/work-types` → `ReadonlyArray<WorkTypeOption>` (empty if ticket not in a sprint)
  - `POST /orgs/:orgSlug/projects/:slug/tickets/:ticketId/everhour/timer/start` payload `StartTimerInput` → `ActiveTimer`
  - `POST /orgs/:orgSlug/projects/:slug/groups/:groupId/everhour/timer/start` payload `StartSprintTimerInput` → `ActiveTimer`
  - `POST /orgs/:orgSlug/everhour/timer/stop` → `Schema.NullOr(ActiveTimer)` (stops whatever's running for the user; returns the now-cleared timer or null)
  - `GET /orgs/:orgSlug/everhour/timer/current` → `Schema.NullOr(ActiveTimer)`
  - `POST /orgs/:orgSlug/projects/:slug/everhour/time` payload `LogTimeInput` → `TicketTimeSummary | { ok: true }`
  - `GET /orgs/:orgSlug/projects/:slug/tickets/:ticketId/everhour/time` → `TicketTimeSummary`
- Error additions on the timer/time endpoints: `EverhourApiKeyMissing`, `EverhourAuthInvalid`, `EverhourRateLimited`, `EverhourError`, `NotFound` (ticket not in a sprint / no work-type), `Unauthorized`.

- [ ] **Step 1:** Create `schemas/TimeTracking.ts` with the structs above. Export from `index.ts`.

- [ ] **Step 2:** Extend `EverhourGroup` in `api.ts` with the endpoints, mirroring the existing `.add(HttpApiEndpoint...)` blocks; set `.setPath(...)` with the right path schema (add a `TicketPath`/`GroupPath` if not already present — check `shared/src/api.ts` for existing path schemas to reuse).

- [ ] **Step 3:** Typecheck (`bun run typecheck`) — backend will fail until handlers exist; that's expected. Commit shared only.

```bash
git add packages/shared/src
git commit -m "feat(everhour): time-tracking API surface"
```

### Task 2.4: `EverhourTimeTracking` service + layer

**Files:**
- Create: `packages/backend/src/Services/EverhourTimeTracking.ts`
- Create: `packages/backend/src/Layers/EverhourTimeTracking.ts`
- Create test: `packages/backend/src/Layers/EverhourTimeTracking.test.ts`
- Modify: `packages/backend/src/runtime.ts` (register layer)

**Interfaces:**
- Consumes: `Everhour` client (2.1), `EverhourIntegrations` helpers (`actorApiKey`, project resolution — export the needed helpers or duplicate the small resolvers), `everhourActiveTimer`, `everhourTimeAttribution`, `everhourWorkTypeTaskLink`, `everhourSectionLink`, `GroupDocs`, `TicketDocs`, org config.
- Produces `EverhourTimeTrackingShape`:
  - `workTypesForTicket(orgSlug, userId, slug, ticketId) => Effect<ReadonlyArray<WorkTypeOption>, NotFound>`
  - `startTicketTimer(orgSlug, userId, slug, ticketId, input) => Effect<ActiveTimer, EverhourTimeTrackingError>`
  - `startSprintTimer(orgSlug, userId, slug, groupId, input) => Effect<ActiveTimer, EverhourTimeTrackingError>`
  - `stopTimer(orgSlug, userId) => Effect<ActiveTimer | null, EverhourTimeTrackingError>`
  - `currentTimer(orgSlug, userId) => Effect<ActiveTimer | null, EverhourTimeTrackingError>`
  - `logTime(orgSlug, userId, slug, input) => Effect<TicketTimeSummary, EverhourTimeTrackingError>`
  - `ticketTimeSummary(orgSlug, userId, slug, ticketId) => Effect<TicketTimeSummary, NotFound>`
  - `applyWebhookTimeEvent(record: EverhourTimeRecord) => Effect<void>` (idempotent; matches active timer by `(everhourUserId, everhourTaskId)`, writes/updates attribution, clears the matched active-timer row)

- [ ] **Step 1: Resolution helper.** Implement `resolveWorkTypeTask(linkId, ticketId|groupId, workTypeKey)`: find the ticket's sprint via `groupDocs` (reuse the sprint-membership logic; ticket not in a sprint → `NotFound`), then look up `everhourWorkTypeTaskLink` by `(linkId, groupId, workTypeKey)`. Returns `{ groupId, everhourTaskId, workTypeLabel }`.

- [ ] **Step 2: `startTicketTimer`.** Steps: `actorApiKey(userId)` → if missing, fail `EverhourApiKeyMissing` (drives the inline-connect UI). Resolve work-type task. Build comment `"${ticketId} — ${ticketTitle}${input.comment ? " — " + input.comment : ""}"`. Call `everhour.startTimer(apiKey, { task, comment })` (this auto-stops any prior timer — if PP tracked one, finalize it first via `finalizeActiveTimerFromCurrent`). Upsert `everhourActiveTimer` (PK `everhourUserId`). Return `ActiveTimer`.

- [ ] **Step 3: `stopTimer`.** `everhour.stopTimer(apiKey)` → returns the created `EverhourTimeRecord`. If a matching active-timer row exists, write attribution (`applyWebhookTimeEvent` shares this) and delete the active-timer row. Return the cleared `ActiveTimer` (or null).

- [ ] **Step 4: `logTime`.** Resolve work-type task (ticket or ticket-less sprint via `input.ticketId`/group). `everhour.addTime(apiKey, { task, time: input.seconds, date: input.date, comment })`. Write attribution row keyed by the returned `everhourTimeId`. Return `ticketTimeSummary`.

- [ ] **Step 5: `ticketTimeSummary`.** Sum `seconds` from `everhourTimeAttribution` where `(projectIntegrationLinkId, ticketId)`; `userSeconds` filters `everhourUserId = actor`. Return `{ ticketId, totalSeconds, userSeconds }`.

- [ ] **Step 6: `currentTimer`.** Read PP's active-timer row for the user; if present return it; if absent, optionally `everhour.getCurrentTimer(apiKey)` to detect an Everhour-started timer (return an `ActiveTimer` with `ticketId:null` if running). Keep it simple: return PP row if present, else map `getCurrentTimer` to a ticket-less `ActiveTimer`.

- [ ] **Step 7: `applyWebhookTimeEvent`.** Given a time record: find active-timer row by `(everhourUserId, everhourTaskId)`. If found, write attribution (ticketId from the row), delete the active-timer row. If not found but an attribution row exists for `everhourTimeId`, update its `seconds`. Idempotent (`onConflictDoUpdate` on `everhourTimeId`). Records with no match and no existing attribution are ignored (Everhour-direct time).

- [ ] **Step 8: Register** `EverhourTimeTrackingLive` in `runtime.ts` `BackendServicesLive` (provide `EverhourLive`, and `GroupDocsLive`/`TicketDocsLive` as needed — mirror the `EverhourIntegrationsLive` wiring).

- [ ] **Step 9: Tests.** In `EverhourTimeTracking.test.ts` with fakes: (a) `startTicketTimer` calls `startTimer` with a comment containing the ticket id and persists an active-timer row; (b) `stopTimer` writes an attribution row with the ticket id and clears the active timer; (c) `applyWebhookTimeEvent` for a tracked `(user,task)` attributes to the ticket and is idempotent on re-delivery; (d) `ticketTimeSummary` returns correct `totalSeconds`/`userSeconds`; (e) ticket not in a sprint → `workTypesForTicket` returns `[]` and `startTicketTimer` fails `NotFound`.

- [ ] **Step 10: Run + commit.**

Run: `bun --filter @projectproject/backend test` && `bun run typecheck` → PASS

```bash
git add packages/backend/src/Services/EverhourTimeTracking.ts packages/backend/src/Layers/EverhourTimeTracking.ts packages/backend/src/Layers/EverhourTimeTracking.test.ts packages/backend/src/runtime.ts
git commit -m "feat(everhour): time-tracking service"
```

### Task 2.5: Handlers for the time endpoints

**Files:**
- Modify: `packages/backend/src/handlers/everhour.ts` (add the new endpoint handlers)

- [ ] **Step 1:** For each endpoint in 2.3, add a `.handle(...)` mirroring the existing handlers (resolve `CurrentUser` + `CurrentOrg`, call the `EverhourTimeTracking` service). Provide `EverhourTimeTracking` to the handler group (it's in `BackendHttpServicesLive` via runtime).

- [ ] **Step 2: Typecheck + commit.**

Run: `bun run typecheck` → PASS

```bash
git add packages/backend/src/handlers/everhour.ts
git commit -m "feat(everhour): time-tracking handlers"
```

### Task 2.6: Webhook — register on connect, raw route, secret

**Files:**
- Modify: `packages/backend/src/Layers/Everhour.ts` (add `createWebhook`, `deleteWebhook` client methods: `POST /hooks` `{ targetUrl, events:["api:time:updated"], project }`, `DELETE /hooks/{id}`)
- Modify: `packages/backend/src/Layers/EverhourIntegrations.ts` (`connectProject`: after project link exists, generate a random secret, register the webhook with `targetUrl = ${publicBaseUrl}/api/integrations/everhour/webhook/${secret}`, store `webhookId`+`webhookSecret` on `projectEverhourIntegration`; `disconnectProject`: delete the webhook best-effort)
- Modify: `packages/backend/src/main.ts` (add `everhourIntegrationRoutes` mounted at `/api/integrations/everhour`, mirroring `githubIntegrationRoutes`)
- Create: `packages/backend/src/Services/EverhourWebhooks.ts` + `packages/backend/src/Layers/EverhourWebhooks.ts` (parse payload → `EverhourTimeRecord`, resolve the project link by secret, call `EverhourTimeTracking.applyWebhookTimeEvent`)

**Interfaces:**
- Produces: route `POST /api/integrations/everhour/webhook/:secret`; `EverhourWebhooks.handle({ secret, body })`.

- [ ] **Step 1:** Add `createWebhook`/`deleteWebhook` to the `Everhour` client + shape.

- [ ] **Step 2:** In `connectProject` register the webhook (best-effort: if it fails, log a warning and continue — tracking via PP-stop still works). Use `randomBytes(24).toString("base64url")` for the secret.

- [ ] **Step 3:** Implement `EverhourWebhooks`: look up `projectEverhourIntegration` by `webhookSecret = secret` (drop if none → 404). Parse the body defensively into `EverhourTimeRecord` (trust the payload; if `seconds`/`comment` absent, store what's present and let the next `/timers/current` poll reconcile). Call `applyWebhookTimeEvent`. Always return 200 quickly.

- [ ] **Step 4:** Mount the raw route in `main.ts` (`HttpRouter.empty.pipe(HttpRouter.post("/webhook/:secret", everhourWebhookRoute))` mounted at `/api/integrations/everhour`), provide `EverhourWebhooksLive` + `EverhourTimeTracking` to `ServerLive`. Note `mountApp` ordering: register before the `/api` catch-all (it already is, following the GitHub example).

- [ ] **Step 5: Test** `EverhourWebhooks` payload parsing + dispatch with a fake `EverhourTimeTracking`. Assert unknown secret → no dispatch; valid → `applyWebhookTimeEvent` called with mapped record.

- [ ] **Step 6: Run + commit.**

```bash
git add packages/backend/src
git commit -m "feat(everhour): time webhook ingest + registration"
```

### Task 2.7: Frontend atoms

**Files:**
- Create: `packages/frontend/src/atoms/timeTracking.ts`

**Interfaces:**
- Produces (mirror `atoms/everhour.ts` family-key + optimistic patterns):
  - `activeTimerAtom(orgSlug)` — base + optimistic; reads `current` endpoint.
  - `startTicketTimerAtom(ticketKey)`, `startSprintTimerAtom(groupKey)`, `stopTimerAtom(orgSlug)` — `optimisticFn`, refresh `activeTimerBaseAtom` + the affected `ticketTimeAtom`.
  - `ticketTimeAtom(ticketKey)` — base + optimistic; reads ticket time summary.
  - `logTimeAtom(projectKey)` — `runtime.fn`; refresh `ticketTimeBaseAtom` + `activeTimerBaseAtom`.
  - `workTypesForTicketAtom(ticketKey)` — runtime atom reading the work-types endpoint.

- [ ] **Step 1:** Implement using `ApiClient` like `atoms/everhour.ts`. Use the existing `ticketKey(orgSlug, slug, id)` / `projectKey(orgSlug, slug)` helpers (check `atoms/tickets.ts`).

- [ ] **Step 2: Typecheck + commit.**

```bash
git add packages/frontend/src/atoms/timeTracking.ts
git commit -m "feat(everhour): time-tracking atoms"
```

---

## Phase 3 — UI & Display

Reference: `packages/frontend/src/routes/_authed/profile.tsx` (existing Everhour connect), `components/TicketPage/TicketPage.tsx`, `components/TicketGit/*` (inline-form / connect patterns), `routes/.../sprints/$groupId.tsx`, app shell layout for the global indicator, `lib/errorMessage.ts`.

### Task 3.1: i18n scaffolding

- [ ] **Step 1:** Create `packages/frontend/messages/en/time.json` with the `time_` keys you will use (start_timer, stop_timer, log_time, log_time_duration, log_time_date, log_time_note, work_type_label, tracked_time_total, tracked_time_yours, sync_explainer_popover, connect_everhour_prompt, connect_everhour_cta, timer_running_on, timer_switch_confirm, …). Sort by prefix, alphabetical within.
- [ ] **Step 2:** Update the i18n table in `CLAUDE.md` (add `time.json` → `time_`) and the Inlang `pathPattern` (find the inlang settings file: `grep -rl pathPattern packages/frontend`).
- [ ] **Step 3:** Run the paraglide compile (the dev/build step does this; `bun run --filter @projectproject/frontend build` or the project's message-compile script) so `@/paraglide/messages` exposes `m.time_*`.
- [ ] **Step 4: Commit.**

```bash
git add packages/frontend/messages/en/time.json CLAUDE.md packages/frontend/project.inlang
git commit -m "feat(everhour): i18n time_ domain"
```

### Task 3.2: Inline Everhour-connect affordance

**Files:**
- Create: `packages/frontend/src/components/time/ConnectEverhourInline.tsx`

**Interfaces:**
- Consumes: `everhourProfileAtom`, `connectEverhourProfileAtom` (from `atoms/everhour.ts`).
- Produces: `<ConnectEverhourInline onConnected={() => void} />` — an inline API-key field + verify button; on success calls `onConnected`. Reuses the existing connect mutation; surfaces failure via `errorMessage.ts`.

- [ ] **Step 1:** Build the inline form (shadcn `Input` + `Button`, press-feel classes). On submit, set `connectEverhourProfileAtom({ apiKey })`; read `waiting`/`Result.isFailure` for state per the optimistic-form convention.
- [ ] **Step 2:** Typecheck + commit.

```bash
git add packages/frontend/src/components/time/ConnectEverhourInline.tsx
git commit -m "feat(everhour): inline connect affordance"
```

### Task 3.3: Ticket timer + log-time + tracked-time display

**Files:**
- Create: `packages/frontend/src/components/time/TicketTimePanel.tsx`
- Create: `packages/frontend/src/components/time/LogTimeForm.tsx`
- Create: `packages/frontend/src/components/time/WorkTypeSelect.tsx`
- Modify: `packages/frontend/src/components/TicketPage/TicketPage.tsx` (mount `TicketTimePanel`)

**Interfaces:**
- `WorkTypeSelect`: props `{ value, onChange, options: WorkTypeOption[] }`; default selection = last-used (resolved by the panel from `ticketTimeAtom`/a small "last work type" read) → org default.
- `TicketTimePanel`: shows tracked time (total + yours) with an "i" `Popover` (shadcn) explaining sync; a Start/Stop control; a "Log time" trigger opening `LogTimeForm`. If `everhourProfileAtom` shows disconnected, render `ConnectEverhourInline` in place of the controls. If the ticket isn't in a sprint (`workTypesForTicketAtom` empty), show a disabled state nudging "add to a sprint".

- [ ] **Step 1:** `WorkTypeSelect` (shadcn `Select`/`SegmentedTabs` — prefer extending an existing primitive variant per CLAUDE.md over local styling).
- [ ] **Step 2:** `LogTimeForm` — duration (parse `1h 30m` / minutes), date (default today, active locale via `getLocale()`), work-type, free-text note. Submits `logTimeAtom(projectKey)`.
- [ ] **Step 3:** `TicketTimePanel` — compose the above; render `Result.matchWithError` over `ticketTimeAtom`. Pulse the tracked-time number while the relevant mutation `waiting`.
- [ ] **Step 4:** Mount in `TicketPage.tsx`. Strings via `m.time_*`. Press-feel + hover-transition classes on every button.
- [ ] **Step 5:** Typecheck + commit.

```bash
git add packages/frontend/src/components/time packages/frontend/src/components/TicketPage/TicketPage.tsx
git commit -m "feat(everhour): ticket time panel, timer + log-time UI"
```

### Task 3.4: Global running-timer indicator

**Files:**
- Create: `packages/frontend/src/components/time/RunningTimerIndicator.tsx`
- Modify: the app shell/header component (find via `grep -rl "nav_" packages/frontend/src/components` or the `_authed` layout route)

**Interfaces:**
- Consumes: `activeTimerAtom(orgSlug)`, `stopTimerAtom(orgSlug)`.
- Behavior: if a timer is running and PP knows the ticket → clickable, navigates to the ticket (TanStack `Link`), shows ticket + work-type + live elapsed (client-side ticking from `startedAt`). If running but ticket-less (Everhour-started) → show task/work-type label + a "Stop timer" button only. If none → render nothing.

- [ ] **Step 1:** Implement with a `setInterval` elapsed counter derived from `startedAt` (cleanup on unmount; per react-useeffect best practices, derive display from a tick state, don't store elapsed in state redundantly).
- [ ] **Step 2:** Mount in the app shell. Press-feel on the stop button.
- [ ] **Step 3:** Typecheck + commit.

```bash
git add packages/frontend/src/components/time/RunningTimerIndicator.tsx <shell file>
git commit -m "feat(everhour): global running-timer indicator"
```

### Task 3.5: Sprint-level (ticket-less) logging entry point

**Files:**
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId.tsx`

- [ ] **Step 1:** Add a Start/Log control on the sprint view that uses `startSprintTimerAtom(groupKey)` and `logTimeAtom(projectKey)` with `ticketId: null`. Reuse `WorkTypeSelect`/`LogTimeForm`. Low-commitment — if the UX is awkward it can be dropped without touching the backend.
- [ ] **Step 2:** Typecheck + commit.

```bash
git add packages/frontend/src/routes/_authed/orgs/\$orgSlug/projects/\$slug/sprints/\$groupId.tsx
git commit -m "feat(everhour): sprint-level time logging"
```

### Task 3.6: errorMessage mappings + manual verification

**Files:**
- Modify: `packages/frontend/src/lib/errorMessage.ts`

- [ ] **Step 1:** Ensure any new tagged errors surfaced in UI (e.g. `EverhourApiKeyMissing` driving the connect prompt) map to friendly strings.
- [ ] **Step 2: Manual checkpoint.** Run the app (`bun run dev`). Connect personal Everhour inline from a ticket; start a timer; confirm the global indicator ticks; stop it; confirm tracked-time (total + yours) updates and the Everhour task `Sprint X — Development` shows the time with the `T-… — title` comment. Stop a timer from Everhour directly and confirm the webhook clears PP's indicator and attributes the time. Log manual time; confirm it lands.
- [ ] **Step 3: Commit.**

```bash
git add packages/frontend/src/lib/errorMessage.ts
git commit -m "feat(everhour): error messages for time tracking"
```

---

## Phase 4 — Deferred (not in this build)

Do **not** implement; listed so the agent doesn't add them speculatively:
- Estimation (per-ticket PP estimates, estimate-vs-actual reports, rolled-up Everhour task estimates).
- Reporting surface (sprint/work-type rollups, per-user breakdowns, charts).
- Work-type editor UI (ships with the in-progress org-settings surface; the `FIXME` from Task 1.5 marks the reconcile site).
- Importer for Everhour-direct (ticket-less) time. `ticketId` nullability already leaves the door open without migration.

---

## Self-Review Notes

- **Spec coverage:** Model B structure (P1), per-user timers + switch (2.4/3.4), manual log time (2.4/3.3), webhook stop detection (2.6), ticket-less sprint logging (2.4/3.5), per-user inline connect (3.2), both user+total display with info popover (3.3), org config seed no-editor (1.1), retire ticket=task + sprint-lifecycle triggers (1.4/1.5), sprint complete=close / delete=archive-never-delete (1.4), webhook trust-payload + secret URL (2.6), i18n `time_` (3.1). All covered.
- **Sacred-records invariant:** no task in this plan issues an Everhour `DELETE` on a time record or task; sprint delete archives.
- **Idempotency:** `applyWebhookTimeEvent` upserts on `everhourTimeId`; stop path and webhook path share it, so a PP-stop followed by a webhook for the same record does not double-count.
