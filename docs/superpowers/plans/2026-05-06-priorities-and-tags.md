# Priorities & Tags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a required `priority` (low/med/high) field to tickets and a project-scoped, name+color tag registry (Postgres-backed) that tickets can apply by storing tag _names_ in their frontmatter.

**Architecture:** Vertical-slice contract-first. Shared schemas + HttpApi first, then DB migration, then backend service + handler, then frontend atoms, then UI surfaces (priority editor on ticket detail, priority column on list, inline tag editor, tag filter dropdown, tag admin route). The tag registry lives in a new `project_tag` table; tag _usage_ lives as plain string arrays in ticket frontmatter — no registry validation on write, orphan strings tolerated. Renames and force-deletes walk every ticket and rewrite frontmatter; non-force delete fails with a typed `TagInUse` error carrying the affected tickets so the UI can warn inline.

**Tech stack:** Effect v3, `@effect/platform` HttpApi, Drizzle + Postgres, gray-matter (already wired), `@effect-atom/atom-react`, TanStack Start + Router, shadcn/Radix, Tailwind, Lucide. No new runtime deps.

**Testing convention.** Same as the recent inline-form plan: `bun typecheck` after every shared/backend task; manual UI verification via `bun dev` once the frontend tasks land. The repo currently has only one backend test (`packages/backend/src/main.test.ts`) and no frontend test harness — extra unit tests are a follow-up.

**Spec:** `docs/superpowers/specs/2026-05-06-priorities-and-tags-design.md`.

---

## File map

**Created:**

- `packages/shared/src/schemas/Tag.ts` — `TagName`, `TagColor`, `Tag`, `CreateTagInput`, `UpdateTagInput`.
- `packages/backend/src/services/Tags.ts` — Tags service (list/create/update/remove + helpers).
- `packages/backend/src/handlers/tags.ts` — HttpApi group handler.
- `packages/frontend/src/atoms/tags.ts` — atoms for the tag registry.
- `packages/frontend/src/lib/priority-meta.ts` — priority labels, ordering, badge tone.
- `packages/frontend/src/components/TagChip.tsx` — colored tag pill primitive.
- `packages/frontend/src/components/TagEditor.tsx` — inline tag editor for ticket detail.
- `packages/frontend/src/components/TagAdminSection.tsx` — owner/admin CRUD UI.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/tags.tsx` — tag admin route (sibling of `members.tsx`).

**Modified:**

- `packages/shared/src/errors.ts` — add `TagInUse`.
- `packages/shared/src/schemas/Ticket.ts` — add `TicketPriority`, `priority` + `tags` to `Ticket` / `UpdateTicketInput`.
- `packages/shared/src/index.ts` — re-export the new Tag schemas.
- `packages/shared/src/api.ts` — add `Tags` HttpApi group; reuse existing tickets `update` shape (it already takes `UpdateTicketInput`).
- `packages/backend/src/db/schema.ts` — add `projectTag` table.
- `packages/backend/src/services/Tickets.ts` — frontmatter decode/write for `priority` + `tags`; default `priority: "med"`, `tags: []`.
- `packages/backend/src/server.ts` (or wherever handlers are merged) — wire `TagsHandlerLive`.
- `packages/backend/src/main.ts` (or runtime layer) — provide `Tags` service.
- `packages/frontend/src/lib/ticket-meta.ts` — extend with priority meta if convenient (or use the new `priority-meta.ts`).
- `packages/frontend/src/components/TicketList.tsx` — priority column + sort + tag filter in dropdown.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/index.tsx` — ticket detail: priority editor + tag editor.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx` — add "Tags" tab to project nav (owner/admin only).

---

## Task 1: Shared — Priority schema + Tag schemas + `TagInUse` error

**Files:**

- Modify: `packages/shared/src/schemas/Ticket.ts`
- Create: `packages/shared/src/schemas/Tag.ts`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Extend Ticket schema with `priority` + `tags`**

In `packages/shared/src/schemas/Ticket.ts`, add the priority literal and extend the structs. Use `Schema.optionalWith` defaults for backwards-compat decoding from existing frontmatter:

```ts
export const TicketPriority = Schema.Literal("low", "med", "high")
export type TicketPriority = typeof TicketPriority.Type

export const Ticket = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: TicketStatus,
  type: TicketType,
  priority: TicketPriority,
  tags: Schema.Array(Schema.String),
  branch: Schema.NullOr(Schema.String),
  pr: Schema.NullOr(Schema.Number),
  lastTransitionedPr: Schema.NullOr(Schema.Number),
  assignees: Schema.Array(Schema.String),
  createdBy: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date
})

// UpdateTicketInput — add the two new optional fields:
export const UpdateTicketInput = Schema.Struct({
  title: Schema.optional(
    Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200))
  ),
  status: Schema.optional(TicketStatus),
  type: Schema.optional(TicketType),
  priority: Schema.optional(TicketPriority),
  tags: Schema.optional(Schema.Array(Schema.String)),
  assignees: Schema.optional(Schema.Array(Schema.String)),
  body: Schema.optional(Schema.String)
})
```

- [ ] **Step 2: Create `packages/shared/src/schemas/Tag.ts`**

```ts
// Tag schema — over-the-wire shape for project-scoped tag registry rows.
//
// `name` is the canonical reference: lowercase, [a-z0-9-], unique per project.
// Ticket frontmatter stores tag *names* in a string array; this registry
// adds presentation (color) and admin operations (rename, delete).

import { Schema } from "effect"

export const TagName = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9][a-z0-9-]{0,30}$/),
  Schema.brand("TagName")
)
export type TagName = typeof TagName.Type

