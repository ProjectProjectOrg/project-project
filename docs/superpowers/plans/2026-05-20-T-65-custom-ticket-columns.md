# T-65 Custom Ticket Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each project define custom statuses beyond the three permanent baselines (`todo` / `in_progress` / `done`), each with a Lucide icon and a color, surfaced in the kanban (with iOS-style long-press reorder), the status select popover, and URL filtering.

**Architecture:** Custom statuses are stored in a new `project_status` Postgres table parallel to `project_tag`. The three baselines are materialized as rows on project creation (and backfilled for existing projects), sealed at the API layer — only `order_key` is mutable. `ticket_index.status` widens from a `text_enum` to plain `text`. Slugs are derived from labels (NFKD-normalized kebab-case, project-scoped unique). Renames cascade the slug across `ticket_index` and ticket markdown frontmatter, modeled on the existing `Tags.rewriteTagInTickets` pattern under `withProjectLock`. Frontend mutations are family-keyed by `projectKey` per CLAUDE.md conventions; cosmetic edits use `Atom.optimisticFn` for instant UI; rename-with-slug-change and delete-with-reassign use the pulse-only optimistic pattern because they touch multiple atoms.

**Tech Stack:** Effect 3.x, Effect Schema, Drizzle, `@effect-atom/atom-react`, TanStack Router, `motion/react`, `lucide-react`, paraglide for i18n. New dependency: `fractional-indexing` (~2KB) for `order_key` generation.

**Branch & ticket:** Branch `feat/T-65-custom-ticket-columns` (already created, pushed, attached to T-65). Closes T-65.

---

## Background — settled design decisions

These came out of grilling and are locked. Full state in memory at `~/.claude/projects/C--web-project-project/memory/project_custom_statuses_T65.md`. Do not redesign during implementation; if you hit a wall, escalate.

- **Statuses are opaque user-content.** No `kind` / `isCompleted` flag. The in-flight workflow feature will own all semantic mappings.
- **Three baseline statuses (`todo` / `in_progress` / `done`) are permanent and sealed.** Name, icon, color are hardcoded; only `order_key` is editable. Baselines are materialized as rows in `project_status` (auto-seeded on project create, backfilled for existing projects). Sealing enforced at the API layer.
- **Custom statuses have: `slug` (immutable-per-identity, derived from label), `label` (mutable display string), `icon` (one of a curated Lucide name set), `color` (hex from `TAG_COLOR_WHEEL`), `order_key` (fractional-index string).**
- **Slug rules:** lowercase → NFKD normalize → strip combining marks → whitespace → `_` → strip non-`[a-z0-9_]` → trim. Pattern `^[a-z0-9_]+$`, 1–40 chars. Reject if normalization yields empty. Reject on collision with another slug in the same project (including baselines). No auto-suffix.
- **Cosmetic rename fast-path:** if new label normalizes to the same slug, only `label` is updated — no cascade.
- **Rename cascade order:** `withProjectLock` → markdown files first (per-ticket via `Effect.forEach` concurrency 8) → DB transaction (`project_status` row + bulk `ticket_index` update). Mirrors `Tags.rewriteTagInTickets`. Idempotent on retry.
- **Delete with reassign:** inline picker chooses target status. Baselines are valid targets; baselines themselves cannot be deleted. Zero-ticket statuses skip the picker. Reuses the rename cascade exactly with a different target slug.
- **Frontend optimistic strategy:**
  - Cosmetic ops (label-only rename, icon, color, reorder, create): standard `Atom.optimisticFn` family-keyed by `projectKey(orgSlug, slug)`. Reducer mutates the entry in the optimistic `projectStatuses` view.
  - Cascading ops (rename with slug change, delete with reassign): pulse-only reducer per CLAUDE.md's "hard to model" guidance. `Result.success(current.value, { waiting: true })`. Pulse on the affected column header. `fn` refreshes both `projectStatusesBaseAtom` and `ticketIndexBaseAtom` after cascade lands.
- **UI home: settings only for CRUD.** "Manage statuses →" link from the status select popover and the kanban board. Reorder on the kanban itself (iOS-style long-press); reorder also available in settings.
- **All columns always show on the kanban, even when empty.**
- **No comments in code** (project rule per CLAUDE.md). Explanation lives in commit messages.
- **i18n:** baseline labels stay paraglide-translated (`tickets_status_todo` etc.). Custom labels are user content — rendered verbatim, not translated.

---

## File structure

### Files to create

- `packages/shared/src/slug.ts` — `deriveStatusSlug(label: string): string`, `isReservedStatusSlug(slug: string): boolean`. Pure utility.
- `packages/shared/src/slug.test.ts` — derivation + reserved-slug tests.
- `packages/shared/src/schemas/Status.ts` — `StatusSlug`, `StatusLabel`, `StatusIcon`, `StatusColor`, `OrderKey`, `ProjectStatus`, `CreateStatusInput`, `UpdateStatusInput`, `ReorderStatusInput`, `DeleteStatusInput`, plus `BASELINE_STATUS_SLUGS` const tuple.
- `packages/backend/src/db/migrations/0016_custom_statuses.sql` — new `project_status` table, `ticket_index.status` ENUM → text, baseline row backfill for every existing project.
- `packages/backend/src/Services/ProjectStatuses.ts` — service Tag + shape.
- `packages/backend/src/Layers/ProjectStatuses.ts` — implementation.
- `packages/backend/src/Layers/ProjectStatuses.test.ts` — slug derivation collision, cascade, reorder, delete-with-reassign tests.
- `packages/frontend/src/lib/status-icons.ts` — curated Lucide icon name set + `Schema.Literal` union name + `getStatusIcon(name)` accessor.
- `packages/frontend/src/atoms/projectStatuses.ts` — base atom + optimistic wrapper + create/update/reorder/rename/delete mutation atoms, all family-keyed by `projectKey`.
- `packages/frontend/src/components/StatusIconPicker.tsx` — popover grid of curated Lucide icons.
- `packages/frontend/src/components/StatusEditorRow.tsx` — inline-editable row (label input + icon + color + drag handle + delete).
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/settings/statuses.tsx` — statuses settings page.
- `packages/frontend/src/components/sprints/BoardReorderMode.tsx` — long-press iOS-style reorder gesture handler + UI.

### Files to modify

- `packages/shared/src/schemas/Ticket.ts:24` — relax `TicketStatus` from `Schema.Literal(...)` to `StatusSlug` (free-form slug pattern).
- `packages/shared/src/filters/url.ts:47` — drop hardcoded `STATUS_VALUES` literal; accept any `StatusSlug`-shaped string, comma-separated.
- `packages/shared/src/api.ts` — add `StatusesGroup` with list/create/update/reorder/delete endpoints; register in the `Api`.
- `packages/shared/src/index.ts` — re-export `slug.ts` and `schemas/Status.ts`.
- `packages/backend/src/db/schema.ts` — add `projectStatus` table + relations; change `ticket_index.status` from text-enum to plain text.
- `packages/backend/src/Layers/Tickets.ts` — add `rewriteStatusInTickets` helper (modeled on `Tags.rewriteTagInTickets`); make `replaceStatus` a new method.
- `packages/backend/src/Layers/index.ts` — wire `ProjectStatusesLive` into the live layer.
- `packages/frontend/src/lib/ticket-meta.ts` — convert `STATUS_META`, `STATUS_LABELS` from static records to atom-derived functions (`statusMetaFor(status, statuses)`).
- `packages/frontend/src/components/sprints/board-utils.ts:3-6` — drop hardcoded `BOARD_STATUSES`; consume atom.
- `packages/frontend/src/components/sprints/SprintBoard.tsx` — iterate dynamic columns + integrate `BoardReorderMode`.
- `packages/frontend/src/components/sprints/SprintBoardColumn.tsx` — render dynamic icon/label/color from atom data.
- `packages/frontend/src/components/StatusField.tsx` — list dynamic statuses + "Manage statuses →" link footer.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/settings/route.tsx:11-48` — add `"statuses"` section between `general` and `workflow`.
- `packages/frontend/messages/en/tickets.json` — new keys: `tickets_status_manage_link`, `tickets_status_settings_*`, `tickets_status_create_*`, `tickets_status_delete_*`, `tickets_status_reassign_*`, `tickets_status_validation_*`.
- `packages/frontend/messages/en/projects.json` — `project_settings_statuses_tab`, `project_settings_statuses_heading`, `project_settings_statuses_description`.
- `packages/backend/package.json` — add `fractional-indexing` to dependencies.

### Files to delete

None.

---

## Phase A — Shared types and slug utility

### Task A1: Slug derivation utility