export const TagColor = Schema.String.pipe(
  Schema.pattern(/^#[0-9a-f]{6}$/i),
  Schema.brand("TagColor")
)
export type TagColor = typeof TagColor.Type

export const Tag = Schema.Struct({
  name: TagName,
  color: TagColor,
  createdBy: Schema.String,
  createdAt: Schema.Date
})
export type Tag = typeof Tag.Type

export const CreateTagInput = Schema.Struct({
  name: TagName,
  color: Schema.optional(TagColor)
})
export type CreateTagInput = typeof CreateTagInput.Type

export const UpdateTagInput = Schema.Struct({
  name: Schema.optional(TagName),
  color: Schema.optional(TagColor)
})
export type UpdateTagInput = typeof UpdateTagInput.Type
```

- [ ] **Step 3: Add `TagInUse` to `errors.ts`**

Append to `packages/shared/src/errors.ts` (alongside `BranchNotFound` etc.):

```ts
import { TicketId } from "./schemas/Ticket"

// 409 — tag delete attempted while still applied to tickets. The body
// carries the affected tickets so the UI can list them inline before the
// caller retries with `force=true`.
export class TagInUse extends Schema.TaggedError<TagInUse>()(
  "TagInUse",
  {
    tagName: Schema.String,
    usages: Schema.Array(
      Schema.Struct({ ticketId: TicketId, title: Schema.String })
    )
  },
  HttpApiSchema.annotations({ status: 409 })
) {}
```

If `TicketId` is not yet imported in `errors.ts`, add the import.

- [ ] **Step 4: Re-export from the barrel**

Add to `packages/shared/src/index.ts`:

```ts
export * from "./schemas/Tag"
```

- [ ] **Step 5: Type-check**

Run: `bun typecheck`
Expected: PASS. Existing call-sites are unaffected because `priority` and `tags` are required-but-currently-unused on the wire shape (they will be filled in by the backend in a later task).

> ⚠️ The frontend currently destructures `Ticket` shapes with no priority/tags. Type-check may surface usages that need to be ignored or updated. If errors point at frontend code reading `Ticket` fields, defer the frontend fix to its respective UI task — do not patch them here.

If typecheck fails purely on the backend's `Tickets.ts` because its hand-rolled `frontmatterToWire` doesn't return `priority`/`tags` yet, that's expected — Task 4 fixes it. Hold the commit until Step 6.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/Ticket.ts packages/shared/src/schemas/Tag.ts packages/shared/src/errors.ts packages/shared/src/index.ts
git commit -m "feat(shared): priority + tag schemas, TagInUse error"
```

---

## Task 2: Shared — Tags HttpApi group

**Files:**

- Modify: `packages/shared/src/api.ts`

- [ ] **Step 1: Define `TagsGroup`**

Insert after `TicketsGroup` and before `AppApi` in `packages/shared/src/api.ts`:

```ts
import { CreateTagInput, Tag, TagName, UpdateTagInput } from "./schemas/Tag"
import { TagInUse } from "./errors"

const ProjectTagPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  name: TagName
})

const TagsGroup = HttpApiGroup.make("tags")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/projects/:slug/tags")
      .setPath(ProjectPath)
      .addSuccess(Schema.Array(Tag))
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.post("create", "/orgs/:orgSlug/projects/:slug/tags")
      .setPath(ProjectPath)
      .setPayload(CreateTagInput)
      .addSuccess(Tag)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(Conflict)
  )
  .add(
    HttpApiEndpoint.patch("update", "/orgs/:orgSlug/projects/:slug/tags/:name")
      .setPath(ProjectTagPath)
      .setPayload(UpdateTagInput)
      .addSuccess(Tag)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(Conflict)
  )
  .add(
    HttpApiEndpoint.del("delete", "/orgs/:orgSlug/projects/:slug/tags/:name")
      .setPath(ProjectTagPath)
      .setUrlParams(
        Schema.Struct({ force: Schema.optional(Schema.BooleanFromString) })
      )
      .addSuccess(Schema.Void)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(TagInUse)
  )
  .middleware(Authentication)
```

Add `.add(TagsGroup)` to the `AppApi` chain at the bottom.

- [ ] **Step 2: Type-check**

Run: `bun typecheck`
Expected: PASS. (Backend handler is missing — typecheck of backend is OK because `HttpApiBuilder` only fails at runtime if a group is unhandled. If it complains, see Task 6 to wire the handler before final.)

> If the backend typecheck does fail on missing handler coverage (older `@effect/platform` does this at the type level): defer the commit until Task 6 lands.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/api.ts
git commit -m "feat(shared): add Tags HttpApi group"
```

---

## Task 3: DB — `project_tag` table + migration

**Files:**

- Modify: `packages/backend/src/db/schema.ts`
- Add: `packages/backend/src/db/migrations/000N_*.sql` (drizzle-generated)

- [ ] **Step 1: Add table to schema**

Append to `packages/backend/src/db/schema.ts` (after `projectMember`):

```ts
export const projectTag = pgTable(
  "project_tag",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectIndex.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.name] }),
    index("project_tag_project_idx").on(t.projectId)
  ]
)
```

- [ ] **Step 2: Generate migration**

Run: `cd packages/backend && bun run db:generate`
Expected: a new SQL file appears under `src/db/migrations/`. Inspect it — should `CREATE TABLE project_tag` with the composite PK and the index.

- [ ] **Step 3: Apply migration**

Run: `cd packages/backend && bun run db:migrate`
Expected: migration applies cleanly. (If the database isn't running, start it first via the project's docker compose.)

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/src/db/migrations/
git commit -m "feat(backend): add project_tag table"
```

---

## Task 4: Backend — Tickets service: priority + tags pass-through

**Files:**

- Modify: `packages/backend/src/services/Tickets.ts`

The Tickets service decodes ticket frontmatter via `TicketFrontmatter` and round-trips via `frontmatterToDisk` / `frontmatterToWire`. We add `priority` + `tags` with `optionalWith` defaults so existing `.md` files decode cleanly.

- [ ] **Step 1: Extend `TicketFrontmatter` and the wire/disk helpers**

In `packages/backend/src/services/Tickets.ts`:

```ts
const TicketFrontmatter = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: Schema.Literal("todo", "in_progress", "done"),
  type: Schema.Literal("feat", "bug", "chore", "other"),
  priority: Schema.optionalWith(Schema.Literal("low", "med", "high"), {
    default: () => "med" as const
  }),
  tags: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => []
  }),
  branch: Schema.NullOr(Schema.String),
  pr: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    default: () => null
  }),
  lastTransitionedPr: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    default: () => null
  }),
  assignees: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => []
  }),
  createdBy: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date
})
```

Update `frontmatterToWire` and `frontmatterToDisk` to include `priority` and `tags`:

```ts
function frontmatterToWire(fm: TicketFrontmatter): Ticket {
  return {
    id: fm.id,
    title: fm.title,
    status: fm.status,
    type: fm.type,
    priority: fm.priority,
    tags: fm.tags,
    branch: fm.branch,
    pr: fm.pr,
    lastTransitionedPr: fm.lastTransitionedPr,
    assignees: fm.assignees,
    createdBy: fm.createdBy,
    createdAt: fm.createdAt,
    updatedAt: fm.updatedAt
  }
}

function frontmatterToDisk(fm: TicketFrontmatter): Record<string, unknown> {
  return {
    id: fm.id,
    title: fm.title,
    status: fm.status,
    type: fm.type,
    priority: fm.priority,
    tags: fm.tags,
    branch: fm.branch,
    pr: fm.pr,
    lastTransitionedPr: fm.lastTransitionedPr,
    assignees: fm.assignees,
    createdBy: fm.createdBy,
    createdAt: fm.createdAt.toISOString(),
    updatedAt: fm.updatedAt.toISOString()
  }
}
```

- [ ] **Step 2: Default new tickets to `priority: "med"`, `tags: []`**

In `Tickets.create`'s `fm` object:

```ts
const fm: TicketFrontmatter = {
  id: candidate as TicketId,
  title: input.title,
  status: "todo",
  type: input.type ?? "other",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  lastTransitionedPr: null,
  assignees: [],
  createdBy: ownerId,
  createdAt: now,
  updatedAt: now
}
```

- [ ] **Step 3: Pass `priority` and `tags` through `Tickets.update`**

Replace the `next` build inside `Tickets.update` with:

```ts
const next: TicketFrontmatter = {
  id: existing.id,
  title: input.title ?? existing.title,
  status: input.status ?? existing.status,
  type: input.type ?? existing.type,
  priority: input.priority ?? existing.priority,
  tags: input.tags !== undefined ? input.tags : existing.tags,
  branch: existing.branch,
  pr: existing.pr,
  lastTransitionedPr: existing.lastTransitionedPr,
  assignees:
    input.assignees !== undefined ? input.assignees : existing.assignees,
  createdBy: existing.createdBy,
  createdAt: existing.createdAt,
  updatedAt: new Date()
}
```

Tag values are **not** validated against the registry. Orphan strings are tolerated (matches the spec).

- [ ] **Step 4: Type-check**

Run: `bun typecheck`
Expected: PASS. Frontend may still error on its own ticket-detail / list reads of `Ticket` fields it doesn't know about — those land in later UI tasks. Backend should be green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/Tickets.ts
git commit -m "feat(backend): tickets carry priority + tags in frontmatter"
```

---

## Task 5: Backend — `Tags` service

**Files:**

- Create: `packages/backend/src/services/Tags.ts`

This service owns the registry CRUD plus the rename / force-delete walks over ticket frontmatter. It depends on `Db`, `Markdown`, and `Projects` (for permission gates and the project-id lookup).

- [ ] **Step 1: Write the service**

Create `packages/backend/src/services/Tags.ts`:

```ts
// Tags service — project-scoped tag registry over Postgres, with frontmatter
// rewrites for rename and force-delete.
//
// Permissions: list = any project member; create/update/remove = owner|admin.
// Permission checks delegate to Projects.requireMember / requireRole.
//
// Tag *usage* is the string array in ticket frontmatter; this layer only
// reads frontmatter when scanning for usages, never writes the registry into
// frontmatter — frontmatter strings are the source of truth for "does this
// ticket carry this tag".

import { Effect, Schema } from "effect"
import { and, eq } from "drizzle-orm"
import {
  Conflict,
  Forbidden,
  NotFound,
  Tag,
  TagInUse,
  TicketId,
  type CreateTagInput,
  type UpdateTagInput
} from "@projectproject/shared"
import { projectIndex, projectTag } from "../db/schema"
import { Db } from "./Db"
import { Markdown, type MarkdownError } from "./Markdown"
import { Projects } from "./Projects"

const PALETTE = [
  "#7c3aed",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
  "#84cc16",
  "#f97316"
] as const

const TagFrontmatter = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  tags: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => []
  })
})
const decodeTagFrontmatter = Schema.decodeUnknown(TagFrontmatter)

function nextColor(used: ReadonlyArray<string>): string {
  for (const c of PALETTE) if (!used.includes(c)) return c
  return PALETTE[used.length % PALETTE.length]
}