**Files:**
- Create: `packages/shared/src/slug.ts`
- Create: `packages/shared/src/slug.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/slug.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { BASELINE_STATUS_SLUGS } from "./schemas/Status"
import { deriveStatusSlug, isReservedStatusSlug } from "./slug"

describe("deriveStatusSlug", () => {
  it("lowercases and underscores spaces", () => {
    expect(deriveStatusSlug("In review")).toBe("in_review")
  })

  it("strips punctuation", () => {
    expect(deriveStatusSlug("Won't fix!")).toBe("wont_fix")
  })

  it("NFKD-normalizes diacritics", () => {
    expect(deriveStatusSlug("à la mode")).toBe("a_la_mode")
    expect(deriveStatusSlug("Düsseldorf")).toBe("dusseldorf")
  })

  it("strips emoji and surrounding whitespace", () => {
    expect(deriveStatusSlug("  🚀 Shipped  ")).toBe("shipped")
  })

  it("collapses repeated whitespace", () => {
    expect(deriveStatusSlug("a    b")).toBe("a_b")
  })

  it("trims trailing underscores after stripping", () => {
    expect(deriveStatusSlug("Hello!!!")).toBe("hello")
  })

  it("returns empty string on all-non-Latin input", () => {
    expect(deriveStatusSlug("中文")).toBe("")
  })

  it("returns empty string on empty input", () => {
    expect(deriveStatusSlug("")).toBe("")
    expect(deriveStatusSlug("   ")).toBe("")
  })
})

describe("isReservedStatusSlug", () => {
  it("rejects baseline slugs", () => {
    for (const s of BASELINE_STATUS_SLUGS) {
      expect(isReservedStatusSlug(s)).toBe(true)
    }
  })

  it("accepts arbitrary user slugs", () => {
    expect(isReservedStatusSlug("in_review")).toBe(false)
    expect(isReservedStatusSlug("blocked")).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```
bun run --filter @projectproject/shared test slug
```
Expected: FAIL (module not found / `BASELINE_STATUS_SLUGS` import broken — that's expected, A2 creates it).

- [ ] **Step 3: Stub `BASELINE_STATUS_SLUGS` and write `slug.ts`**

`packages/shared/src/slug.ts`:

```ts
import { BASELINE_STATUS_SLUGS } from "./schemas/Status"

const BASELINE_SET: ReadonlySet<string> = new Set(BASELINE_STATUS_SLUGS)

export function deriveStatusSlug(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "")
}

export function isReservedStatusSlug(slug: string): boolean {
  return BASELINE_SET.has(slug)
}
```

Temporarily, in `packages/shared/src/schemas/Status.ts` (will be completed in A2):

```ts
export const BASELINE_STATUS_SLUGS = ["todo", "in_progress", "done"] as const
```

- [ ] **Step 4: Run test, verify it passes**

```
bun run --filter @projectproject/shared test slug
```
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/shared/src/slug.ts packages/shared/src/slug.test.ts packages/shared/src/schemas/Status.ts
git commit -m "feat(shared): status slug derivation + reserved slug check"
```

---

### Task A2: Status shared schemas

**Files:**
- Modify: `packages/shared/src/schemas/Status.ts` (started in A1)
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Fill in the Status schemas**

`packages/shared/src/schemas/Status.ts`:

```ts
import * as Schema from "effect/Schema"
import { TagColor } from "./Tag"

export const BASELINE_STATUS_SLUGS = ["todo", "in_progress", "done"] as const
export type BaselineStatusSlug = (typeof BASELINE_STATUS_SLUGS)[number]

export const StatusSlug = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9_]+$/),
  Schema.minLength(1),
  Schema.maxLength(40),
  Schema.brand("StatusSlug")
)
export type StatusSlug = typeof StatusSlug.Type

export const StatusLabel = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(40),
  Schema.brand("StatusLabel")
)
export type StatusLabel = typeof StatusLabel.Type

export const STATUS_ICONS = [
  "Circle",
  "CircleDot",
  "CircleDashed",
  "CircleDotDashed",
  "Loader",
  "Hourglass",
  "Timer",
  "Eye",
  "Search",
  "ScanLine",
  "Microscope",
  "ShieldCheck",
  "Ban",
  "AlertCircle",
  "AlertTriangle",
  "Lock",
  "XCircle",
  "Archive",
  "Skull",
  "Trash",
  "Lightbulb",
  "Bookmark",
  "Inbox",
  "Trophy",
  "Sparkles",
  "Rocket",
  "Flame",
  "Award",
  "Square",
  "Triangle",
  "Hexagon",
  "Diamond"
] as const
export type StatusIconName = (typeof STATUS_ICONS)[number]

export const StatusIcon = Schema.Literal(...STATUS_ICONS)

export const StatusColor = TagColor

export const OrderKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.brand("OrderKey")
)
export type OrderKey = typeof OrderKey.Type

export const ProjectStatus = Schema.Struct({
  slug: StatusSlug,
  label: StatusLabel,
  icon: StatusIcon,
  color: StatusColor,
  orderKey: OrderKey,
  createdBy: Schema.String,
  createdAt: Schema.Date
})
export type ProjectStatus = typeof ProjectStatus.Type

export const CreateStatusInput = Schema.Struct({
  label: StatusLabel,
  icon: Schema.optional(StatusIcon),
  color: Schema.optional(StatusColor)
})
export type CreateStatusInput = typeof CreateStatusInput.Type

export const UpdateStatusInput = Schema.Struct({
  label: Schema.optional(StatusLabel),
  icon: Schema.optional(StatusIcon),
  color: Schema.optional(StatusColor)
})
export type UpdateStatusInput = typeof UpdateStatusInput.Type

export const ReorderStatusInput = Schema.Struct({
  orderKey: OrderKey
})
export type ReorderStatusInput = typeof ReorderStatusInput.Type

export const DeleteStatusInput = Schema.Struct({
  reassignTo: Schema.optional(StatusSlug)
})
export type DeleteStatusInput = typeof DeleteStatusInput.Type
```

- [ ] **Step 2: Re-export from shared index**

Add to `packages/shared/src/index.ts`:

```ts
export * from "./slug"
export * from "./schemas/Status"
```

- [ ] **Step 3: Type-check**

```
bun run --filter @projectproject/shared typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add packages/shared/src/schemas/Status.ts packages/shared/src/index.ts
git commit -m "feat(shared): ProjectStatus schemas + curated Lucide icon literal"
```

---

### Task A3: Relax `TicketStatus` to free-form slug

**Files:**
- Modify: `packages/shared/src/schemas/Ticket.ts:24-29`
- Modify: `packages/shared/src/filters/url.ts:47` (and the decode function below it)

- [ ] **Step 1: Update `TicketStatus`**

In `packages/shared/src/schemas/Ticket.ts`, replace line 24-29:

```ts
import { StatusSlug } from "./Status"

export const TicketStatus = StatusSlug
export type TicketStatus = typeof TicketStatus.Type

export function isCarryover(status: TicketStatus): boolean {
  return status !== "done"
}
```

`isCarryover` keeps the literal `"done"` comparison — that baseline is guaranteed to exist per the materialization design.

- [ ] **Step 2: Update filter URL encoding**

In `packages/shared/src/filters/url.ts`, find the `STATUS_VALUES` const (around line 47) and `decodeStatus` function. Replace with:

```ts
import { StatusSlug } from "../schemas/Status"

const isStatusSlug = Schema.is(StatusSlug)

function decodeStatus(value: string | undefined): ReadonlyArray<TicketStatus> {
  if (!value) return []
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(isStatusSlug)
}
```

(Drop the literal `STATUS_VALUES` array — any slug-shaped string is now valid; the per-project allow-list check happens elsewhere.)

- [ ] **Step 3: Run shared tests**

```
bun run --filter @projectproject/shared test
```
Expected: existing tests still PASS. If `Ticket.test.ts` had assertions tied to the literal three values, update them to use the new shape.

- [ ] **Step 4: Commit**

```
git add packages/shared/src/schemas/Ticket.ts packages/shared/src/filters/url.ts
git commit -m "feat(shared): widen TicketStatus to slug pattern, free filter encoding"
```

---

## Phase B — Database schema and backend service

### Task B1: Add `projectStatus` Drizzle schema and migration

**Files:**
- Modify: `packages/backend/src/db/schema.ts` (add `projectStatus` table + relations; change `ticket_index.status` from text-enum to plain text)
- Create: `packages/backend/src/db/migrations/0016_custom_statuses.sql`

- [ ] **Step 1: Edit `schema.ts` — drop the `status` enum constraint**

Find the `ticketIndex` `status` column (around line 343). Change:

```ts
status: text("status", {
  enum: ["todo", "in_progress", "done"]
}).notNull(),
```

To:

```ts
status: text("status").notNull(),
```

- [ ] **Step 2: Add the `projectStatus` table after `projectTag` (around line 163)**

```ts
export const projectStatus = pgTable(
  "project_status",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectIndex.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    orderKey: text("order_key").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.slug] }),
    index("project_status_project_idx").on(t.projectId),
    index("project_status_order_idx").on(t.projectId, t.orderKey)
  ]
)

export const projectStatusRelations = relations(projectStatus, ({ one }) => ({
  project: one(projectIndex, {
    fields: [projectStatus.projectId],
    references: [projectIndex.id]
  }),
  createdByUser: one(user, {
    fields: [projectStatus.createdBy],
    references: [user.id]
  })
}))
```