export class Tags extends Effect.Service<Tags>()("Tags", {
  effect: Effect.gen(function* () {
    const db = yield* Db
    const md = yield* Markdown
    const projects = yield* Projects

    const projectIdFromSlug = (slug: string): Effect.Effect<string, NotFound> =>
      db
        .select({ id: projectIndex.id })
        .from(projectIndex)
        .where(eq(projectIndex.slug, slug))
        .limit(1)
        .pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] ? Effect.succeed(rows[0].id) : Effect.fail(new NotFound())
          )
        )

    const list = (orgSlug: string, userId: string, slug: string) =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const projectId = yield* projectIdFromSlug(slug)
        const rows = yield* db
          .select()
          .from(projectTag)
          .where(eq(projectTag.projectId, projectId))
          .pipe(Effect.orDie)
        return rows.map(
          (r): Tag => ({
            name: r.name as Tag["name"],
            color: r.color as Tag["color"],
            createdBy: r.createdBy,
            createdAt: r.createdAt
          })
        )
      })

    const create = (
      orgSlug: string,
      userId: string,
      slug: string,
      input: CreateTagInput
    ): Effect.Effect<Tag, NotFound | Forbidden | Conflict> =>
      Effect.gen(function* () {
        yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const projectId = yield* projectIdFromSlug(slug)

        const existing = yield* db
          .select({ color: projectTag.color })
          .from(projectTag)
          .where(eq(projectTag.projectId, projectId))
          .pipe(Effect.orDie)

        const conflict = existing.some
        // (deduplicated below via PK violation)
        void conflict

        const color =
          input.color ??
          (nextColor(existing.map((e) => e.color)) as Tag["color"])

        const inserted = yield* db
          .insert(projectTag)
          .values({
            projectId,
            name: input.name,
            color,
            createdBy: userId
          })
          .returning()
          .pipe(
            Effect.catchAll((cause) => {
              const msg = String((cause as { message?: string }).message ?? "")
              if (
                msg.includes("duplicate key") ||
                msg.includes("project_tag_pkey")
              ) {
                return Effect.fail(new Conflict({ reason: "tag_exists" }))
              }
              return Effect.die(cause)
            })
          )
        const row = inserted[0]
        return {
          name: row.name as Tag["name"],
          color: row.color as Tag["color"],
          createdBy: row.createdBy,
          createdAt: row.createdAt
        }
      })

    const rewriteTagInTickets = (
      orgSlug: string,
      slug: string,
      oldName: string,
      newName: string | null
    ): Effect.Effect<void, MarkdownError> =>
      Effect.gen(function* () {
        const ids = yield* md.listTicketIds(orgSlug, slug)
        for (const id of ids) {
          const file = yield* md
            .readTicketFile(orgSlug, slug, id)
            .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null)))
          if (!file) continue
          const fm = file.data as Record<string, unknown>
          const tagsRaw = fm.tags
          if (!Array.isArray(tagsRaw)) continue
          if (!tagsRaw.some((t) => t === oldName)) continue

          const nextTags =
            newName === null
              ? tagsRaw.filter((t) => t !== oldName)
              : tagsRaw.map((t) => (t === oldName ? newName : t))
          const nextFm = {
            ...fm,
            tags: nextTags,
            updatedAt: new Date().toISOString()
          }
          yield* md.writeTicketFile(orgSlug, slug, id, nextFm, file.body)
        }
      })

    const scanTagUsages = (orgSlug: string, slug: string, name: string) =>
      Effect.gen(function* () {
        const ids = yield* md.listTicketIds(orgSlug, slug)
        const usages: { ticketId: TicketId; title: string }[] = []
        for (const id of ids) {
          const file = yield* md
            .readTicketFile(orgSlug, slug, id)
            .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null)))
          if (!file) continue
          const decoded = yield* decodeTagFrontmatter(file.data).pipe(
            Effect.catchAll(() => Effect.succeed(null))
          )
          if (!decoded) continue
          if (decoded.tags.includes(name)) {
            usages.push({ ticketId: decoded.id, title: decoded.title })
          }
        }
        return usages
      })

    const update = (
      orgSlug: string,
      userId: string,
      slug: string,
      name: string,
      patch: UpdateTagInput
    ): Effect.Effect<Tag, NotFound | Forbidden | Conflict | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const projectId = yield* projectIdFromSlug(slug)

        const existingRows = yield* db
          .select()
          .from(projectTag)
          .where(
            and(eq(projectTag.projectId, projectId), eq(projectTag.name, name))
          )
          .limit(1)
          .pipe(Effect.orDie)
        if (existingRows.length === 0) return yield* Effect.fail(new NotFound())
        const existing = existingRows[0]

        const nextName = patch.name ?? existing.name
        const nextColor = patch.color ?? existing.color
        const renaming = nextName !== existing.name

        if (renaming) {
          const collision = yield* db
            .select({ name: projectTag.name })
            .from(projectTag)
            .where(
              and(
                eq(projectTag.projectId, projectId),
                eq(projectTag.name, nextName)
              )
            )
            .limit(1)
            .pipe(Effect.orDie)
          if (collision.length > 0)
            return yield* Effect.fail(new Conflict({ reason: "tag_exists" }))
        }

        yield* db
          .update(projectTag)
          .set({ name: nextName, color: nextColor })
          .where(
            and(eq(projectTag.projectId, projectId), eq(projectTag.name, name))
          )
          .pipe(Effect.orDie)

        if (renaming) {
          yield* rewriteTagInTickets(orgSlug, slug, name, nextName)
        }

        return {
          name: nextName as Tag["name"],
          color: nextColor as Tag["color"],
          createdBy: existing.createdBy,
          createdAt: existing.createdAt
        }
      })

    const remove = (
      orgSlug: string,
      userId: string,
      slug: string,
      name: string,
      force: boolean
    ): Effect.Effect<void, NotFound | Forbidden | TagInUse | MarkdownError> =>
      Effect.gen(function* () {
        yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const projectId = yield* projectIdFromSlug(slug)

        const existingRows = yield* db
          .select({ name: projectTag.name })
          .from(projectTag)
          .where(
            and(eq(projectTag.projectId, projectId), eq(projectTag.name, name))
          )
          .limit(1)
          .pipe(Effect.orDie)
        if (existingRows.length === 0) return yield* Effect.fail(new NotFound())

        const usages = yield* scanTagUsages(orgSlug, slug, name)
        if (usages.length > 0 && !force) {
          return yield* Effect.fail(new TagInUse({ tagName: name, usages }))
        }

        if (usages.length > 0) {
          yield* rewriteTagInTickets(orgSlug, slug, name, null)
        }
        yield* db
          .delete(projectTag)
          .where(
            and(eq(projectTag.projectId, projectId), eq(projectTag.name, name))
          )
          .pipe(Effect.orDie)
      })

    return { list, create, update, remove } as const
  })
}) {}
```

- [ ] **Step 2: Type-check**

Run: `bun typecheck`
Expected: PASS in `packages/backend`. (The handler isn't wired yet — that's the next task. If the typecheck fails because the HttpApi has a `tags` group with no implementation, defer the commit to Task 6.)

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/services/Tags.ts
git commit -m "feat(backend): add Tags service (registry CRUD + frontmatter walks)"
```

---

## Task 6: Backend — `tags` handler + runtime wiring

**Files:**

- Create: `packages/backend/src/handlers/tags.ts`
- Modify: wherever the runtime layer is composed (`packages/backend/src/main.ts` or `packages/backend/src/server.ts`)

- [ ] **Step 1: Read the existing handler/runtime wiring**

Open `packages/backend/src/handlers/projects.ts` and the file that composes `HttpApiBuilder.api(...)` (likely `server.ts` or `main.ts`). Mirror that pattern exactly — same imports, same `HttpApiBuilder.group(...)` call, same `dieOnMarkdown` helper if present.

- [ ] **Step 2: Write `packages/backend/src/handlers/tags.ts`**

```ts
// Thin handlers for the `tags` HttpApi group. All logic in Tags service.

import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import { Effect } from "effect"
import { CurrentOrg } from "../services/CurrentOrg"
import { Tags } from "../services/Tags"

const dieOnMarkdown = <A, R>(eff: Effect.Effect<A, any, R>) =>
  eff.pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))

export const TagsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "tags",
  (handlers) =>
    handlers
      .handle("list", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tags = yield* Tags
          return yield* tags.list(org.orgSlug, user.id, path.slug)
        })
      )
      .handle("create", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tags = yield* Tags
          return yield* tags.create(org.orgSlug, user.id, path.slug, payload)
        })
      )
      .handle("update", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tags = yield* Tags
          return yield* tags.update(
            org.orgSlug,
            user.id,
            path.slug,
            path.name,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
      .handle("delete", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tags = yield* Tags
          yield* tags.remove(
            org.orgSlug,
            user.id,
            path.slug,
            path.name,
            urlParams.force ?? false
          )
        }).pipe(dieOnMarkdown)
      )
)
```

- [ ] **Step 3: Wire `TagsHandlerLive` and the `Tags.Default` layer into the runtime**

In whichever file composes the API runtime (look for `Layer.mergeAll(...)` or `HttpApiBuilder.api(AppApi).pipe(...)`), add `TagsHandlerLive` next to the existing handlers and `Tags.Default` next to the existing service layers. The `Projects` and `Markdown` services are already provided.

Example shape (paths may differ):

```ts
import { TagsHandlerLive } from "./handlers/tags"
import { Tags } from "./services/Tags"

const ApiLive = HttpApiBuilder.api(AppApi).pipe(
  Layer.provide(ProjectsHandlerLive),
  Layer.provide(TicketsHandlerLive),
  Layer.provide(TagsHandlerLive)
  // ...
)

const ServicesLive = Layer.mergeAll(
  Projects.Default,
  Tickets.Default,
  Tags.Default
  // ...
)
```

- [ ] **Step 4: Type-check + smoke-run**

Run: `bun typecheck`
Expected: PASS.

Run: `bun --cwd packages/backend dev` (or the project's standard backend dev command). Hit `GET /api/orgs/<orgSlug>/projects/<slug>/tags` with no auth — expect 401. With a session cookie, expect 200 and `[]`.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/handlers/tags.ts packages/backend/src/main.ts packages/backend/src/server.ts
git commit -m "feat(backend): wire Tags handler + service into the runtime"
```

(Adjust the `git add` paths to match the files you actually touched.)

---

## Task 7: Frontend — tag atoms

**Files:**

- Create: `packages/frontend/src/atoms/tags.ts`

The atoms follow the `Atom.optimistic` + `Atom.optimisticFn` shape from `atoms/github.ts`. Optimistic for create (synthetic next state); pulse-only for rename and delete (the rename rewrites tickets too — easier to flip the pulse and let `tagsBaseAtom` resolve to truth).

- [ ] **Step 1: Write the file**

```ts
import { Atom, Result } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import {
  ticketKey,
  ticketAtom,
  ticketsListAtom,
  ticketsListKey
} from "@/atoms/tickets"
import type {
  CreateTagInput,
  Tag,
  TagInUse,
  TagName,
  TicketId,
  UpdateTagInput
} from "@projectproject/shared"

export const tagsKey = (orgSlug: string, slug: string) => `${orgSlug}/${slug}`

const tagsBaseAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const orgSlug = key.slice(0, idx)
  const slug = key.slice(idx + 1)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.tags.list({ path: { orgSlug, slug } })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
})

export const tagsAtom = Atom.family((key: string) =>
  Atom.optimistic(tagsBaseAtom(key))
)

export const createTagAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const orgSlug = key.slice(0, idx)
  const slug = key.slice(idx + 1)
  return Atom.optimisticFn(tagsAtom(key), {
    reducer: (current, input: CreateTagInput) => {
      if (!Result.isSuccess(current)) return current
      const synthetic: Tag = {
        name: input.name,
        color: (input.color ?? "#7c3aed") as Tag["color"],
        createdBy: "",
        createdAt: new Date()
      }
      return Result.success([...current.value, synthetic], { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: CreateTagInput, get) {
        const client = yield* ApiClient
        const tag = yield* client.tags.create({
          path: { orgSlug, slug },
          payload: input
        })
        get.refresh(tagsBaseAtom(key))
        return tag
      })
    )
  })
})

type RenameInput = {
  oldName: TagName
  nextName?: TagName
  color?: Tag["color"]
}
export const renameTagAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const orgSlug = key.slice(0, idx)
  const slug = key.slice(idx + 1)
  return Atom.optimisticFn(tagsAtom(key), {
    reducer: (current, _input: RenameInput) =>
      Result.isSuccess(current)
        ? Result.success(current.value, { waiting: true })
        : current,
    fn: runtime.fn(
      Effect.fn(function* (input: RenameInput, get) {
        const client = yield* ApiClient
        const patch: UpdateTagInput = {}
        if (input.nextName) patch.name = input.nextName
        if (input.color) patch.color = input.color
        const tag = yield* client.tags.update({
          path: { orgSlug, slug, name: input.oldName },
          payload: patch
        })
        get.refresh(tagsBaseAtom(key))
        get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
        return tag
      })
    )
  })
})

type DeleteInput = { name: TagName; force: boolean }
export const deleteTagAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const orgSlug = key.slice(0, idx)
  const slug = key.slice(idx + 1)
  return Atom.optimisticFn(tagsAtom(key), {
    reducer: (current, _input: DeleteInput) =>
      Result.isSuccess(current)
        ? Result.success(current.value, { waiting: true })
        : current,
    fn: runtime.fn(
      Effect.fn(function* (input: DeleteInput, get) {
        const client = yield* ApiClient
        yield* client.tags.delete({
          path: { orgSlug, slug, name: input.name },
          urlParams: { force: input.force ? "true" : undefined } as any
        })
        get.refresh(tagsBaseAtom(key))
        get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
      })
    )
  })
})

export type { TagInUse }
export { ticketAtom, ticketKey }
```

> ⚠️ The exact `urlParams` encoding for the boolean depends on `Schema.BooleanFromString` vs `Schema.optional(Schema.Boolean)`. Verify against the API client's inferred type for `tags.delete` — the call is type-checked, so let TypeScript drive this.

- [ ] **Step 2: Type-check**

Run: `bun typecheck`
Expected: PASS for shared + backend; the frontend likely has unrelated type errors stemming from priority/tags-on-ticket UI not yet handling the new fields. Don't try to fix those yet — they belong to later UI tasks.

If frontend `bun typecheck` fails ONLY in tag-atoms code, fix inline. If it fails in unrelated UI files referencing `Ticket` shapes, defer.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/atoms/tags.ts
git commit -m "feat(frontend): tag atoms (optimistic + pulse-only mutations)"
```

---

## Task 8: Frontend — priority meta + Badge tone wiring

**Files:**

- Create: `packages/frontend/src/lib/priority-meta.ts`

- [ ] **Step 1: Write the meta module**

```ts
import { ChevronUp, ChevronsUp, Minus, type LucideIcon } from "lucide-react"
import type { TicketPriority } from "@projectproject/shared"
import type { BadgeTone } from "@/components/ui/badge"

export const PRIORITY_META: Record<
  TicketPriority,
  { label: string; icon: LucideIcon; tone: BadgeTone; ordinal: number }
> = {
  low: { label: "Low", icon: Minus, tone: "muted", ordinal: 0 },
  med: { label: "Med", icon: ChevronUp, tone: "amber", ordinal: 1 },
  high: { label: "High", icon: ChevronsUp, tone: "red", ordinal: 2 }
}

export const PRIORITY_ORDER: ReadonlyArray<TicketPriority> = [
  "low",
  "med",
  "high"
]
```

- [ ] **Step 2: Type-check + commit**