Also add `statuses: many(projectStatus),` to the `projectIndexRelations` `many` block.

- [ ] **Step 3: Generate the migration**

```
bun run --filter @projectproject/backend drizzle-kit generate
```

Drizzle-kit will write `src/db/migrations/0016_*.sql`. Inspect the file; it will likely include the column type change + the CREATE TABLE.

- [ ] **Step 4: Hand-edit the generated SQL to backfill baseline rows**

Open the generated `0016_*.sql`. Append the baseline backfill at the end of the file:

```sql
INSERT INTO "project_status" ("project_id", "slug", "label", "icon", "color", "order_key", "created_by", "created_at")
SELECT
  pi."id",
  baseline.slug,
  baseline.label,
  baseline.icon,
  baseline.color,
  baseline.order_key,
  pi."created_by",
  NOW()
FROM "project_index" pi
CROSS JOIN (VALUES
  ('todo',        'Todo',        'Circle',       '#a3a3a3', 'a0'),
  ('in_progress', 'In progress', 'CircleDot',    '#3b82f6', 'a1'),
  ('done',        'Done',        'CheckCircle2', '#22c55e', 'a2')
) AS baseline(slug, label, icon, color, order_key)
ON CONFLICT ("project_id", "slug") DO NOTHING;
```

(`CheckCircle2` is not in our curated icon list — that's fine; baseline icons are rendered from hardcoded `BASELINE_META` on the frontend, the row's `icon` value is informational only.)

- [ ] **Step 5: Apply migration**

```
bun run --filter @projectproject/backend drizzle-kit migrate
```
Expected: no errors. Verify the table exists with `psql ... -c "\d project_status"`.

- [ ] **Step 6: Commit**

```
git add packages/backend/src/db/schema.ts packages/backend/src/db/migrations/0016_custom_statuses.sql packages/backend/src/db/migrations/meta
git commit -m "feat(backend): project_status table + baseline backfill, widen ticket_index.status"
```

---

### Task B2: ProjectStatuses Service interface and basic Layer

**Files:**
- Create: `packages/backend/src/Services/ProjectStatuses.ts`
- Create: `packages/backend/src/Layers/ProjectStatuses.ts`
- Modify: `packages/backend/package.json` (add `fractional-indexing`)

- [ ] **Step 1: Install `fractional-indexing`**

```
bun add --filter @projectproject/backend fractional-indexing
```
Expected: package.json updated.

- [ ] **Step 2: Define the service**

`packages/backend/src/Services/ProjectStatuses.ts`:

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type {
  Conflict,
  CreateStatusInput,
  DeleteStatusInput,
  Forbidden,
  NotFound,
  ProjectStatus,
  ReorderStatusInput,
  StatusSlug,
  UpdateStatusInput
} from "@projectproject/shared"
import type { MarkdownError } from "./Markdown"

export interface ProjectStatusesShape {
  readonly list: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<ReadonlyArray<ProjectStatus>, NotFound>

  readonly create: (
    orgSlug: string,
    userId: string,
    slug: string,
    input: CreateStatusInput
  ) => Effect.Effect<ProjectStatus, NotFound | Forbidden | Conflict>

  readonly update: (
    orgSlug: string,
    userId: string,
    slug: string,
    statusSlug: string,
    input: UpdateStatusInput
  ) => Effect.Effect<
    ProjectStatus,
    NotFound | Forbidden | Conflict | MarkdownError
  >

  readonly reorder: (
    orgSlug: string,
    userId: string,
    slug: string,
    statusSlug: string,
    input: ReorderStatusInput
  ) => Effect.Effect<ProjectStatus, NotFound | Forbidden>

  readonly delete: (
    orgSlug: string,
    userId: string,
    slug: string,
    statusSlug: string,
    input: DeleteStatusInput
  ) => Effect.Effect<void, NotFound | Forbidden | Conflict | MarkdownError>
}

export class ProjectStatuses extends Context.Tag("ProjectStatuses")<
  ProjectStatuses,
  ProjectStatusesShape
>() {}
```

- [ ] **Step 3: Create the Layer skeleton + `list`**

`packages/backend/src/Layers/ProjectStatuses.ts`:

```ts
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { and, asc, eq } from "drizzle-orm"
import {
  Conflict,
  Forbidden,
  NotFound,
  ProjectStatus,
  StatusColor,
  StatusIcon,
  StatusLabel,
  StatusSlug,
  type CreateStatusInput,
  type DeleteStatusInput,
  type ReorderStatusInput,
  type UpdateStatusInput,
  deriveStatusSlug,
  isReservedStatusSlug
} from "@projectproject/shared"
import { projectIndex, projectStatus } from "../db/schema"
import { Db } from "../Services/Db"
import { Projects } from "../Services/Projects"
import {
  ProjectStatuses,
  type ProjectStatusesShape
} from "../Services/ProjectStatuses"

const makeSlug = Schema.decodeUnknownSync(StatusSlug)
const makeLabel = Schema.decodeUnknownSync(StatusLabel)
const makeIcon = Schema.decodeUnknownSync(StatusIcon)
const makeColor = Schema.decodeUnknownSync(StatusColor)

const rowToStatus = (r: typeof projectStatus.$inferSelect): ProjectStatus => ({
  slug: makeSlug(r.slug),
  label: makeLabel(r.label),
  icon: makeIcon(r.icon),
  color: makeColor(r.color),
  orderKey: r.orderKey as ProjectStatus["orderKey"],
  createdBy: r.createdBy,
  createdAt: r.createdAt
})

export const ProjectStatusesLive = Layer.effect(
  ProjectStatuses,
  Effect.gen(function* () {
    const db = yield* Db
    const projects = yield* Projects

    const projectIdFromSlug = (slug: string) =>
      db.query.projectIndex
        .findFirst({
          columns: { id: true },
          where: eq(projectIndex.slug, slug)
        })
        .pipe(
          Effect.orDie,
          Effect.flatMap((row) =>
            row ? Effect.succeed(row.id) : Effect.fail(new NotFound())
          )
        )

    const list: ProjectStatusesShape["list"] = (orgSlug, userId, slug) =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const projectId = yield* projectIdFromSlug(slug)
        const rows = yield* db.query.projectStatus
          .findMany({
            where: eq(projectStatus.projectId, projectId),
            orderBy: [asc(projectStatus.orderKey)]
          })
          .pipe(Effect.orDie)
        return rows.map(rowToStatus)
      })

    // create / update / reorder / delete added in subsequent tasks
    const stub = (): never => {
      throw new Error("not implemented")
    }

    return {
      list,
      create: stub as never,
      update: stub as never,
      reorder: stub as never,
      delete: stub as never
    }
  })
)
```

- [ ] **Step 4: Type-check**

```
bun run --filter @projectproject/backend typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/backend/src/Services/ProjectStatuses.ts packages/backend/src/Layers/ProjectStatuses.ts packages/backend/package.json bun.lock
git commit -m "feat(backend): ProjectStatuses service + list method"
```

---

### Task B3: Create endpoint (with collision + slug derivation + order key generation)

**Files:**
- Modify: `packages/backend/src/Layers/ProjectStatuses.ts`
- Create: `packages/backend/src/Layers/ProjectStatuses.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/backend/src/Layers/ProjectStatuses.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { ProjectStatuses } from "../Services/ProjectStatuses"
import { provideTestLayer } from "./testHelpers"
// (Use the same test setup pattern as Tickets.test.ts / Groups.test.ts.
// If a shared `provideTestLayer` doesn't exist, copy the pattern from those.)

describe("ProjectStatuses.create", () => {
  it("derives the slug from the label", () =>
    Effect.gen(function* () {
      const svc = yield* ProjectStatuses
      const status = yield* svc.create("org", "user", "proj", {
        label: "In review" as never
      })
      expect(status.slug).toBe("in_review")
      expect(status.label).toBe("In review")
    }).pipe(provideTestLayer, Effect.runPromise))

  it("rejects creates whose derived slug collides with a baseline", () =>
    Effect.gen(function* () {
      const svc = yield* ProjectStatuses
      const exit = yield* Effect.exit(
        svc.create("org", "user", "proj", { label: "Done" as never })
      )
      expect(exit._tag).toBe("Failure")
    }).pipe(provideTestLayer, Effect.runPromise))

  it("rejects creates whose derived slug collides with an existing status", () =>
    Effect.gen(function* () {
      const svc = yield* ProjectStatuses
      yield* svc.create("org", "user", "proj", { label: "Blocked" as never })
      const exit = yield* Effect.exit(
        svc.create("org", "user", "proj", { label: "BLOCKED" as never })
      )
      expect(exit._tag).toBe("Failure")
    }).pipe(provideTestLayer, Effect.runPromise))

  it("rejects empty derived slugs", () =>
    Effect.gen(function* () {
      const svc = yield* ProjectStatuses
      const exit = yield* Effect.exit(
        svc.create("org", "user", "proj", { label: "中文" as never })
      )
      expect(exit._tag).toBe("Failure")
    }).pipe(provideTestLayer, Effect.runPromise))
})
```

- [ ] **Step 2: Implement `create`**

In `packages/backend/src/Layers/ProjectStatuses.ts`, replace the `create: stub as never` line with a real implementation. Add this above the returned object:

```ts
import { generateKeyBetween } from "fractional-indexing"
import { INNER_RING, OUTER_RING } from "@projectproject/shared"