Run: `bun typecheck` — expect PASS.

```bash
git add packages/frontend/src/lib/priority-meta.ts
git commit -m "feat(frontend): priority-meta map (label/icon/tone/ordinal)"
```

---

## Task 9: Frontend — priority editor on ticket detail

**Files:**

- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/index.tsx`

The ticket detail already uses `SegmentedTabs` with `variant="inline"` for "Update status to:". Mirror the pattern.

- [ ] **Step 1: Locate the existing status editor**

Open the ticket detail file. Find where the status `SegmentedTabs` is rendered (search for `Update status to`). The pattern there is the canonical one — copy it for priority.

- [ ] **Step 2: Add the priority editor**

Below (or beside) the status editor, render:

```tsx
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority-meta"

const priorityItems: SegmentedItem<"low" | "med" | "high">[] = PRIORITY_ORDER.map(
  (p) => ({
    key: p,
    label: PRIORITY_META[p].label,
    icon: PRIORITY_META[p].icon
  })
)

<div className="flex items-center gap-2">
  <span className="text-xs text-muted-foreground">Update priority to:</span>
  <SegmentedTabs
    variant="inline"
    items={priorityItems}
    activeKey={ticket.priority}
    renderItem={({ item, className }) => (
      <button
        type="button"
        className={className}
        onClick={() =>
          updateTicket({
            orgSlug,
            slug,
            id: ticket.id,
            priority: item.key
          })
        }
      >
        <item.icon className="size-3.5" />
        {item.label}
      </button>
    )}
  />
</div>
```

Wire `updateTicket` from `useAtomSet(updateTicketAtom)` exactly like the status editor does (it likely already exists in the file).

- [ ] **Step 3: Run dev server and verify**

Run: `bun --cwd packages/frontend dev`
Open a ticket. Toggle low / med / high. Expect the chip to update (existing `updateTicketAtom` refreshes `ticketAtom` + `ticketsListAtom`).

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/index.tsx
git commit -m "feat(frontend): priority editor on ticket detail"
```

---

## Task 10: Frontend — priority column on ticket list (sortable)

**Files:**

- Modify: `packages/frontend/src/components/TicketList.tsx`

- [ ] **Step 1: Read the existing list**

The list already has columns and a sort menu. Locate the cell rendering pattern and the sort dropdown logic — match them.

- [ ] **Step 2: Add a `Priority` column**

Render a `Badge` per row using `PRIORITY_META[ticket.priority].tone` and the priority's icon. Width should be tight; use `tone` for color, no separate label needed beyond the meta `label`.

```tsx
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority-meta"

// In the row render:
const meta = PRIORITY_META[ticket.priority]
<Badge tone={meta.tone} size="xs">
  <meta.icon className="size-3" />
  {meta.label}
</Badge>
```

- [ ] **Step 3: Add a "Priority" sort option**

In the existing sort menu, add an entry "Priority (high → low)". The compare function:

```ts
const byPriority = (a: Ticket, b: Ticket) =>
  PRIORITY_META[b.priority].ordinal - PRIORITY_META[a.priority].ordinal
```

Plumb through whatever the existing sort key state expects — the codebase uses an enum-like `sortKey` value. Add `"priority"` to it and a case in the comparator switch.

- [ ] **Step 4: Verify**

Dev server. Toggle the sort. Confirm the column renders and sorting orders high → med → low.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/TicketList.tsx
git commit -m "feat(frontend): priority column on ticket list (sortable)"
```

---

## Task 11: Frontend — `TagChip` primitive

**Files:**

- Create: `packages/frontend/src/components/TagChip.tsx`

- [ ] **Step 1: Write the chip**

The existing `Badge` primitive uses preset tones from a fixed map; tags need _dynamic_ hex colors. Build `TagChip` as a thin wrapper that drives the color via inline style (background + foreground), following Badge's chrome (rounded, padding, transition-colors, hover ease-out).

```tsx
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  name: string
  color: string | null
  onRemove?: () => void
  size?: "xs" | "sm"
  className?: string
  pulse?: boolean
}

const NEUTRAL = "#94a3b8"

export function TagChip({
  name,
  color,
  onRemove,
  size = "sm",
  className,
  pulse
}: Props) {
  const hex = color ?? NEUTRAL
  const sizeClasses =
    size === "xs" ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 py-0.5 text-xs"
  return (
    <span
      data-slot="tag-chip"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-md font-medium transition-colors",
        sizeClasses,
        pulse && "animate-pulse",
        className
      )}
      style={{
        backgroundColor: `${hex}1a`,
        color: hex
      }}
    >
      {name}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove tag ${name}`}
          onClick={onRemove}
          className="-mr-1 inline-flex size-4 items-center justify-center rounded transition-colors hover:bg-black/10 active:scale-[0.97]"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```bash
bun typecheck
git add packages/frontend/src/components/TagChip.tsx
git commit -m "feat(frontend): TagChip primitive (dynamic hex color)"
```

---

## Task 12: Frontend — inline tag editor on ticket detail

**Files:**

- Create: `packages/frontend/src/components/TagEditor.tsx`
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/index.tsx`

`TagEditor` renders the applied chips, an `Input` for type-to-add with autocomplete against `tagsAtom`, and (for owner/admin) a "+ Create tag '<value>'" affordance when the typed string isn't a registered tag.

- [ ] **Step 1: Write `TagEditor`**