const DEFAULT_ICON = "Circle"

const pickColor = (used: ReadonlyArray<string>): string => {
  const palette = OUTER_RING.map((c) => c.hex)
  for (const c of palette) if (!used.includes(c)) return c
  return palette[used.length % palette.length]
}

const create: ProjectStatusesShape["create"] = (orgSlug, userId, slug, input) =>
  Effect.gen(function* () {
    yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
    const projectId = yield* projectIdFromSlug(slug)

    const derived = deriveStatusSlug(input.label)
    if (derived.length === 0)
      return yield* new Conflict({ reason: "invalid_label" })
    if (isReservedStatusSlug(derived))
      return yield* new Conflict({ reason: "reserved_slug" })

    const existing = yield* db.query.projectStatus
      .findMany({
        where: eq(projectStatus.projectId, projectId),
        orderBy: [asc(projectStatus.orderKey)]
      })
      .pipe(Effect.orDie)

    if (existing.some((s) => s.slug === derived))
      return yield* new Conflict({ reason: "slug_exists" })

    const lastKey = existing.length > 0
      ? existing[existing.length - 1].orderKey
      : null
    const nextKey = generateKeyBetween(lastKey, null)

    const color =
      input.color ?? pickColor(existing.map((s) => s.color))
    const icon = input.icon ?? DEFAULT_ICON

    const inserted = yield* db
      .insert(projectStatus)
      .values({
        projectId,
        slug: derived,
        label: input.label,
        icon,
        color,
        orderKey: nextKey,
        createdBy: userId
      })
      .returning()
      .pipe(Effect.orDie)
    return rowToStatus(inserted[0])
  })
```

Update the returned object to use the real `create`.

- [ ] **Step 3: Run tests, verify PASS**

```
bun run --filter @projectproject/backend test ProjectStatuses
```
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add packages/backend/src/Layers/ProjectStatuses.ts packages/backend/src/Layers/ProjectStatuses.test.ts
git commit -m "feat(backend): ProjectStatuses.create with slug derivation + collision check"
```

---

### Task B4: Update method — label/icon/color, with cosmetic-rename fast-path and cascade

**Files:**
- Modify: `packages/backend/src/Layers/ProjectStatuses.ts`
- Modify: `packages/backend/src/Services/TicketIndex.ts` (add `findTicketIdsByStatus`)
- Modify: `packages/backend/src/Layers/Tickets.ts` (add `replaceStatus` method analogous to `replaceTag`)
- Modify: `packages/backend/src/Layers/ProjectStatuses.test.ts` (cascade tests)

- [ ] **Step 1: Add `findTicketIdsByStatus` to `TicketIndex`**

In `packages/backend/src/Services/TicketIndex.ts`, modeled on `findTicketIdsByTag` (which already exists per the `Tags.ts` usage at line 70):

```ts
readonly findTicketIdsByStatus: (
  project: { id: string },
  status: string
) => Effect.Effect<ReadonlyArray<string>, never>
```

Add the implementation in the corresponding `Layer` (likely `packages/backend/src/Layers/TicketIndex.ts`):

```ts
const findTicketIdsByStatus: TicketIndex["findTicketIdsByStatus"] = (
  project,
  status
) =>
  db.query.ticketIndex
    .findMany({
      columns: { ticketId: true },
      where: and(
        eq(ticketIndex.projectId, project.id),
        eq(ticketIndex.status, status)
      )
    })
    .pipe(
      Effect.orDie,
      Effect.map((rows) => rows.map((r) => r.ticketId))
    )
```

- [ ] **Step 2: Add `replaceStatus` to `Tickets`**

In `packages/backend/src/Layers/Tickets.ts`, add a `replaceStatus` method modeled on `replaceTag`. This method:
- Reads the ticket markdown (`ticketDocs.read`)
- Rewrites the frontmatter `status` field to the new slug
- Writes the markdown back
- Calls `ticketIndex.upsertTicket` to sync the index row

The signature mirrors the existing `replaceTag(orgSlug, slug, id, oldName, newName)`:

```ts
readonly replaceStatus: (
  orgSlug: string,
  slug: string,
  id: string,
  newStatus: string
) => Effect.Effect<void, NotFound | MarkdownError | MalformedTicketDocument>
```

- [ ] **Step 3: Implement `update` with cosmetic fast-path and cascade**

In `packages/backend/src/Layers/ProjectStatuses.ts`:

```ts
import { withProjectLock } from "../Services/ProjectLock"  // verify exact import path
import { TicketIndex } from "../Services/TicketIndex"
import { Tickets } from "../Services/Tickets"

// inside the Layer.effect closure:
const ticketIndex = yield* TicketIndex
const tickets = yield* Tickets

const update: ProjectStatusesShape["update"] = (
  orgSlug,
  userId,
  slug,
  statusSlug,
  patch
) =>
  Effect.gen(function* () {
    yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
    const projectId = yield* projectIdFromSlug(slug)

    const current = yield* db.query.projectStatus
      .findFirst({
        where: and(
          eq(projectStatus.projectId, projectId),
          eq(projectStatus.slug, statusSlug)
        )
      })
      .pipe(Effect.orDie)
    if (!current) return yield* new NotFound()

    if (isReservedStatusSlug(statusSlug)) {
      // baselines: only icon/color/label changes are disallowed; orderKey via separate `reorder` op.
      return yield* new Forbidden()
    }

    const newLabel = patch.label ?? current.label
    const newSlug = patch.label
      ? deriveStatusSlug(patch.label)
      : current.slug

    if (newSlug.length === 0)
      return yield* new Conflict({ reason: "invalid_label" })
    if (newSlug !== current.slug) {
      if (isReservedStatusSlug(newSlug))
        return yield* new Conflict({ reason: "reserved_slug" })
      const collision = yield* db.query.projectStatus
        .findFirst({
          where: and(
            eq(projectStatus.projectId, projectId),
            eq(projectStatus.slug, newSlug)
          )
        })
        .pipe(Effect.orDie)
      if (collision) return yield* new Conflict({ reason: "slug_exists" })
    }

    const cosmetic = newSlug === current.slug

    if (cosmetic) {
      const updated = yield* db
        .update(projectStatus)
        .set({
          label: newLabel,
          icon: patch.icon ?? current.icon,
          color: patch.color ?? current.color
        })
        .where(
          and(
            eq(projectStatus.projectId, projectId),
            eq(projectStatus.slug, statusSlug)
          )
        )
        .returning()
        .pipe(Effect.orDie)
      return rowToStatus(updated[0])
    }

    return yield* withProjectLock(orgSlug, slug, (project) =>
      Effect.gen(function* () {
        const affectedIds = yield* ticketIndex.findTicketIdsByStatus(
          project,
          current.slug
        )
        yield* Effect.forEach(
          affectedIds,
          (id) =>
            tickets
              .replaceStatus(orgSlug, slug, id, newSlug)
              .pipe(
                Effect.catchTag("NotFound", () => Effect.succeed(undefined)),
                Effect.catchTag("MalformedTicketDocument", () =>
                  Effect.succeed(undefined)
                )
              ),
          { concurrency: 8 }
        )
        const updated = yield* db.transaction((tx) =>
          Effect.gen(function* () {
            yield* tx
              .update(projectStatus)
              .set({
                slug: newSlug,
                label: newLabel,
                icon: patch.icon ?? current.icon,
                color: patch.color ?? current.color
              })
              .where(
                and(
                  eq(projectStatus.projectId, projectId),
                  eq(projectStatus.slug, statusSlug)
                )
              )
              .returning()
              .pipe(Effect.orDie)
          })
        )
        return rowToStatus(updated[0])
      })
    )
  })
```

Verify `withProjectLock`'s exact location and signature in the codebase; this snippet calls it with `(orgSlug, slug, fn)` returning a `project` object. Adjust to match the real shape.

- [ ] **Step 4: Add cascade tests**

In `ProjectStatuses.test.ts`, add tests covering:
- cosmetic rename (slug unchanged) updates label without touching tickets
- slug-changing rename cascades to ticket files and index
- collision on rename rejects
- baseline update returns Forbidden

(Use the existing test setup patterns; create test tickets via the `Tickets` service.)

- [ ] **Step 5: Run tests**

```
bun run --filter @projectproject/backend test ProjectStatuses
```
Expected: PASS.

- [ ] **Step 6: Commit**

```
git add packages/backend/src/Services/TicketIndex.ts packages/backend/src/Layers/TicketIndex.ts packages/backend/src/Layers/Tickets.ts packages/backend/src/Layers/ProjectStatuses.ts packages/backend/src/Layers/ProjectStatuses.test.ts
git commit -m "feat(backend): ProjectStatuses.update with rename cascade and cosmetic fast-path"
```

---

### Task B5: Reorder

**Files:**
- Modify: `packages/backend/src/Layers/ProjectStatuses.ts`

- [ ] **Step 1: Implement reorder**

```ts
const reorder: ProjectStatusesShape["reorder"] = (
  orgSlug,
  userId,
  slug,
  statusSlug,
  input
) =>
  Effect.gen(function* () {
    yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
    const projectId = yield* projectIdFromSlug(slug)
    const updated = yield* db
      .update(projectStatus)
      .set({ orderKey: input.orderKey })
      .where(
        and(
          eq(projectStatus.projectId, projectId),
          eq(projectStatus.slug, statusSlug)
        )
      )
      .returning()
      .pipe(Effect.orDie)
    if (updated.length === 0) return yield* new NotFound()
    return rowToStatus(updated[0])
  })
```

Wire it into the returned object.

- [ ] **Step 2: Test (one happy-path test is enough; reorder is simple)**

```ts
it("reorder updates the orderKey", () =>
  Effect.gen(function* () {
    const svc = yield* ProjectStatuses
    const created = yield* svc.create("org", "user", "proj", {
      label: "Blocked" as never
    })
    const reordered = yield* svc.reorder("org", "user", "proj", created.slug, {
      orderKey: "ZZ" as never
    })
    expect(reordered.orderKey).toBe("ZZ")
  }).pipe(provideTestLayer, Effect.runPromise))
```

- [ ] **Step 3: Commit**

```
git add packages/backend/src/Layers/ProjectStatuses.ts packages/backend/src/Layers/ProjectStatuses.test.ts
git commit -m "feat(backend): ProjectStatuses.reorder"
```

---

### Task B6: Delete with reassign

**Files:**
- Modify: `packages/backend/src/Layers/ProjectStatuses.ts`

- [ ] **Step 1: Implement delete**

```ts
const del: ProjectStatusesShape["delete"] = (
  orgSlug,
  userId,
  slug,
  statusSlug,
  input
) =>
  Effect.gen(function* () {
    yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
    if (isReservedStatusSlug(statusSlug)) return yield* new Forbidden()
    const projectId = yield* projectIdFromSlug(slug)

    const current = yield* db.query.projectStatus
      .findFirst({
        where: and(
          eq(projectStatus.projectId, projectId),
          eq(projectStatus.slug, statusSlug)
        )
      })
      .pipe(Effect.orDie)
    if (!current) return yield* new NotFound()

    yield* withProjectLock(orgSlug, slug, (project) =>
      Effect.gen(function* () {
        const affectedIds = yield* ticketIndex.findTicketIdsByStatus(
          project,
          statusSlug
        )
        if (affectedIds.length > 0) {
          if (!input.reassignTo)
            return yield* new Conflict({ reason: "reassign_required" })
          const target = yield* db.query.projectStatus
            .findFirst({
              where: and(
                eq(projectStatus.projectId, projectId),
                eq(projectStatus.slug, input.reassignTo)
              )
            })
            .pipe(Effect.orDie)
          if (!target)
            return yield* new Conflict({ reason: "reassign_target_missing" })

          yield* Effect.forEach(
            affectedIds,
            (id) =>
              tickets
                .replaceStatus(orgSlug, slug, id, input.reassignTo!)
                .pipe(
                  Effect.catchTag("NotFound", () => Effect.succeed(undefined)),
                  Effect.catchTag("MalformedTicketDocument", () =>
                    Effect.succeed(undefined)
                  )
                ),
            { concurrency: 8 }
          )
        }
        yield* db
          .delete(projectStatus)
          .where(
            and(
              eq(projectStatus.projectId, projectId),
              eq(projectStatus.slug, statusSlug)
            )
          )
          .pipe(Effect.orDie)
      })
    )
  })
```

- [ ] **Step 2: Tests — three cases**

```ts
it("delete with zero tickets succeeds without reassignTo", ...)
it("delete with tickets and reassignTo cascades", ...)
it("delete with tickets but no reassignTo returns Conflict", ...)
it("delete of baseline returns Forbidden", ...)
```

- [ ] **Step 3: Commit**

```
git add packages/backend/src/Layers/ProjectStatuses.ts packages/backend/src/Layers/ProjectStatuses.test.ts
git commit -m "feat(backend): ProjectStatuses.delete with cascade reassign"
```

---

### Task B7: HttpApi endpoints + wire into live layer

**Files:**
- Modify: `packages/shared/src/api.ts` (add `StatusesGroup`)
- Modify: `packages/backend/src/HttpHandlers.ts` (or wherever endpoints are bound — pattern-match on how `tags` does it)
- Modify: `packages/backend/src/Layers/index.ts` (add `ProjectStatusesLive`)

- [ ] **Step 1: Add `StatusesGroup` to `api.ts`**

In `packages/shared/src/api.ts`, after `TagsGroup`:

```ts
const ProjectStatusPath = Schema.Struct({
  ...ProjectPath.fields,
  statusSlug: Schema.String
})

const StatusesGroup = HttpApiGroup.make("statuses")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/projects/:slug/statuses")
      .setPath(ProjectPath)
      .addSuccess(Schema.Array(ProjectStatus))
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.post("create", "/orgs/:orgSlug/projects/:slug/statuses")
      .setPath(ProjectPath)
      .setPayload(CreateStatusInput)
      .addSuccess(ProjectStatus)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(Conflict)
  )
  .add(
    HttpApiEndpoint.patch(
      "update",
      "/orgs/:orgSlug/projects/:slug/statuses/:statusSlug"
    )
      .setPath(ProjectStatusPath)
      .setPayload(UpdateStatusInput)
      .addSuccess(ProjectStatus)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(Conflict)
  )
  .add(
    HttpApiEndpoint.patch(
      "reorder",
      "/orgs/:orgSlug/projects/:slug/statuses/:statusSlug/order"
    )
      .setPath(ProjectStatusPath)
      .setPayload(ReorderStatusInput)
      .addSuccess(ProjectStatus)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint.del(
      "delete",
      "/orgs/:orgSlug/projects/:slug/statuses/:statusSlug"
    )
      .setPath(ProjectStatusPath)
      .setUrlParams(Schema.Struct({ reassignTo: Schema.optional(StatusSlug) }))
      .addSuccess(Schema.Void)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(Conflict)
  )
  .middleware(Authentication)
```

Then register it: `.add(StatusesGroup)` next to `.add(TagsGroup)` (around line 737).

- [ ] **Step 2: Wire handlers in backend**

Find the existing tags handler block (e.g. in `packages/backend/src/HttpHandlers.ts` or `packages/backend/src/index.ts` — search for `"tags"`); add a parallel `"statuses"` block calling `ProjectStatuses` service methods.

- [ ] **Step 3: Wire `ProjectStatusesLive` into the merged live layer**

In `packages/backend/src/Layers/index.ts` (or wherever the live layer is composed):

```ts
import { ProjectStatusesLive } from "./ProjectStatuses"

export const Live = Layer.mergeAll(
  // ...existing layers
  ProjectStatusesLive
)
```

- [ ] **Step 4: Run all backend tests + smoke test the endpoints**

```
bun run --filter @projectproject/backend typecheck
bun run --filter @projectproject/backend test
bun run --filter @projectproject/backend dev
```

Smoke: `curl -X GET http://localhost:<port>/orgs/project-project/projects/project-project/statuses` with an auth cookie. Expected: returns the three baseline rows.

- [ ] **Step 5: Commit**

```
git add packages/shared/src/api.ts packages/backend/src/HttpHandlers.ts packages/backend/src/Layers/index.ts
git commit -m "feat(api): statuses CRUD endpoints, wire ProjectStatusesLive"
```

---

## Phase C — Frontend foundation

### Task C1: Curated Lucide icon module

**Files:**
- Create: `packages/frontend/src/lib/status-icons.ts`

- [ ] **Step 1: Write the module**