```tsx
import { useAtomValue, useAtomSet, Result } from "@effect-atom/atom-react"
import { useState, useMemo } from "react"
import { TagChip } from "@/components/TagChip"
import { tagsAtom, tagsKey, createTagAtom } from "@/atoms/tags"
import { updateTicketAtom } from "@/atoms/tickets"
import type { Tag, TagName, TicketDetail } from "@projectproject/shared"

type Props = {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  canManageTags: boolean
}

export function TagEditor({ orgSlug, slug, ticket, canManageTags }: Props) {
  const key = tagsKey(orgSlug, slug)
  const tagsResult = useAtomValue(tagsAtom(key))
  const updateTicket = useAtomSet(updateTicketAtom)
  const createTag = useAtomSet(createTagAtom(key))
  const [draft, setDraft] = useState("")

  const registry = Result.isSuccess(tagsResult) ? tagsResult.value : []
  const colorByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of registry) map.set(t.name, t.color)
    return map
  }, [registry])

  const applied = ticket.tags
  const lowered = draft.trim().toLowerCase()
  const suggestions = lowered
    ? registry.filter(
        (t) => t.name.includes(lowered) && !applied.includes(t.name)
      )
    : []
  const exactRegistered = registry.find((t) => t.name === lowered)
  const isValidNewName = /^[a-z0-9][a-z0-9-]{0,30}$/.test(lowered)

  const apply = (next: ReadonlyArray<string>) =>
    updateTicket({ orgSlug, slug, id: ticket.id, tags: next })

  const addTag = (name: string) => {
    if (applied.includes(name)) return
    apply([...applied, name])
    setDraft("")
  }

  const removeTag = (name: string) => {
    apply(applied.filter((t) => t !== name))
  }

  const createAndApply = () => {
    if (!isValidNewName) return
    createTag({ name: lowered as TagName }).then(() => addTag(lowered))
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {applied.map((name) => (
        <TagChip
          key={name}
          name={name}
          color={colorByName.get(name) ?? null}
          onRemove={() => removeTag(name)}
        />
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value.toLowerCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            if (exactRegistered) addTag(exactRegistered.name)
            else if (canManageTags) createAndApply()
          }
          if (e.key === "Backspace" && draft === "" && applied.length) {
            apply(applied.slice(0, -1))
          }
        }}
        placeholder={applied.length ? "" : "Add tag..."}
        className="h-6 min-w-[8ch] flex-1 bg-transparent text-xs outline-none"
      />
      {draft && suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {suggestions.slice(0, 5).map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => addTag(t.name)}
              className="text-[11px] underline-offset-2 hover:underline"
            >
              + {t.name}
            </button>
          ))}
        </div>
      ) : null}
      {draft && !exactRegistered && isValidNewName && canManageTags ? (
        <button
          type="button"
          onClick={createAndApply}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          + Create tag '{lowered}'
        </button>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Mount it on ticket detail**

In the ticket detail page, below the title, render `<TagEditor ... canManageTags={role === "owner" || role === "admin"} />`. Use whatever role plumbing the existing detail page has (see how status / member editing already gates).

- [ ] **Step 3: Verify**

Dev server. Open a ticket. As an admin user: type "foo", press Enter — see the chip appear and a `project_tag` row created. Backspace removes it. As a plain member: typing a novel string shows nothing extra; clicking an existing chip removes it.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/TagEditor.tsx packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/index.tsx
git commit -m "feat(frontend): inline tag editor on ticket detail"
```

---

## Task 13: Frontend — tag filter in ticket list filter dropdown

**Files:**

- Modify: `packages/frontend/src/components/TicketList.tsx`

- [ ] **Step 1: Locate the existing filter dropdown**

The list already has a filter / sort dropdown above it (search for the `SlidersHorizontal` icon usage). Look at how the type / status filters are rendered there.

- [ ] **Step 2: Add a tags filter section**

Inside the dropdown content, after the existing filters, add a multi-select section sourced from `tagsAtom(tagsKey(orgSlug, slug))`. Each tag chip in the dropdown is a `TagChip` rendered with a checked state (e.g. a `data-selected` attribute or a boxed wrapper).

State:

```ts
const [selectedTags, setSelectedTags] = useState<ReadonlyArray<string>>([])
```

Filter predicate inside the existing list `useMemo`:

```ts
.filter(
  (t) =>
    selectedTags.length === 0 ||
    selectedTags.every((sel) => t.tags.includes(sel))
)
```

- [ ] **Step 3: Verify**

Dev server. Apply two tags to two different tickets. Use the filter — selecting both tags should show only tickets that carry _both_ (AND).

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/TicketList.tsx
git commit -m "feat(frontend): tag filter in ticket list dropdown"
```

---

## Task 14: Frontend — tag admin route + UI

**Files:**

- Create: `packages/frontend/src/components/TagAdminSection.tsx`
- Create: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/tags.tsx`
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx` — add a "Tags" tab next to Tickets/About/Members, visible only when role is owner or admin.

- [ ] **Step 1: Write `TagAdminSection`**

```tsx
import { useAtomValue, useAtomSet, Result } from "@effect-atom/atom-react"
import { useState } from "react"
import { TagChip } from "@/components/TagChip"
import {
  tagsAtom,
  tagsKey,
  createTagAtom,
  renameTagAtom,
  deleteTagAtom
} from "@/atoms/tags"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import type { Tag, TagName } from "@projectproject/shared"

type Props = { orgSlug: string; slug: string }