```ts
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Award,
  Ban,
  Bookmark,
  Circle,
  CircleDashed,
  CircleDot,
  CircleDotDashed,
  Diamond,
  Eye,
  Flame,
  Hexagon,
  Hourglass,
  Inbox,
  Lightbulb,
  Loader,
  Lock,
  Microscope,
  Rocket,
  ScanLine,
  Search,
  ShieldCheck,
  Skull,
  Sparkles,
  Square,
  Timer,
  Trash,
  Triangle,
  Trophy,
  XCircle,
  type LucideIcon
} from "lucide-react"
import { STATUS_ICONS, type StatusIconName } from "@projectproject/shared"

const ICON_MAP: Record<StatusIconName, LucideIcon> = {
  Circle,
  CircleDot,
  CircleDashed,
  CircleDotDashed,
  Loader,
  Hourglass,
  Timer,
  Eye,
  Search,
  ScanLine,
  Microscope,
  ShieldCheck,
  Ban,
  AlertCircle,
  AlertTriangle,
  Lock,
  XCircle,
  Archive,
  Skull,
  Trash,
  Lightbulb,
  Bookmark,
  Inbox,
  Trophy,
  Sparkles,
  Rocket,
  Flame,
  Award,
  Square,
  Triangle,
  Hexagon,
  Diamond
}

export const STATUS_ICON_NAMES = STATUS_ICONS

export function getStatusIcon(name: string): LucideIcon {
  return ICON_MAP[name as StatusIconName] ?? Circle
}
```

- [ ] **Step 2: Type-check**

```
bun run --filter @projectproject/frontend typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```
git add packages/frontend/src/lib/status-icons.ts
git commit -m "feat(frontend): curated Lucide icon set for custom statuses"
```

---

### Task C2: Status atoms

**Files:**
- Create: `packages/frontend/src/atoms/projectStatuses.ts`

- [ ] **Step 1: Write the atoms**

Follow the CLAUDE.md optimistic conventions exactly. Pattern reference: `packages/frontend/src/atoms/projects.ts` (which T-75 converted to optimistic) and the `github.ts` example referenced in CLAUDE.md.

```ts
import { Atom, Result } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import {
  type CreateStatusInput,
  type DeleteStatusInput,
  type ProjectStatus,
  type ReorderStatusInput,
  type UpdateStatusInput
} from "@projectproject/shared"
import { api, runtime } from "./runtime"

export const projectKey = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`

const projectStatusesBaseAtom = Atom.family((key: string) => {
  const [orgSlug, slug] = key.split("/")
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* api
        return yield* client.statuses.list({ path: { orgSlug, slug } })
      })
    )
    .pipe(Atom.setIdleTTL("5 minutes"))
})

export const projectStatusesAtom = Atom.family((key: string) =>
  Atom.optimistic(projectStatusesBaseAtom(key))
)

export const createStatusAtom = Atom.family((key: string) => {
  const [orgSlug, slug] = key.split("/")
  return Atom.optimisticFn(projectStatusesAtom(key), {
    reducer: (current, _input: CreateStatusInput) => current,
    fn: runtime.fn(
      Effect.fn(function* (input: CreateStatusInput, get) {
        const client = yield* api
        const created = yield* client.statuses.create({
          path: { orgSlug, slug },
          payload: input
        })
        get.refresh(projectStatusesBaseAtom(key))
        return created
      })
    )
  })
})

export const updateStatusAtom = Atom.family((key: string) => {
  const [orgSlug, slug] = key.split("/")
  return Atom.optimisticFn(projectStatusesAtom(key), {
    reducer: (
      current,
      input: { statusSlug: string; patch: UpdateStatusInput }
    ) => {
      if (!Result.isSuccess(current)) return current
      return Result.success(
        current.value.map((s) =>
          s.slug === input.statusSlug
            ? {
                ...s,
                label: input.patch.label ?? s.label,
                icon: input.patch.icon ?? s.icon,
                color: input.patch.color ?? s.color
              }
            : s
        ),
        { waiting: true }
      )
    },
    fn: runtime.fn(
      Effect.fn(function* (
        input: { statusSlug: string; patch: UpdateStatusInput },
        get
      ) {
        const client = yield* api
        const updated = yield* client.statuses.update({
          path: { orgSlug, slug, statusSlug: input.statusSlug },
          payload: input.patch
        })
        get.refresh(projectStatusesBaseAtom(key))
        if (input.patch.label) {
          // slug may have changed — refresh ticket data
          get.refresh(ticketListBaseAtomForKey(key))
        }
        return updated
      })
    )
  })
})

export const reorderStatusAtom = Atom.family((key: string) => {
  const [orgSlug, slug] = key.split("/")
  return Atom.optimisticFn(projectStatusesAtom(key), {
    reducer: (
      current,
      input: { statusSlug: string; orderKey: string }
    ) => {
      if (!Result.isSuccess(current)) return current
      return Result.success(
        current.value
          .map((s) =>
            s.slug === input.statusSlug ? { ...s, orderKey: input.orderKey } : s
          )
          .toSorted((a, b) =>
            a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0
          ),
        { waiting: true }
      )
    },
    fn: runtime.fn(
      Effect.fn(function* (
        input: { statusSlug: string; orderKey: string },
        get
      ) {
        const client = yield* api
        const updated = yield* client.statuses.reorder({
          path: { orgSlug, slug, statusSlug: input.statusSlug },
          payload: { orderKey: input.orderKey as never }
        })
        get.refresh(projectStatusesBaseAtom(key))
        return updated
      })
    )
  })
})

export const deleteStatusAtom = Atom.family((key: string) => {
  const [orgSlug, slug] = key.split("/")
  return Atom.optimisticFn(projectStatusesAtom(key), {
    reducer: (current, _input: { statusSlug: string; input: DeleteStatusInput }) => {
      if (!Result.isSuccess(current)) return current
      return Result.success(current.value, { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (
        input: { statusSlug: string; input: DeleteStatusInput },
        get
      ) {
        const client = yield* api
        yield* client.statuses.delete({
          path: { orgSlug, slug, statusSlug: input.statusSlug },
          urlParams: { reassignTo: input.input.reassignTo }
        })
        get.refresh(projectStatusesBaseAtom(key))
        get.refresh(ticketListBaseAtomForKey(key))
      })
    )
  })
})
```

`ticketListBaseAtomForKey` is whatever atom exposes the project's ticket list — reuse the existing one. If the existing ticket atom is family-keyed differently, adapt.

- [ ] **Step 2: Verify by hooking into a temp test component**

(Optional — can skip if confident.) In a scratch route, `useAtomValue(projectStatusesAtom(projectKey(orgSlug, slug)))` and confirm the list resolves to three baseline rows.

- [ ] **Step 3: Commit**

```
git add packages/frontend/src/atoms/projectStatuses.ts
git commit -m "feat(frontend): projectStatuses atoms (list + CRUD, family-keyed)"
```

---

### Task C3: Refactor `STATUS_META`, `BOARD_STATUSES`, `STATUS_LABELS` to consume atom data

**Files:**
- Modify: `packages/frontend/src/lib/ticket-meta.ts`
- Modify: `packages/frontend/src/components/sprints/board-utils.ts`
- Modify: every consumer of `STATUS_META` / `STATUS_LABELS` / `BOARD_STATUSES`

- [ ] **Step 1: Convert `STATUS_META` to a function**

`packages/frontend/src/lib/ticket-meta.ts`:

```ts
import { Circle, CheckCircle2, CircleDot, type LucideIcon } from "lucide-react"
import type { ProjectStatus } from "@projectproject/shared"
import { getStatusIcon } from "./status-icons"
import { m } from "@/paraglide/messages"

type StatusMeta = {
  label: string
  icon: LucideIcon
  className: string
}

const BASELINE_META: Record<string, StatusMeta> = {
  todo: {
    label: m.tickets_status_todo(),
    icon: Circle,
    className: "text-muted-foreground"
  },
  in_progress: {
    label: m.tickets_status_in_progress(),
    icon: CircleDot,
    className: "text-blue-500"
  },
  done: {
    label: m.tickets_status_done(),
    icon: CheckCircle2,
    className: "text-emerald-500"
  }
}

export function statusMetaFor(
  status: string,
  statuses: ReadonlyArray<ProjectStatus>
): StatusMeta {
  const baseline = BASELINE_META[status]
  if (baseline) {
    const reordered = statuses.find((s) => s.slug === status)
    return reordered
      ? { ...baseline, label: baseline.label } // baselines use paraglide labels regardless of row label
      : baseline
  }
  const row = statuses.find((s) => s.slug === status)
  if (!row) {
    return { label: status, icon: Circle, className: "text-muted-foreground" }
  }
  return {
    label: row.label,
    icon: getStatusIcon(row.icon),
    className: `text-[${row.color}]` // adjust to use inline style or a className strategy
  }
}
```

(For className/color: use `style={{ color: row.color }}` at the callsite rather than constructing a Tailwind class string. Adjust the return type or pass color separately.)

- [ ] **Step 2: Convert `BOARD_STATUSES` to derive from atom**

In `packages/frontend/src/components/sprints/board-utils.ts`:

```ts
import type { ProjectStatus } from "@projectproject/shared"

export function boardStatusesFor(
  statuses: ReadonlyArray<ProjectStatus>
): ReadonlyArray<string> {
  return [...statuses]
    .toSorted((a, b) =>
      a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0
    )
    .map((s) => s.slug)
}
```

Update `groupTicketsByStatus` to take an explicit list of slugs rather than the hardcoded array.

- [ ] **Step 3: Update every consumer**

Search the frontend for `STATUS_META` / `STATUS_LABELS` / `BOARD_STATUSES` references and update each callsite:

```
bun run --filter @projectproject/frontend grep -n "STATUS_META\|STATUS_LABELS\|BOARD_STATUSES" src/
```

Each callsite gains a `useAtomValue(projectStatusesAtom(projectKey(orgSlug, slug)))` and passes the array to `statusMetaFor(...)` / `boardStatusesFor(...)`.

- [ ] **Step 4: Type-check + lint**

```
bun run --filter @projectproject/frontend typecheck
bun run --filter @projectproject/frontend lint
```
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/frontend/src/lib/ticket-meta.ts packages/frontend/src/components/sprints/board-utils.ts <each updated callsite>
git commit -m "refactor(frontend): drive status meta from projectStatuses atom"
```

---

## Phase D — Settings UI

### Task D1: Statuses settings route + nav

**Files:**
- Create: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/settings/statuses.tsx`
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/settings/route.tsx`
- Modify: `packages/frontend/messages/en/projects.json`

- [ ] **Step 1: Add i18n keys**

In `packages/frontend/messages/en/projects.json`:

```json
"project_settings_statuses_tab": "Statuses",
"project_settings_statuses_heading": "Project statuses",
"project_settings_statuses_description": "Define the columns of your kanban — the three baselines (Todo, In progress, Done) are permanent. Add and reorder custom statuses to match your workflow."
```

- [ ] **Step 2: Register the section**

In `settings/route.tsx`, add to the `SECTIONS` array between `general` and `workflow`:

```ts
{
  key: "statuses",
  label: m.project_settings_statuses_tab(),
  icon: Columns3, // import from lucide-react
  heading: m.project_settings_statuses_heading(),
  description: m.project_settings_statuses_description()
}
```

Update `SectionKey` type to include `"statuses"`.

- [ ] **Step 3: Create the route stub**

`packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/settings/statuses.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { useAtomValue } from "@effect-atom/atom-react"
import { projectKey, projectStatusesAtom } from "@/atoms/projectStatuses"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/statuses"
)({
  component: StatusesSettings
})

function StatusesSettings() {
  const { orgSlug, slug } = Route.useParams()
  const result = useAtomValue(projectStatusesAtom(projectKey(orgSlug, slug)))

  // skeleton/loading/error per existing settings page patterns
  return <div>statuses placeholder</div>
}
```

- [ ] **Step 4: Visit the page**

Open the project settings, click "Statuses" — confirm the placeholder renders.

- [ ] **Step 5: Commit**

```
git add packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/settings/statuses.tsx packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/settings/route.tsx packages/frontend/messages/en/projects.json
git commit -m "feat(frontend): statuses settings page route + nav entry"
```

---

### Task D2: `StatusIconPicker` + `StatusEditorRow`

**Files:**
- Create: `packages/frontend/src/components/StatusIconPicker.tsx`
- Create: `packages/frontend/src/components/StatusEditorRow.tsx`

- [ ] **Step 1: `StatusIconPicker`**

A Radix popover showing a grid of the curated Lucide icons. Pattern reference: any existing popover-based picker (`ColorPicker.tsx`). The grid is `grid-cols-8 gap-1`, each cell ~28×28, hover highlights, click selects.

```tsx
import * as Popover from "@radix-ui/react-popover"
import { STATUS_ICON_NAMES, getStatusIcon } from "@/lib/status-icons"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = {
  value: string
  onChange: (icon: string) => void
  className?: string
}

export function StatusIconPicker({ value, onChange, className }: Props) {
  const Icon = getStatusIcon(value)
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md border border-input transition-colors hover:bg-accent active:scale-[0.97]",
          className
        )}
      >
        <Icon className="h-4 w-4" />
      </Popover.Trigger>
      <Popover.Content
        className="z-50 rounded-md border bg-popover p-2 shadow-md"
        sideOffset={4}
      >
        <div className="grid grid-cols-8 gap-1">
          {STATUS_ICON_NAMES.map((name) => {
            const I = getStatusIcon(name)
            return (
              <button
                key={name}
                type="button"
                onClick={() => onChange(name)}
                aria-label={name}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-accent",
                  name === value && "bg-accent"
                )}
              >
                <I className="h-3.5 w-3.5" />
              </button>
            )
          })}
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
```

- [ ] **Step 2: `StatusEditorRow`**

One row in the settings list. Contains: drag handle, icon picker, label input, color picker, delete button. The label input commits on blur (or Enter), triggering `updateStatusAtom`. Color/icon changes fire immediately.

```tsx
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Result } from "@effect-atom/atom-react"
import { GripVertical, Trash } from "lucide-react"
import { useState } from "react"
import { ColorPicker } from "@/components/ColorPicker"
import { StatusIconPicker } from "@/components/StatusIconPicker"
import { getStatusIcon } from "@/lib/status-icons"
import {
  projectKey,
  projectStatusesAtom,
  updateStatusAtom
} from "@/atoms/projectStatuses"
import type { ProjectStatus } from "@projectproject/shared"
import { cn } from "@/lib/utils"
import { isBaselineStatus } from "@/lib/status-baseline"

type Props = {
  status: ProjectStatus
  orgSlug: string
  slug: string
  onRequestDelete: (status: ProjectStatus) => void
}