export function TagAdminSection({ orgSlug, slug }: Props) {
  const key = tagsKey(orgSlug, slug)
  const tags = useAtomValue(tagsAtom(key))
  const tickets = useAtomValue(ticketsListAtom(ticketsListKey(orgSlug, slug)))
  const create = useAtomSet(createTagAtom(key))
  const rename = useAtomSet(renameTagAtom(key))
  const remove = useAtomSet(deleteTagAtom(key))

  const [draft, setDraft] = useState("")
  const [pendingDelete, setPendingDelete] = useState<{
    name: string
    usages: { ticketId: string; title: string }[]
  } | null>(null)

  const list = Result.isSuccess(tags) ? tags.value : []
  const ticketList = Result.isSuccess(tickets) ? tickets.value : []
  const usageCount = (name: string) =>
    ticketList.reduce((n, t) => n + (t.tags.includes(name) ? 1 : 0), 0)

  const handleCreate = () => {
    const lowered = draft.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(lowered)) return
    create({ name: lowered as TagName }).then(() => setDraft(""))
  }

  const handleDelete = async (name: string) => {
    try {
      await remove({ name: name as TagName, force: false })
      setPendingDelete(null)
    } catch (e: any) {
      if (e?._tag === "TagInUse") {
        setPendingDelete({ name, usages: e.usages })
      }
    }
  }

  const handleForceDelete = async () => {
    if (!pendingDelete) return
    await remove({ name: pendingDelete.name as TagName, force: true })
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toLowerCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleCreate()
            }
          }}
          placeholder="new-tag-name"
          className="h-7 rounded-md border bg-transparent px-2 text-xs"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="h-7 rounded-md border px-2 text-xs transition-transform duration-100 active:scale-[0.97]"
        >
          Create
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {list.map((tag) => (
          <TagRow
            key={tag.name}
            tag={tag}
            usageCount={usageCount(tag.name)}
            onRename={(next) => rename({ oldName: tag.name, nextName: next })}
            onRecolor={(color) => rename({ oldName: tag.name, color })}
            onDelete={() => handleDelete(tag.name)}
          />
        ))}
      </div>
      {pendingDelete ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <p>
            <strong>{pendingDelete.name}</strong> is applied to{" "}
            {pendingDelete.usages.length} ticket
            {pendingDelete.usages.length === 1 ? "" : "s"}:{" "}
            {pendingDelete.usages
              .map((u) => `${u.ticketId} ${u.title}`)
              .join(", ")}
            . Delete anyway?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleForceDelete}
              className="h-7 rounded-md border border-red-500 px-2 text-red-600 transition-transform duration-100 active:scale-[0.97]"
            >
              Delete and strip
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="h-7 rounded-md border px-2 transition-transform duration-100 active:scale-[0.97]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TagRow({
  tag,
  usageCount,
  onRename,
  onRecolor,
  onDelete
}: {
  tag: Tag
  usageCount: number
  onRename: (next: TagName) => void
  onRecolor: (color: Tag["color"]) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tag.name)

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={tag.color}
        onChange={(e) => onRecolor(e.target.value as Tag["color"])}
        className="size-6 cursor-pointer rounded border bg-transparent p-0"
        aria-label={`Color for ${tag.name}`}
      />
      {editing ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toLowerCase())}
          onBlur={() => {
            if (draft !== tag.name) onRename(draft as TagName)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            if (e.key === "Escape") {
              setDraft(tag.name)
              setEditing(false)
            }
          }}
          autoFocus
          className="h-6 rounded border bg-transparent px-1 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-left"
        >
          <TagChip name={tag.name} color={tag.color} />
        </button>
      )}
      <span className="text-xs text-muted-foreground">
        {usageCount} ticket{usageCount === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="ml-auto text-xs text-red-600 transition-transform duration-100 active:scale-[0.97]"
      >
        Delete
      </button>
    </div>
  )
}
```

> Note: this component intentionally uses a native `<input type="color">` for the swatch — a richer custom picker is a follow-up. It's keyboard-accessible and matches the "no dialog" rule.

- [ ] **Step 2: Write the route**

Create `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/tags.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { TagAdminSection } from "@/components/TagAdminSection"
import { useProject } from "./-context"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/tags"
)({
  component: TagsPage,
  loader: ({ params }) => ({
    crumb: [
      {
        type: "static" as const,
        label: "Projects",
        to: "/orgs/$orgSlug/projects",
        params: { orgSlug: params.orgSlug }
      },
      {
        type: "project" as const,
        orgSlug: params.orgSlug,
        slug: params.slug
      },
      { type: "static" as const, label: "Tags" }
    ]
  })
})

function TagsPage() {
  const { orgSlug, slug } = Route.useParams()
  const project = useProject()
  const role = project.members.find(/* current user lookup */)?.role
  if (role !== "owner" && role !== "admin") return null

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-lg font-semibold">Tags</h1>
      <TagAdminSection orgSlug={orgSlug} slug={slug} />
    </div>
  )
}
```

> Replace the `current user lookup` comment with the real call — the existing `members.tsx` route does this; mirror its pattern.

- [ ] **Step 3: Add a "Tags" tab to the project nav**

In `route.tsx` for the project layout, find where the SegmentedTabs items array is built. Append a `tags` item, gated on owner/admin role:

```ts
{
  key: "tags",
  label: "Tags",
  icon: TagsIcon, // import { Tags as TagsIcon } from "lucide-react"
  to: "/orgs/$orgSlug/projects/$slug/tags",
  visible: role === "owner" || role === "admin"
}
```

Filter the array on `visible` before rendering.

- [ ] **Step 4: Verify**

Dev server. As owner: see the Tags tab; create / rename / delete; verify the warning flow when deleting a used tag and the force-delete strip.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/TagAdminSection.tsx packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/tags.tsx packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx
git commit -m "feat(frontend): tag admin route with rename/delete-with-warning"
```

---

## Task 15: Manual verification + final type-check

- [ ] **Step 1: Full type-check**

Run: `bun typecheck` at the repo root.
Expected: PASS across all three packages.

- [ ] **Step 2: Backend smoke**

With the dev server running and a logged-in admin session, exercise the API surface end-to-end with curl or via the UI:

- `POST /api/orgs/<org>/projects/<slug>/tags` with `{ name: "auth" }` — expect 200 + a registry row.
- `GET /api/orgs/<org>/projects/<slug>/tags` — expect the new tag.
- `PATCH .../tags/auth` with `{ name: "authentication" }` — expect 200; check that any ticket's frontmatter `tags` was rewritten on disk.
- Apply the renamed tag to a ticket via the UI.
- `DELETE .../tags/authentication` — expect 409 with `TagInUse` carrying the usages.
- `DELETE .../tags/authentication?force=true` — expect 204; confirm the ticket's frontmatter no longer contains the tag.

- [ ] **Step 3: Frontend smoke**

- Priority chip on ticket list, sorting works.
- Priority editor on ticket detail toggles all three values.
- Inline tag editor: admin can create + apply; member can apply existing only; backspace removes; chips show correct colors.
- Filter: select two tags, list narrows by AND.
- Tag admin: rename, recolor, delete, force-delete flows all behave.

- [ ] **Step 4: Commit any cleanup**

```bash
git status
# resolve any stray files; commit if anything material lingers.
```

---

## Self-review notes

Spec coverage check:

- Required priority with default `med` ✓ (Task 1, 4)
- DB-backed tag registry ✓ (Task 3)
- Frontmatter source-of-truth for tag usage ✓ (Task 4)
- Owner/admin gates for registry CRUD ✓ (Task 5)
- Multiple tags per ticket ✓ (Task 4, 12)
- TagInUse typed error + force flow ✓ (Tasks 1, 5, 6, 14)
- Rename rewrites tickets ✓ (Task 5)
- Force-delete strips ✓ (Task 5)
- Priority chip column + sort ✓ (Task 10)
- No tags column on list ✓ (intentional — only filter + detail)
- Tags filter integrated into existing dropdown ✓ (Task 13)
- Inline tag editor on ticket detail ✓ (Task 12)
- Tag admin surface ✓ (Task 14)
- SegmentedTabs priority editor ✓ (Task 9)

Open spec questions resolved during planning:

- "Does a project settings surface exist?" — No standalone settings page exists; this plan adds a dedicated `tags.tsx` route as a sibling tab. If a settings page emerges later, the `TagAdminSection` is reusable as-is.
- Color palette — fixed 10-hex array in `Tags.ts` (`PALETTE`). Easy to revisit.

Known gaps deferred to follow-ups (not blocking shipping):

- Frontend test harness — none exists; no unit tests added.
- File locks on rename/delete walks — documented in spec as accepted limitation.
- `<input type="color">` is the cheapest possible color picker — replace with a curated palette popover in a follow-up if the UX grates.