export function StatusEditorRow({
  status,
  orgSlug,
  slug,
  onRequestDelete
}: Props) {
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateStatusAtom(key), { mode: "promiseExit" })
  const baseline = isBaselineStatus(status.slug)
  const [draftLabel, setDraftLabel] = useState(status.label)

  const commitLabel = () => {
    if (baseline || draftLabel === status.label) return
    update({ statusSlug: status.slug, patch: { label: draftLabel as never } })
  }

  const Icon = getStatusIcon(status.icon)

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card p-2 transition-colors hover:bg-accent/40"
      )}
    >
      <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />

      {baseline ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed">
          <Icon className="h-4 w-4" style={{ color: status.color }} />
        </div>
      ) : (
        <StatusIconPicker
          value={status.icon}
          onChange={(icon) =>
            update({ statusSlug: status.slug, patch: { icon: icon as never } })
          }
        />
      )}

      <input
        value={draftLabel}
        disabled={baseline}
        onChange={(e) => setDraftLabel(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm disabled:opacity-70"
      />

      {!baseline && (
        <ColorPicker
          value={status.color}
          onChange={(color) =>
            update({
              statusSlug: status.slug,
              patch: { color: color as never }
            })
          }
        />
      )}

      {!baseline && (
        <button
          type="button"
          onClick={() => onRequestDelete(status)}
          aria-label="Delete status"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
        >
          <Trash className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
```

Create `packages/frontend/src/lib/status-baseline.ts` exporting `isBaselineStatus(slug)` (checks against `BASELINE_STATUS_SLUGS` from shared).

- [ ] **Step 3: Render in settings**

In `statuses.tsx`, render the resolved list:

```tsx
function StatusesSettings() {
  const { orgSlug, slug } = Route.useParams()
  const result = useAtomValue(projectStatusesAtom(projectKey(orgSlug, slug)))

  if (!Result.isSuccess(result)) return <SettingsSkeleton />

  const statuses = [...result.value].toSorted((a, b) =>
    a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0
  )

  return (
    <div className="flex flex-col gap-2">
      {statuses.map((s) => (
        <StatusEditorRow
          key={s.slug}
          status={s}
          orgSlug={orgSlug}
          slug={slug}
          onRequestDelete={(s) => /* see Task D3 */}
        />
      ))}
      <StatusCreateRow orgSlug={orgSlug} slug={slug} />
    </div>
  )
}
```

- [ ] **Step 4: Test the page renders + label edit works**

Run `bun run --filter @projectproject/frontend dev`. Visit `/orgs/<org>/projects/<proj>/settings/statuses`. Verify:
- Three baseline rows render with their icons, labels disabled.
- Inputs accept text but are no-op for baselines.

- [ ] **Step 5: Commit**

```
git add packages/frontend/src/components/StatusIconPicker.tsx packages/frontend/src/components/StatusEditorRow.tsx packages/frontend/src/lib/status-baseline.ts packages/frontend/src/routes/.../settings/statuses.tsx
git commit -m "feat(frontend): status editor row + icon picker, render baseline list"
```

---

### Task D3: Inline create + reorder (settings) + delete-with-reassign

**Files:**
- Create: `packages/frontend/src/components/StatusCreateRow.tsx`
- Create: `packages/frontend/src/components/StatusDeleteForm.tsx`
- Modify: `packages/frontend/src/routes/.../settings/statuses.tsx`
- Modify: `packages/frontend/messages/en/tickets.json`

- [ ] **Step 1: i18n keys**

Add to `packages/frontend/messages/en/tickets.json`:

```json
"tickets_status_create_placeholder": "New status name",
"tickets_status_create_add": "Add status",
"tickets_status_delete_confirm_with_tickets": "This status has {count} tickets. Move them to:",
"tickets_status_delete_confirm_empty": "Delete this status?",
"tickets_status_delete_confirm_button": "Delete",
"tickets_status_validation_invalid_label": "Pick a name with at least one letter or digit.",
"tickets_status_validation_slug_exists": "A status with this name already exists.",
"tickets_status_validation_reserved": "That name is reserved by a built-in status."
```

- [ ] **Step 2: `StatusCreateRow`**

A row with a + icon, an input, and an implicit-commit on Enter/blur. Submits via `createStatusAtom`, shows error inline if rejection.

- [ ] **Step 3: `StatusDeleteForm` (the reassign picker)**

An inline form (no dialog) that appears in-place of the row being deleted. Shows:
- "This status has N tickets. Move them to:" + a select listing every other status (baselines included)
- "Delete" button. Cancel reverts.

If N === 0, just the confirm button. Both paths call `deleteStatusAtom`.

- [ ] **Step 4: Wire `onRequestDelete` in `statuses.tsx`**

Track which row is in delete mode via `useState`. While in delete mode, replace the row with `StatusDeleteForm`.

- [ ] **Step 5: Wire settings drag-to-reorder**

Use `@dnd-kit/core` if it's already in the project; otherwise the simpler approach is pointer-based with `getBoundingClientRect`. Each row carries `orderKey`; on drop, compute the new `orderKey` via `fractional-indexing.generateKeyBetween(prev, next)` and call `reorderStatusAtom`.

(Check for existing drag library: `grep -l "@dnd-kit" packages/frontend/package.json`. If absent, this is a follow-up; for this PR, use simple up/down buttons next to the drag handle to ship and iterate.)

- [ ] **Step 6: Manual verification**

- Create "In review" → row appears, baselines stay above (depending on order).
- Edit label/icon/color → updates persist.
- Reorder → kanban reflects new order.
- Delete with tickets → reassign picker appears, picking target succeeds.
- Delete empty status → single confirm, no picker.

- [ ] **Step 7: Commit**

```
git add packages/frontend/src/components/StatusCreateRow.tsx packages/frontend/src/components/StatusDeleteForm.tsx packages/frontend/src/routes/.../settings/statuses.tsx packages/frontend/messages/en/tickets.json
git commit -m "feat(frontend): status create + reorder + delete-with-reassign UI"
```

---

## Phase E — Kanban + status select integration

### Task E1: Status select popover lists dynamic statuses + manage link

**Files:**
- Modify: `packages/frontend/src/components/StatusField.tsx`
- Modify: `packages/frontend/messages/en/tickets.json` (add `tickets_status_manage_link`)

- [ ] **Step 1: Replace the iteration over `STATUS_META` with atom data**

Inside the popover content, render statuses from `projectStatusesAtom`. Each row uses `statusMetaFor(slug, statuses)` to resolve display.

- [ ] **Step 2: Add the footer link**

```tsx
<Link
  to="/orgs/$orgSlug/projects/$slug/settings/statuses"
  params={{ orgSlug, slug }}
  className="block border-t px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
>
  {m.tickets_status_manage_link()} →
</Link>
```

- [ ] **Step 3: Verify**

Open a ticket, click the status badge — confirm the popover lists all statuses (baselines + customs) and the manage link navigates.

- [ ] **Step 4: Commit**

```
git add packages/frontend/src/components/StatusField.tsx packages/frontend/messages/en/tickets.json
git commit -m "feat(frontend): dynamic status list + manage link in select popover"
```

---

### Task E2: Kanban renders all columns from atom

**Files:**
- Modify: `packages/frontend/src/components/sprints/SprintBoard.tsx`
- Modify: `packages/frontend/src/components/sprints/SprintBoardColumn.tsx`

- [ ] **Step 1: Drive column list from `projectStatusesAtom`**

`SprintBoard.tsx` consumes the atom, sorts by `orderKey`, renders one `SprintBoardColumn` per status (including empty). Pass `status` (the full row) into the column so it can render icon/label/color from row data.

- [ ] **Step 2: `SprintBoardColumn` renders dynamic header**

Use `statusMetaFor(status.slug, allStatuses)` to compute the icon component. Apply `style={{ color: status.color }}` to the icon for custom statuses (baseline coloring stays via `BASELINE_META.className`).

- [ ] **Step 3: Verify**

Create "Blocked" status → confirm a new empty column appears on the sprint board, sorted by `orderKey`.

- [ ] **Step 4: Commit**

```
git add packages/frontend/src/components/sprints/SprintBoard.tsx packages/frontend/src/components/sprints/SprintBoardColumn.tsx
git commit -m "feat(frontend): kanban renders all columns from project statuses"
```

---

### Task E3: Long-press iOS-style reorder mode

**Files:**
- Create: `packages/frontend/src/components/sprints/BoardReorderMode.tsx`
- Modify: `packages/frontend/src/components/sprints/SprintBoard.tsx`

- [ ] **Step 1: Reorder-mode state machine**

`BoardReorderMode` is a hook + UI overlay coordinating:
- A `pointerdown` on a column header starts a 500ms timer
- During the timer, the header gets a subtle scale animation (motion's `whileTap` / `animate`)
- After 500ms (pointer still down), enter reorder mode: animate tickets out (opacity + height), columns scale to ~0.97, drag handles become visible
- Pointer release while in reorder mode commits the order
- Tap outside / Escape exits without commit

Use `motion` for the transitions (`packages/frontend/src/lib/springs.ts` already has spring presets). Tickets disappearance: `AnimatePresence` with `opacity: 1 → 0, height: full → 0`, stagger by 30ms.

- [ ] **Step 2: Reorder gesture**

While in reorder mode, columns are pointer-draggable. As a column moves past the midpoint of an adjacent column, swap their `orderKey`s in the optimistic view (the optimistic reducer of `reorderStatusAtom` already does this), debounced server commit on drop.

Use `fractional-indexing.generateKeyBetween(prevKey, nextKey)` for the new key.

- [ ] **Step 3: Exit transitions**

On commit, reverse the animation: columns scale back to 1, tickets fade in (staggered). Total entry/exit duration ~250-350ms; the user feels they entered a "mode" and came back, not that things juddered.

- [ ] **Step 4: Verify**

- Long-press a column header → tickets fade away, columns enter reorder mode.
- Drag columns to reorder → adjacent swaps happen smoothly.
- Release → optimistic order persists, tickets fade back in, server confirms.
- Tap outside → exit without committing the swap-in-progress.
- Confirm baselines participate in reorder.

- [ ] **Step 5: Commit**

```
git add packages/frontend/src/components/sprints/BoardReorderMode.tsx packages/frontend/src/components/sprints/SprintBoard.tsx
git commit -m "feat(frontend): iOS-style long-press reorder mode for kanban columns"
```

---

## Wrap-up

### Task W1: Run full test suite + typecheck + manual smoke

- [ ] `bun run --filter @projectproject/shared test`
- [ ] `bun run --filter @projectproject/backend test`
- [ ] `bun run --filter @projectproject/backend typecheck`
- [ ] `bun run --filter @projectproject/frontend typecheck`
- [ ] `bun run --filter @projectproject/frontend lint`
- [ ] Run `bun run --filter @projectproject/backend dev` + frontend dev. Manually exercise: create / rename (cosmetic + slug-changing) / icon / color / reorder (settings + long-press kanban) / delete with reassign / delete empty. Confirm pulse appears during cascades.

### Task W2: Update memory

- [ ] Update `~/.claude/projects/C--web-project-project/memory/project_custom_statuses_T65.md` — mark status as **implemented**, link to merged PR.

### Task W3: Open the PR

```
gh pr create --title "Custom ticket columns (T-65)" --body "$(cat <<'EOF'
## Summary
- Adds `project_status` table + materialized baselines; `ticket_index.status` widens from enum to text
- Slug-derived identity with cascading rename + delete-with-reassign
- Kanban renders all columns dynamically; iOS-style long-press reorder
- Curated Lucide icon set + reused `ColorPicker`
- Closes T-65

## Test plan
- [ ] CRUD a custom status from settings
- [ ] Rename: cosmetic (instant) vs slug-changing (pulse + cascade)
- [ ] Delete with tickets: reassign picker; without tickets: bare confirm
- [ ] Long-press a kanban column header → reorder mode → drop → persisted

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** Every decision in the grill-me memory has a task. The workflow feature is intentionally untouched (semantics live there).
- **Type consistency:** `StatusSlug`, `StatusLabel`, `StatusIcon` are defined once in `Status.ts` and referenced everywhere. Atom payload shape `{ statusSlug, patch }` is used identically in `updateStatusAtom` and the handler call.
- **No placeholders:** Code blocks are concrete. The one "verify exact import path" note (`withProjectLock`) is a real cross-check the implementer must do because that helper's location varies between codebases — flagged honestly.
- **TDD:** Backend service work is test-first. Frontend UI is non-TDD (visual verification noted instead).
- **Frequent commits:** ~22 distinct commits across the plan.
