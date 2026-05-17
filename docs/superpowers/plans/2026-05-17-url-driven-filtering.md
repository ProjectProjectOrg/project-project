# URL-Driven Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the ticket-list filtering system as a shared, end-to-end-typed `TicketListQuery` protocol — server-side filtered, cursor-paginated, URL-bound on every list surface, with a sibling `tickets.count` endpoint for status-chip facets.

**Architecture:** Shared Effect Schema declares the request envelope (`TicketFilter`, `TicketSort`, `TicketListQuery`) and response shape (`TicketListPage`, `TicketCounts`). The HTTP API consumes those schemas as URL params; the TanStack Router route consumes the same schemas via `validateSearch`. Backend extends the existing `listPaged` (built for MCP) with sort + free-text and adds a `count` companion. Frontend atoms are family-keyed by full request and refresh via `Reactivity.invalidate(["tickets", orgSlug, slug])`. Pagination is cursor-based with imperative "load more" appending to a `SubscriptionRef`-backed atom. Tickets are stored as markdown on disk; "filter" is in-memory matching after directory scan, not SQL — the existing `matchesTicketFilter` is extended.

**Tech Stack:** Effect 3.x, Effect Schema, Effect HttpApi, `@effect-atom/atom-react`, `@effect/experimental/Reactivity`, TanStack Router, paraglide for i18n. No new dependencies.

**Branches & tickets:** Branch `feat/url-driven-filtering` (already created). Closes T-58, T-48, T-50.

---

## Background — settled design decisions

These came out of grilling and are locked. Do not redesign during implementation; if you hit a wall, escalate.

- **Source of truth for filter state: URL.** No filter atoms. `Route.useSearch()` reads, `navigate({ search })` writes.
- **Backend filters; frontend does not.** Wire payload is filtered. No list-level optimistic reconciliation in this PR — mutations invalidate via Reactivity and the list refetches. Ticket-detail optimism is unchanged.
- **One filter schema per resource** (no generic DSL). `TicketFilter` is the unified shape; the MCP server, the HTTP API, and the frontend route all consume the same one.
- **Composite request envelope:** `TicketListQuery = { filter, sort, q, cursor? }`. Sort is `{ key, dir }` (forward-compatible for direction toggling). `q` is separate from filter — it's free-text across known string fields, not a field-level predicate.
- **Pagination: cursor-based.** Page state lives in the atom, not the URL. Load-more UI is an explicit button. Page size: 50.
- **Status chip counts come from a separate `tickets.count` endpoint** (closes T-50). Count omits the dimension it's faceting (status) so chips don't read circular counts.
- **Atom topology: family-keyed by full request** (Option A). Refresh via `Atom.withReactivity(["tickets", orgSlug, slug])` invalidated by mutations.
- **`"mine"` and `"unassigned"` are URL sentinels** resolved server-side. The URL carries `?assignee=mine`; backend substitutes `CurrentUser.id`. `null` in the wire-shape array = unassigned, encoded in URL as `assignee=unassigned`.
- **Single-select UI preserved** (status is a tab-strip, type/assignee/sprint are single-pick dropdowns, tags stay multi). Schema is multi-capable for future.
- **Default sort: `{ key: "created", dir: "desc" }`** via `Schema.optionalWith({ default })` — schema-applied on both sides.
- **Two surfaces in scope:** project index, sprint detail (list view). Sprint **board** view is out of scope.
- **No new dependencies.** All primitives needed are already in the workspace.
- **No comments in code** (project rule). All explanation lives in commit messages.
- **i18n via paraglide.** New user-facing strings go through `m.*` and live in `packages/frontend/messages/en/tickets.json`.

---

## File structure

### Files to create

- `packages/shared/src/Pagination.ts` — promoted from `mcp/Pagination.ts`; `Pagination`, `Page`, `CursorPayload`, `encodeCursor`, `decodeCursor`.
- `packages/shared/src/cursor.ts` — promoted from `mcp/cursor.ts`; `padNumericIdSort`, `tryDecodeCursor`, `paginateSorted`.
- `packages/shared/src/filters/Ticket.ts` — `TicketFilter` (extended), `TicketSort`, `SortKey`, `SortDir`, `TicketListQuery`, `TicketListPage`, `TicketCounts`, `DEFAULT_TICKET_SORT`, `NATURAL_SORT_DIR`, `TICKET_LIST_LIMIT`.
- `packages/shared/src/filters/Group.ts` — promoted from `mcp/filters/Group.ts`. No content change; kept for symmetry.
- `packages/shared/src/filters/url.ts` — `ticketListQueryFromSearch`, `ticketListQueryToSearch` — bridges TanStack Router's `Record<string, unknown>` ↔ `TicketListQuery`, handling sentinels and 1-element-array collapse.
- `packages/shared/src/filters/url.test.ts` — round-trip tests.
- `packages/shared/src/filters/index.ts` — barrel re-exports.

### Files to modify

- `packages/shared/src/index.ts` — re-export new filter module; remove re-exports of relocated MCP types.
- `packages/shared/src/api.ts` — `tickets.list` endpoint gains `setUrlParams(TicketListQuery)` and `addSuccess(TicketListPage)`; new `tickets.count` endpoint.
- `packages/shared/src/mcp/index.ts` and any MCP-internal modules that import from `mcp/Pagination` / `mcp/cursor` / `mcp/filters/` — point at new locations.
- `packages/backend/src/Services/TicketFilters.ts` — extend `matchesTicketFilter` to apply `q` (substring on `id` + `title`).
- `packages/backend/src/Services/Tickets.ts` — service shape: extend `listPaged` signature with `query: TicketListQuery`; add `count` method returning `TicketCounts`.
- `packages/backend/src/Layers/Tickets.ts` — implementations: sort handling, "mine" substitution, count aggregation.
- `packages/backend/src/handlers/tickets.ts` — wire `list` and `count` handlers.
- `packages/frontend/src/atoms/tickets.ts` — replace `ticketsListBaseAtom` / `ticketsListAtom` with family-keyed, request-aware versions; add `ticketsCountAtom`, `loadMoreTicketsAtom`; switch mutation atoms to `Reactivity.invalidate`.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/index.tsx` — schema-driven `validateSearch`; remove `TicketListUrlSync`.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId.tsx` — add `validateSearch`; pass query through; inject `groupId` filter.
- `packages/frontend/src/components/TicketList/index.tsx` — accept `query: TicketListQuery` instead of `uiKey` / `filterIds`; drop `filterIds`/`uiKey` props.
- `packages/frontend/src/components/TicketList/Toolbar.tsx` — read filter from `useSearch()`, write via `navigate`. Replace atom-backed `useAtom` calls.
- `packages/frontend/src/components/TicketList/FilteredList.tsx` — render the server-filtered list; drop client-side filter loop; show "Load more" button.
- `packages/frontend/src/components/sprints/SprintTicketList.tsx` — API change: drop `ticketIds`, `filterIds`, `uiKey`; take `groupId` instead.
- `packages/frontend/src/components/sprints/SprintDetail.tsx` — drop `filterIds` construction.
- `packages/frontend/messages/en/tickets.json` — add `tickets_load_more_button`, `tickets_load_more_loading`.

### Files to delete

- `packages/frontend/src/atoms/ticketListUi.ts` — fully obsolete.
- `packages/shared/src/mcp/Pagination.ts` — moved.
- `packages/shared/src/mcp/cursor.ts` — moved.
- `packages/shared/src/mcp/Pagination.test.ts` — moved.
- `packages/shared/src/mcp/cursor.test.ts` — moved.
- `packages/shared/src/mcp/filters/Ticket.ts` — moved.
- `packages/shared/src/mcp/filters/Group.ts` — moved.
- `packages/shared/src/mcp/filters/` directory — emptied.

---

## Phase A — Shared schemas & utility relocations

### Task A1: Promote pagination + cursor helpers out of `mcp/`

**Files:**
- Create: `packages/shared/src/Pagination.ts`
- Create: `packages/shared/src/cursor.ts`
- Create: `packages/shared/src/Pagination.test.ts`
- Create: `packages/shared/src/cursor.test.ts`
- Delete: `packages/shared/src/mcp/Pagination.ts`, `mcp/cursor.ts`, `mcp/Pagination.test.ts`, `mcp/cursor.test.ts`
- Modify: every file that imports from the old paths (find via grep).

- [ ] **Step 1: Move the files verbatim**

```bash
git mv packages/shared/src/mcp/Pagination.ts packages/shared/src/Pagination.ts
git mv packages/shared/src/mcp/cursor.ts packages/shared/src/cursor.ts
git mv packages/shared/src/mcp/Pagination.test.ts packages/shared/src/Pagination.test.ts
git mv packages/shared/src/mcp/cursor.test.ts packages/shared/src/cursor.test.ts
```

- [ ] **Step 2: Update internal imports inside the moved files**

`cursor.ts` imports from `./Pagination` — that relative path still works after the move. Verify by reading the moved files.

- [ ] **Step 3: Update all callers**

Grep for `from "..*mcp/Pagination"` and `from "..*mcp/cursor"` across the workspace and rewrite to the new paths:

Run: `grep -rn "mcp/Pagination\|mcp/cursor" packages --include="*.ts"`

For each match, replace the import path. The most common pattern:

```ts
import { encodeCursor, decodeCursor } from "@projectproject/shared/mcp/Pagination"
```
becomes
```ts
import { encodeCursor, decodeCursor } from "@projectproject/shared/Pagination"
```

If the project uses barrel re-exports through `@projectproject/shared`, prefer the barrel import:

```ts
import { encodeCursor, decodeCursor } from "@projectproject/shared"
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck` (or whatever the workspace's typecheck command is — check `package.json` if unsure).

Expected: clean.

- [ ] **Step 5: Run tests**

Run: `bun test packages/shared`

Expected: existing pagination + cursor tests pass at the new location.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "shared: promote pagination + cursor helpers out of mcp/"
```

---

### Task A2: Extend `TicketFilter` and add `TicketSort`, `TicketListQuery`, `TicketListPage`, `TicketCounts`

**Files:**
- Create: `packages/shared/src/filters/Ticket.ts`
- Create: `packages/shared/src/filters/Group.ts`
- Create: `packages/shared/src/filters/index.ts`
- Delete: `packages/shared/src/mcp/filters/Ticket.ts`, `mcp/filters/Group.ts`
- Modify: callers (MCP server) to use new import paths.

- [ ] **Step 1: Create `packages/shared/src/filters/Ticket.ts`**

```ts
import * as Schema from "effect/Schema"
import { TicketStatus, TicketType } from "../schemas/Ticket"
import { TagName } from "../schemas/Tag"
import { GroupId } from "../schemas/Group"
import { Ticket } from "../schemas/Ticket"
import { Page } from "../Pagination"

export const SortKey = Schema.Literal(
  "id",
  "created",
  "updated",
  "title",
  "priority"
)
export type SortKey = typeof SortKey.Type

export const SortDir = Schema.Literal("asc", "desc")
export type SortDir = typeof SortDir.Type

export const TicketSort = Schema.Struct({
  key: SortKey,
  dir: SortDir
})
export type TicketSort = typeof TicketSort.Type

export const DEFAULT_TICKET_SORT: TicketSort = {
  key: "created",
  dir: "desc"
}

export const NATURAL_SORT_DIR: Record<SortKey, SortDir> = {
  id: "asc",
  created: "desc",
  updated: "desc",
  title: "asc",
  priority: "desc"
}

export const AssigneeFilter = Schema.Union(
  Schema.Literal("mine"),
  Schema.Null,
  Schema.String
)
export type AssigneeFilter = typeof AssigneeFilter.Type

export const TicketFilter = Schema.Struct({
  status: Schema.optional(Schema.Array(TicketStatus)),
  type: Schema.optional(Schema.Array(TicketType)),
  assignee: Schema.optional(Schema.Array(AssigneeFilter)),
  tags: Schema.optional(Schema.Array(TagName)),
  hasBranch: Schema.optional(Schema.Boolean),
  hasPr: Schema.optional(Schema.Boolean),
  updatedAfter: Schema.optional(Schema.Date),
  groupId: Schema.optional(Schema.Array(GroupId))
})
export type TicketFilter = typeof TicketFilter.Type

export const TICKET_LIST_LIMIT = 50

export const TicketListQuery = Schema.Struct({
  filter: Schema.optional(TicketFilter),
  sort: Schema.optionalWith(TicketSort, {
    default: () => DEFAULT_TICKET_SORT
  }),
  q: Schema.optional(Schema.String),
  cursor: Schema.optional(Schema.String)
})
export type TicketListQuery = typeof TicketListQuery.Type

export const TicketListPage = Page(Ticket)
export type TicketListPage = typeof TicketListPage.Type

export const TicketCounts = Schema.Struct({
  total: Schema.Number,
  byStatus: Schema.Record({ key: TicketStatus, value: Schema.Number })
})
export type TicketCounts = typeof TicketCounts.Type

export const TicketCountQuery = Schema.Struct({
  filter: Schema.optional(TicketFilter),
  q: Schema.optional(Schema.String)
})
export type TicketCountQuery = typeof TicketCountQuery.Type
```

- [ ] **Step 2: Create `packages/shared/src/filters/Group.ts`**

```ts
import * as Schema from "effect/Schema"
import { GroupKind } from "../schemas/Group"

export const GroupFilter = Schema.Struct({
  kind: Schema.optional(Schema.Array(GroupKind)),
  active: Schema.optional(Schema.Boolean)
})
export type GroupFilter = typeof GroupFilter.Type
```

- [ ] **Step 3: Create `packages/shared/src/filters/index.ts`**

```ts
export * from "./Ticket"
export * from "./Group"
```

- [ ] **Step 4: Re-export from `packages/shared/src/index.ts`**

Add the re-export line in the appropriate location (follow existing barrel pattern):

```ts
export * from "./filters"
```

- [ ] **Step 5: Update MCP imports**

Grep: `grep -rn "mcp/filters" packages --include="*.ts"`

Replace each `from "@projectproject/shared/mcp/filters/..."` with `from "@projectproject/shared"` (or the appropriate `filters/...` path if used internally).

- [ ] **Step 6: Delete old MCP filter files**

```bash
git rm packages/shared/src/mcp/filters/Ticket.ts packages/shared/src/mcp/filters/Group.ts
rmdir packages/shared/src/mcp/filters
```

- [ ] **Step 7: Typecheck**

Run: `bun run typecheck`

Expected: clean across the workspace. If MCP code has a compile error, the import path update was missed.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "shared: add TicketListQuery/Page/Counts; relocate filter schemas"
```

---

### Task A3: URL transform helpers

**Files:**
- Create: `packages/shared/src/filters/url.ts`
- Create: `packages/shared/src/filters/url.test.ts`

This module bridges the flat URL search-param record produced by TanStack Router (`Record<string, unknown>`) with the composite `TicketListQuery` schema. Top-level keys are flattened; arrays are repeated params; `"mine"` and `"unassigned"` are sentinels; sort is `key:dir`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  ticketListQueryFromSearch,
  ticketListQueryToSearch
} from "./url"

describe("ticketListQueryFromSearch", () => {
  it("decodes a flat search record into the composite query", () => {
    const result = ticketListQueryFromSearch({
      status: ["todo", "in_progress"],
      type: "feat",
      assignee: ["mine", "unassigned"],
      tags: ["core"],
      q: "hello",
      sort: "created:desc"
    })
    expect(result.filter).toEqual({
      status: ["todo", "in_progress"],
      type: ["feat"],
      assignee: ["mine", null],
      tags: ["core"]
    })
    expect(result.sort).toEqual({ key: "created", dir: "desc" })
    expect(result.q).toBe("hello")
  })

  it("applies the schema default sort when missing", () => {
    const result = ticketListQueryFromSearch({})
    expect(result.sort).toEqual({ key: "created", dir: "desc" })
    expect(result.filter).toBeUndefined()
    expect(result.q).toBeUndefined()
  })

  it("ignores unknown keys and malformed values", () => {
    const result = ticketListQueryFromSearch({
      status: "garbage_status",
      sort: "no-colon",
      unrelated: "ignored"
    })
    expect(result.filter).toBeUndefined()
    expect(result.sort).toEqual({ key: "created", dir: "desc" })
  })
})

describe("ticketListQueryToSearch", () => {
  it("encodes a query into a flat search record", () => {
    const search = ticketListQueryToSearch({
      filter: {
        status: ["todo"],
        assignee: ["mine", null]
      },
      sort: { key: "updated", dir: "desc" },
      q: "abc"
    })
    expect(search).toEqual({
      status: "todo",
      assignee: ["mine", "unassigned"],
      sort: "updated:desc",
      q: "abc"
    })
  })

  it("omits the default sort", () => {
    const search = ticketListQueryToSearch({
      sort: { key: "created", dir: "desc" }
    })
    expect(search).toEqual({})
  })

  it("collapses single-element arrays to scalars", () => {
    const search = ticketListQueryToSearch({
      filter: { tags: ["core"] }
    })
    expect(search).toEqual({ tags: "core" })
  })

  it("round-trips for non-trivial queries", () => {
    const original = {
      filter: {
        status: ["todo", "in_progress"] as const,
        assignee: ["mine", null, "user_abc"] as const
      },
      sort: { key: "title" as const, dir: "asc" as const },
      q: "search term"
    }
    const search = ticketListQueryToSearch(original)
    const decoded = ticketListQueryFromSearch(search)
    expect(decoded.filter?.status).toEqual(original.filter.status)
    expect(decoded.filter?.assignee).toEqual(original.filter.assignee)
    expect(decoded.sort).toEqual(original.sort)
    expect(decoded.q).toBe(original.q)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun test packages/shared/src/filters/url.test.ts`

Expected: import error / file not found for `./url`.

- [ ] **Step 3: Implement `packages/shared/src/filters/url.ts`**

```ts
import * as Either from "effect/Either"
import * as Schema from "effect/Schema"
import {
  DEFAULT_TICKET_SORT,
  SortDir,
  SortKey,
  TicketFilter,
  TicketListQuery,
  type AssigneeFilter,
  type TicketSort
} from "./Ticket"

const ASSIGNEE_UNASSIGNED_SENTINEL = "unassigned"

const STATUS_VALUES = ["todo", "in_progress", "done"] as const
const TYPE_VALUES = ["feat", "bug", "chore", "other"] as const
const SORT_KEY_VALUES = ["id", "created", "updated", "title", "priority"] as const
const SORT_DIR_VALUES = ["asc", "desc"] as const

const asArray = <T>(value: unknown): ReadonlyArray<T> | undefined => {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) return value as ReadonlyArray<T>
  return [value as T]
}

const decodeStatus = (value: unknown) => {
  const arr = asArray<string>(value)
  if (!arr) return undefined
  const filtered = arr.filter((s): s is (typeof STATUS_VALUES)[number] =>
    (STATUS_VALUES as ReadonlyArray<string>).includes(s)
  )
  return filtered.length === 0 ? undefined : filtered
}

const decodeType = (value: unknown) => {
  const arr = asArray<string>(value)
  if (!arr) return undefined
  const filtered = arr.filter((s): s is (typeof TYPE_VALUES)[number] =>
    (TYPE_VALUES as ReadonlyArray<string>).includes(s)
  )
  return filtered.length === 0 ? undefined : filtered
}

const decodeAssignee = (
  value: unknown
): ReadonlyArray<AssigneeFilter> | undefined => {
  const arr = asArray<string>(value)
  if (!arr) return undefined
  const mapped = arr.map((s): AssigneeFilter => {
    if (s === "mine") return "mine"
    if (s === ASSIGNEE_UNASSIGNED_SENTINEL) return null
    return s
  })
  return mapped.length === 0 ? undefined : mapped
}

const decodeStringArray = (value: unknown): ReadonlyArray<string> | undefined => {
  const arr = asArray<string>(value)
  if (!arr) return undefined
  const filtered = arr.filter((s) => typeof s === "string" && s.length > 0)
  return filtered.length === 0 ? undefined : filtered
}

const decodeBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value
  if (value === "true") return true
  if (value === "false") return false
  return undefined
}

const decodeSort = (value: unknown): TicketSort => {
  if (typeof value !== "string") return DEFAULT_TICKET_SORT
  const [keyRaw, dirRaw] = value.split(":")
  if (!keyRaw || !dirRaw) return DEFAULT_TICKET_SORT
  if (!(SORT_KEY_VALUES as ReadonlyArray<string>).includes(keyRaw)) {
    return DEFAULT_TICKET_SORT
  }
  if (!(SORT_DIR_VALUES as ReadonlyArray<string>).includes(dirRaw)) {
    return DEFAULT_TICKET_SORT
  }
  return { key: keyRaw as SortKey, dir: dirRaw as SortDir }
}

export const ticketListQueryFromSearch = (
  search: Record<string, unknown>
): TicketListQuery => {
  const filter: Partial<TicketFilter> = {}
  const status = decodeStatus(search.status)
  if (status) filter.status = status
  const type = decodeType(search.type)
  if (type) filter.type = type
  const assignee = decodeAssignee(search.assignee)
  if (assignee) filter.assignee = assignee
  const tags = decodeStringArray(search.tags)
  if (tags) filter.tags = tags as TicketFilter["tags"]
  const groupId = decodeStringArray(search.groupId)
  if (groupId) filter.groupId = groupId as TicketFilter["groupId"]
  const hasBranch = decodeBoolean(search.hasBranch)
  if (hasBranch !== undefined) filter.hasBranch = hasBranch
  const hasPr = decodeBoolean(search.hasPr)
  if (hasPr !== undefined) filter.hasPr = hasPr

  const out: TicketListQuery = {
    sort: decodeSort(search.sort)
  }
  if (Object.keys(filter).length > 0) out.filter = filter as TicketFilter
  if (typeof search.q === "string" && search.q.length > 0) out.q = search.q
  if (typeof search.cursor === "string" && search.cursor.length > 0) {
    out.cursor = search.cursor
  }
  return out
}

const collapse = <T>(arr: ReadonlyArray<T>): T | ReadonlyArray<T> =>
  arr.length === 1 ? arr[0]! : arr

const encodeAssignee = (
  values: ReadonlyArray<AssigneeFilter>
): string | ReadonlyArray<string> => {
  const mapped = values.map((v) =>
    v === null ? ASSIGNEE_UNASSIGNED_SENTINEL : v
  )
  return collapse(mapped)
}

const isDefaultSort = (sort: TicketSort) =>
  sort.key === DEFAULT_TICKET_SORT.key && sort.dir === DEFAULT_TICKET_SORT.dir

export const ticketListQueryToSearch = (
  query: TicketListQuery
): Record<string, string | ReadonlyArray<string>> => {
  const out: Record<string, string | ReadonlyArray<string>> = {}
  const f = query.filter
  if (f) {
    if (f.status?.length) out.status = collapse(f.status)
    if (f.type?.length) out.type = collapse(f.type)
    if (f.assignee?.length) out.assignee = encodeAssignee(f.assignee)
    if (f.tags?.length) out.tags = collapse(f.tags)
    if (f.groupId?.length) out.groupId = collapse(f.groupId)
    if (f.hasBranch !== undefined) out.hasBranch = String(f.hasBranch)
    if (f.hasPr !== undefined) out.hasPr = String(f.hasPr)
  }
  if (query.sort && !isDefaultSort(query.sort)) {
    out.sort = `${query.sort.key}:${query.sort.dir}`
  }
  if (query.q && query.q.length > 0) out.q = query.q
  if (query.cursor) out.cursor = query.cursor
  return out
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/shared/src/filters/url.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/filters/url.ts packages/shared/src/filters/url.test.ts
git commit -m "shared: URL ↔ TicketListQuery transform"
```

---

## Phase B — HTTP API definition

### Task B1: Update `tickets.list` endpoint and add `tickets.count`

**Files:**
- Modify: `packages/shared/src/api.ts`

- [ ] **Step 1: Locate the `tickets` group in `api.ts`**

Grep: `grep -n "tickets" packages/shared/src/api.ts | head -20`

Find the `HttpApiGroup.make("tickets", ...)` definition.

- [ ] **Step 2: Update `tickets.list` to accept `TicketListQuery` as URL params and return `TicketListPage`**

Inside the group definition, find the existing `list` endpoint and change its signature:

```ts
HttpApiEndpoint.get("list", "/orgs/:orgSlug/projects/:slug/tickets")
  .setPath(Schema.Struct({ orgSlug: Schema.String, slug: Schema.String }))
  .setUrlParams(TicketListQuery)
  .addSuccess(TicketListPage)
  .addError(NotFound),
```

Make sure `TicketListQuery` and `TicketListPage` are imported at the top:

```ts
import { TicketListQuery, TicketListPage, TicketCounts, TicketCountQuery } from "./filters/Ticket"
```

- [ ] **Step 3: Add the `count` endpoint to the same group**

```ts
HttpApiEndpoint.get("count", "/orgs/:orgSlug/projects/:slug/tickets/count")
  .setPath(Schema.Struct({ orgSlug: Schema.String, slug: Schema.String }))
  .setUrlParams(TicketCountQuery)
  .addSuccess(TicketCounts)
  .addError(NotFound),
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`

Expected: TypeScript will complain that the backend handler signature no longer matches the API definition. That's expected — we'll fix it in Phase D. Note the error count so we can verify it shrinks after handler work.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/api.ts
git commit -m "shared(api): tickets.list takes TicketListQuery; add tickets.count"
```

---

## Phase C — Backend filter logic

### Task C1: Extend `matchesTicketFilter` with free-text search

**Files:**
- Modify: `packages/backend/src/Services/TicketFilters.ts`
- Modify: `packages/backend/src/Services/TicketFilters.test.ts` (create if absent)

- [ ] **Step 1: Read the current `matchesTicketFilter` implementation**

Run: `cat packages/backend/src/Services/TicketFilters.ts`

Internalize what it does. It matches a `Ticket` against a `TicketFilter`, returning boolean. We're going to add a `q` parameter (or wrap it).

- [ ] **Step 2: Refactor signature to take an opts bag**

The cleanest extension is a second function `matchesTicketQuery(ticket, query, viewerId)` that handles filter + q + "mine" substitution. Keep `matchesTicketFilter` as the field-level matcher and build the new function on top.

Write the failing test first:

```ts
import { describe, expect, it } from "vitest"
import { matchesTicketQuery } from "./TicketFilters"
import type { Ticket } from "@projectproject/shared"

const baseTicket: Ticket = {
  id: "T-1",
  title: "Hello world",
  status: "todo",
  type: "feat",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  lastTransitionedPr: null,
  assignees: [],
  createdBy: "user_a",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01")
}

describe("matchesTicketQuery", () => {
  it("matches when no filter and no q", () => {
    expect(matchesTicketQuery(baseTicket, {}, "user_a")).toBe(true)
  })

  it("filters by q on title (case-insensitive)", () => {
    expect(
      matchesTicketQuery(baseTicket, { q: "HELLO" }, "user_a")
    ).toBe(true)
    expect(
      matchesTicketQuery(baseTicket, { q: "goodbye" }, "user_a")
    ).toBe(false)
  })

  it("filters by q on id", () => {
    expect(
      matchesTicketQuery(baseTicket, { q: "t-1" }, "user_a")
    ).toBe(true)
  })

  it("substitutes 'mine' to viewer id", () => {
    const withMe: Ticket = { ...baseTicket, assignees: ["user_a"] }
    expect(
      matchesTicketQuery(
        withMe,
        { filter: { assignee: ["mine"] } },
        "user_a"
      )
    ).toBe(true)
    expect(
      matchesTicketQuery(
        withMe,
        { filter: { assignee: ["mine"] } },
        "user_b"
      )
    ).toBe(false)
  })

  it("treats null in assignee as unassigned", () => {
    expect(
      matchesTicketQuery(
        baseTicket,
        { filter: { assignee: [null] } },
        "user_a"
      )
    ).toBe(true)
    const assigned: Ticket = { ...baseTicket, assignees: ["user_a"] }
    expect(
      matchesTicketQuery(
        assigned,
        { filter: { assignee: [null] } },
        "user_a"
      )
    ).toBe(false)
  })
})
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `bun test packages/backend/src/Services/TicketFilters.test.ts`

Expected: `matchesTicketQuery` is not exported.

- [ ] **Step 4: Implement `matchesTicketQuery`**

Append to `packages/backend/src/Services/TicketFilters.ts`:

```ts
import type { TicketListQuery, Ticket, TicketFilter } from "@projectproject/shared"

const resolveAssignees = (
  assignee: ReadonlyArray<string | null> | undefined,
  viewerId: string
): ReadonlyArray<string | null> | undefined => {
  if (!assignee) return undefined
  return assignee.map((v) => (v === "mine" ? viewerId : v))
}

export const matchesTicketQuery = (
  ticket: Ticket,
  query: Pick<TicketListQuery, "filter" | "q">,
  viewerId: string
): boolean => {
  if (query.filter) {
    const resolvedFilter: TicketFilter = {
      ...query.filter,
      assignee: resolveAssignees(query.filter.assignee, viewerId)
    }
    if (!matchesTicketFilter(ticket, resolvedFilter)) return false
  }
  if (query.q && query.q.length > 0) {
    const needle = query.q.toLowerCase()
    const hay =
      ticket.title.toLowerCase() + " " + ticket.id.toLowerCase()
    if (!hay.includes(needle)) return false
  }
  return true
}
```

The exact signature of `matchesTicketFilter` may need a small tweak — if it doesn't currently handle `assignee` containing `null` for unassigned, fix that inside `matchesTicketFilter` so a ticket with empty `assignees` matches when the filter array includes `null`. Verify by reading the existing function.

- [ ] **Step 5: Run the test, confirm it passes**

Run: `bun test packages/backend/src/Services/TicketFilters.test.ts`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/Services/TicketFilters.ts packages/backend/src/Services/TicketFilters.test.ts
git commit -m "backend: extend ticket matcher with q + 'mine' resolution"
```

---

### Task C2: Extend `Tickets.listPaged` with sort and q; rename to `list`

**Files:**
- Modify: `packages/backend/src/Services/Tickets.ts` (service shape)
- Modify: `packages/backend/src/Layers/Tickets.ts` (implementation)

The existing service has both a `list` (no filter) and a `listPaged` (filter + cursor). We're consolidating: the new HTTP `list` becomes the paged-and-filtered one. Rename `listPaged` → `list`. Drop the old unpaged `list` since no caller needs it after the refactor.

- [ ] **Step 1: Update the service shape in `Tickets.ts`**

Replace the existing `list` and `listPaged` signatures with:

```ts
readonly list: (
  orgSlug: string,
  userId: string,
  slug: string,
  query: TicketListQuery
) => Effect.Effect<TicketListPage, NotFound | MarkdownError>
```

Import `TicketListQuery` and `TicketListPage` at the top:

```ts
import type {
  TicketListQuery,
  TicketListPage,
  // ... existing imports
} from "@projectproject/shared"
```

Remove the old `listPaged` and unpaged `list` lines.

- [ ] **Step 2: Find the existing `list` and `listPaged` implementations in `Layers/Tickets.ts`**

Grep: `grep -n "const list\|const listPaged\|listPaged =\|list =" packages/backend/src/Layers/Tickets.ts`

Read both — `listPaged` is the one we keep and extend.

- [ ] **Step 3: Rewrite `list` (formerly `listPaged`)**

Replace with:

```ts
const list = (
  orgSlug: string,
  userId: string,
  slug: string,
  query: TicketListQuery
): Effect.Effect<TicketListPage, NotFound | MarkdownError> =>
  Effect.gen(function* () {
    const all = yield* readAllTicketsForProject(orgSlug, userId, slug)
    const filtered = all.filter((t) => matchesTicketQuery(t, query, userId))
    const sorted = sortTickets(filtered, query.sort)
    const cursor = tryDecodeCursor(query.cursor)
    return paginateSorted(sorted, {
      cursor,
      limit: TICKET_LIST_LIMIT,
      sortKey: (t) => sortKeyValue(t, query.sort),
      id: (t) => t.id
    })
  })
```

The helpers `readAllTicketsForProject`, `sortTickets`, and `sortKeyValue` need to exist. `readAllTicketsForProject` is the existing function that reads the markdown files (look at the current `listPaged` to find its name; reuse). Define `sortTickets` and `sortKeyValue`:

```ts
import { NATURAL_SORT_DIR, type TicketSort } from "@projectproject/shared"
import { padNumericIdSort } from "@projectproject/shared"

const PRIORITY_ORDINAL: Record<string, number> = {
  urgent: 4,
  high: 3,
  med: 2,
  low: 1,
  none: 0
}

const sortKeyValue = (t: Ticket, sort: TicketSort): string => {
  switch (sort.key) {
    case "id":
      return padNumericIdSort(t.id) ?? t.id
    case "created":
      return t.createdAt.toISOString()
    case "updated":
      return t.updatedAt.toISOString()
    case "title":
      return t.title.toLowerCase()
    case "priority":
      return String(PRIORITY_ORDINAL[t.priority] ?? 0).padStart(2, "0")
  }
}

const sortTickets = (
  tickets: ReadonlyArray<Ticket>,
  sort: TicketSort
): ReadonlyArray<Ticket> => {
  const sign = sort.dir === "asc" ? 1 : -1
  return [...tickets].sort((a, b) => {
    const ka = sortKeyValue(a, sort)
    const kb = sortKeyValue(b, sort)
    if (ka < kb) return -1 * sign
    if (ka > kb) return 1 * sign
    return a.id.localeCompare(b.id)
  })
}
```

Import `matchesTicketQuery`, `tryDecodeCursor`, `paginateSorted`, `TICKET_LIST_LIMIT` from the appropriate locations.

- [ ] **Step 4: Update the service binding at the bottom of the file**

Find the `Layer.effect(Tickets, Effect.gen(...))` block and replace the `listPaged` exposure with `list`. Remove the old unpaged `list` from the returned object.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`

Expected: handler errors persist (we update those in D1), but the service should compile.

- [ ] **Step 6: Write a smoke test for sort**

Add to `packages/backend/src/Services/Tickets.test.ts` (or a new test file):

```ts
import { describe, expect, it } from "vitest"
// Reuse existing test harness if there is one for Tickets;
// otherwise this is an integration-y smoke that confirms list
// returns sorted+filtered output for a small synthetic project.
```

If the existing `Tickets.test.ts` uses a fixture project setup, follow that pattern. If not, defer to manual verification in the dev server during Phase G.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/Services/Tickets.ts packages/backend/src/Layers/Tickets.ts
git commit -m "backend: tickets.list takes TicketListQuery; sorts + paginates"
```

---

### Task C3: Implement `Tickets.count`

**Files:**
- Modify: `packages/backend/src/Services/Tickets.ts`
- Modify: `packages/backend/src/Layers/Tickets.ts`

- [ ] **Step 1: Add `count` to the service shape**

```ts
readonly count: (
  orgSlug: string,
  userId: string,
  slug: string,
  query: TicketCountQuery
) => Effect.Effect<TicketCounts, NotFound | MarkdownError>
```

Import `TicketCountQuery` and `TicketCounts`.

- [ ] **Step 2: Implement `count`**

In `Layers/Tickets.ts`:

```ts
const count = (
  orgSlug: string,
  userId: string,
  slug: string,
  query: TicketCountQuery
): Effect.Effect<TicketCounts, NotFound | MarkdownError> =>
  Effect.gen(function* () {
    const all = yield* readAllTicketsForProject(orgSlug, userId, slug)
    const filterWithoutStatus: TicketFilter | undefined = query.filter
      ? { ...query.filter, status: undefined }
      : undefined
    const matching = all.filter((t) =>
      matchesTicketQuery(
        t,
        { filter: filterWithoutStatus, q: query.q },
        userId
      )
    )
    const byStatus: Record<TicketStatus, number> = {
      todo: 0,
      in_progress: 0,
      done: 0
    }
    for (const t of matching) byStatus[t.status]++
    return {
      total: matching.length,
      byStatus
    }
  })
```

The "strip status from filter" step is critical — chips show counts as if status weren't filtered, so each chip can report its own bucket.

- [ ] **Step 3: Expose `count` in the layer binding**

Add `count,` to the object returned by `Layer.effect(Tickets, Effect.gen(...))`.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`

Service compiles. Handler errors remain — those land in D1.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/Services/Tickets.ts packages/backend/src/Layers/Tickets.ts
git commit -m "backend: implement tickets.count with byStatus facet"
```

---

## Phase D — Backend handlers

### Task D1: Wire HTTP handlers to `list` and `count`

**Files:**
- Modify: `packages/backend/src/handlers/tickets.ts`

- [ ] **Step 1: Update the `list` handler**

Replace the existing `list` handler (which currently calls `tickets.list(org.orgSlug, user.id, path.slug)`):

```ts
.handle("list", ({ path, urlParams }) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser
    const currentOrg = yield* CurrentOrg
    const org = yield* currentOrg.resolve(path.orgSlug, user.id)
    const tickets = yield* Tickets
    return yield* tickets.list(org.orgSlug, user.id, path.slug, urlParams)
  }).pipe(dieOnMarkdown)
)
```

- [ ] **Step 2: Add the `count` handler**

Append a `.handle("count", ...)` clause to the group builder, alongside the others:

```ts
.handle("count", ({ path, urlParams }) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser
    const currentOrg = yield* CurrentOrg
    const org = yield* currentOrg.resolve(path.orgSlug, user.id)
    const tickets = yield* Tickets
    return yield* tickets.count(org.orgSlug, user.id, path.slug, urlParams)
  }).pipe(dieOnMarkdown)
)
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`

Expected: clean across backend + shared. Frontend may still have type errors against the now-changed `tickets.list` shape; those land in Phase E.

- [ ] **Step 4: Smoke the API by hand**

Start the backend dev server. With the project in a known state, hit:

```
GET /api/orgs/<slug>/projects/<slug>/tickets?status=todo&sort=created:desc
GET /api/orgs/<slug>/projects/<slug>/tickets/count?status=todo
```

Verify shape matches `TicketListPage` and `TicketCounts`. If your dev environment uses a different base URL, adjust.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/handlers/tickets.ts
git commit -m "backend(handlers): wire tickets.list query params; add tickets.count"
```

---

## Phase E — Frontend atoms

### Task E1: New `ticketsListAtom` family with subscription-ref pagination

**Files:**
- Modify: `packages/frontend/src/atoms/tickets.ts`

We rebuild the list atom in-place. The old `ticketsListBaseAtom` becomes a `runtime.subscriptionRef`-backed atom keyed by the full query, tagged with reactivity for invalidation.

- [ ] **Step 1: Add a key helper for the new family shape**

Replace the old `ticketsListKey`:

```ts
import * as Schema from "effect/Schema"
import { TicketListQuery } from "@projectproject/shared"

const encodeQueryForKey = Schema.encodeSync(TicketListQuery)

export const ticketsListKey = (
  orgSlug: string,
  slug: string,
  query: TicketListQuery
): string => {
  const encoded = encodeQueryForKey(query)
  return `${orgSlug}/${slug}/${JSON.stringify(encoded)}`
}

interface ParsedTicketsListKey {
  readonly orgSlug: string
  readonly slug: string
  readonly query: TicketListQuery
}

const decodeQueryFromKey = Schema.decodeUnknownSync(TicketListQuery)

const parseTicketsListKey = (key: string): ParsedTicketsListKey => {
  const firstSlash = key.indexOf("/")
  const secondSlash = key.indexOf("/", firstSlash + 1)
  const orgSlug = key.slice(0, firstSlash)
  const slug = key.slice(firstSlash + 1, secondSlash)
  const raw = JSON.parse(key.slice(secondSlash + 1)) as unknown
  const query = decodeQueryFromKey(raw)
  return { orgSlug, slug, query }
}
```

Schema encoding gives a canonical form (consistent key ordering, dates serialized predictably), so two equal queries produce equal keys.

- [ ] **Step 2: Replace `ticketsListBaseAtom` and `ticketsListAtom`**

```ts
import * as SubscriptionRef from "effect/SubscriptionRef"

interface TicketsListValue {
  readonly items: ReadonlyArray<Ticket>
  readonly nextCursor: string | null
}

export const ticketsListAtom = Atom.family((key: string) => {
  const { orgSlug, slug, query } = parseTicketsListKey(key)
  return runtime
    .subscriptionRef(
      Effect.gen(function* () {
        const client = yield* ApiClient
        const page = yield* client.tickets.list({
          path: { orgSlug, slug },
          urlParams: query
        })
        return yield* SubscriptionRef.make<TicketsListValue>({
          items: page.items,
          nextCursor: page.nextCursor
        })
      })
    )
    .pipe(
      Atom.withReactivity(["tickets", orgSlug, slug]),
      Atom.setIdleTTL("30 seconds")
    )
})
```

Note that `ticketsListAtom` is directly the subscription-ref atom — we don't wrap in `Atom.optimistic` because list-level optimism is dropped (per design decision). Imports add: `SubscriptionRef`, `Reactivity` is not imported here (used in mutation atoms).

- [ ] **Step 3: Re-export type for consumers**

```ts
export type { TicketsListValue }
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`

Frontend errors will surface (callers of the old `ticketsListAtom(key)` shape). That's the rest of Phase E and Phase F's job.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/atoms/tickets.ts
git commit -m "frontend(atoms): ticketsListAtom keyed by TicketListQuery, ref-backed"
```

---

### Task E2: `ticketsCountAtom` family

**Files:**
- Modify: `packages/frontend/src/atoms/tickets.ts`

- [ ] **Step 1: Add count-key helpers**

```ts
import type { TicketCountQuery, TicketCounts } from "@projectproject/shared"
import { TicketCountQuery as TicketCountQuerySchema } from "@projectproject/shared"

const encodeCountQueryForKey = Schema.encodeSync(TicketCountQuerySchema)

export const ticketsCountKey = (
  orgSlug: string,
  slug: string,
  query: TicketCountQuery
): string => {
  return `${orgSlug}/${slug}/${JSON.stringify(encodeCountQueryForKey(query))}`
}

const decodeCountQueryFromKey = Schema.decodeUnknownSync(TicketCountQuerySchema)

const parseTicketsCountKey = (key: string) => {
  const firstSlash = key.indexOf("/")
  const secondSlash = key.indexOf("/", firstSlash + 1)
  return {
    orgSlug: key.slice(0, firstSlash),
    slug: key.slice(firstSlash + 1, secondSlash),
    query: decodeCountQueryFromKey(JSON.parse(key.slice(secondSlash + 1)))
  }
}
```

- [ ] **Step 2: Define the count atom**

```ts
export const ticketsCountAtom = Atom.family((key: string) => {
  const { orgSlug, slug, query } = parseTicketsCountKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.tickets.count({
          path: { orgSlug, slug },
          urlParams: query
        })
      })
    )
    .pipe(
      Atom.withReactivity(["tickets", orgSlug, slug]),
      Atom.setIdleTTL("30 seconds")
    )
})
```

Note: the count atom shares the same reactivity key as the list atom. A single `Reactivity.invalidate(["tickets", orgSlug, slug])` refreshes both, which is exactly what we want.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`

Same expectation: backend/shared clean, frontend has consumer errors that we fix shortly.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/atoms/tickets.ts
git commit -m "frontend(atoms): add ticketsCountAtom family"
```

---

### Task E3: `loadMoreTicketsAtom` imperative fn

**Files:**
- Modify: `packages/frontend/src/atoms/tickets.ts`

- [ ] **Step 1: Define `loadMoreTicketsAtom`**

```ts
import { Result } from "@effect-atom/atom-react"

export const loadMoreTicketsAtom = Atom.family((key: string) => {
  const { orgSlug, slug, query } = parseTicketsListKey(key)
  return runtime.fn(
    Effect.fn(function* (_: void, get) {
      const current = get(ticketsListAtom(key))
      if (!Result.isSuccess(current)) return
      if (current.value.nextCursor === null) return
      const client = yield* ApiClient
      const next = yield* client.tickets.list({
        path: { orgSlug, slug },
        urlParams: { ...query, cursor: current.value.nextCursor }
      })
      get.set(ticketsListAtom(key), {
        items: [...current.value.items, ...next.items],
        nextCursor: next.nextCursor
      })
    })
  )
})
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`

Should compile (apart from the still-outstanding consumer errors).

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/atoms/tickets.ts
git commit -m "frontend(atoms): add loadMoreTicketsAtom"
```

---

### Task E4: Wire Reactivity invalidation into mutation atoms

**Files:**
- Modify: `packages/frontend/src/atoms/tickets.ts`

The existing `quickCreateTicketAtom`, `updateTicketAtom`, and `deleteTicketAtom` call `get.refresh(ticketsListBaseAtom(listKey))`. That breaks under the new family keying — there's no single base atom to refresh. Replace with `Reactivity.invalidate(["tickets", orgSlug, slug])`.

- [ ] **Step 1: Import the Reactivity service**

At the top of `packages/frontend/src/atoms/tickets.ts`:

```ts
import * as Reactivity from "@effect/experimental/Reactivity"
```

- [ ] **Step 2: Rewrite `quickCreateTicketAtom`**

Replace the existing implementation:

```ts
export const quickCreateTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime.fn(
    Effect.fn(function* (input: QuickCreateTicketInput, _get) {
      const client = yield* ApiClient
      const ticket = yield* client.tickets.quickCreate({
        path: { orgSlug, slug },
        payload: input
      })
      yield* Reactivity.invalidate(["tickets", orgSlug, slug])
      return ticket
    })
  )
})
```

- [ ] **Step 3: Rewrite `updateTicketAtom`**

The previous implementation used `Atom.optimisticFn` against the list atom. With list-level optimism dropped, the mutation no longer has a list reducer. The detail-level optimism stays via `ticketBaseAtom`. The new shape:

```ts
export const updateTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  return runtime.fn(
    Effect.fn(function* (input: UpdateTicketInput, get) {
      const client = yield* ApiClient
      const updated = yield* client.tickets.update({
        path: { orgSlug, slug, id },
        payload: input
      })
      get.refresh(ticketBaseAtom(ticketKey(orgSlug, slug, id)))
      yield* Reactivity.invalidate(["tickets", orgSlug, slug])
      return updated
    })
  )
})
```

Detail-page optimism for status/priority/title etc. happens through component-level `Atom.optimistic` wrappers on the detail atom (`ticketBaseAtom`) — not at this layer. If there is no such wrapper today, leave that to a follow-up; the project's existing detail UX is unchanged by this PR.

- [ ] **Step 4: Rewrite `deleteTicketAtom`**

```ts
export const deleteTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  return runtime.fn(
    Effect.fn(function* (_input: void, _get) {
      const client = yield* ApiClient
      yield* client.tickets.delete({ path: { orgSlug, slug, id } })
      yield* Reactivity.invalidate(["tickets", orgSlug, slug])
    })
  )
})
```

- [ ] **Step 5: Check other mutation sites**

Grep for callers of the old `ticketsListBaseAtom` (now removed):

Run: `grep -rn "ticketsListBaseAtom" packages/frontend --include="*.ts" --include="*.tsx"`

Any remaining caller is a leftover that needs to be migrated to Reactivity invalidation. Update each to use `Reactivity.invalidate(["tickets", orgSlug, slug])` instead of the refresh call.

Common sites: `packages/frontend/src/atoms/github.ts` (branch operations may refresh ticket list), `sprints.ts`, `comments.ts` if any mention ticket-list freshness.

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`

Expected: any remaining errors should now be in consumers of `ticketsListAtom` that pass the old `(orgSlug, slug)` key shape rather than the new `(orgSlug, slug, query)` key shape. Phase F + G fix those.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/atoms/tickets.ts packages/frontend/src/atoms/github.ts
git commit -m "frontend(atoms): wire mutations to Reactivity.invalidate"
```

(Adjust the staged files based on what actually changed in Step 5.)

---

## Phase F — Frontend routes

### Task F1: Project index route — schema-driven `validateSearch`

**Files:**
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/index.tsx`

- [ ] **Step 1: Replace the hand-rolled `validateSearch` with a schema-driven one**

Replace the existing route definition with:

```ts
import { createFileRoute } from "@tanstack/react-router"
import { ticketListQueryFromSearch } from "@projectproject/shared"
import { TicketList } from "@/components/TicketList"
import { PageContainer } from "@/components/page"
import { useProject } from "./-context"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug/")({
  component: TicketsTab,
  validateSearch: ticketListQueryFromSearch
})

function TicketsTab() {
  const { orgSlug, slug } = Route.useParams()
  const query = Route.useSearch()
  const project = useProject()
  return (
    <PageContainer>
      <TicketList
        orgSlug={orgSlug}
        slug={slug}
        query={query}
        members={project.members}
        showSprintFilter
      />
    </PageContainer>
  )
}
```

The whole `TicketListUrlSync` component is **gone**. The old atom imports are gone. The component reads `query` from the route and passes it down — that's it.

- [ ] **Step 2: Remove the old `parseTags`, `STATUS_VALUES`, etc.**

Delete everything in this file that's not part of the route definition or `TicketsTab`. The hand-rolled validation lives entirely inside `ticketListQueryFromSearch` in shared now.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`

Expected: type error on `<TicketList ... query={query} />` because `TicketList`'s props haven't been updated yet. That's Phase G's job.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/index.tsx
git commit -m "frontend(route): project index uses schema-driven validateSearch"
```

---

### Task F2: Sprint detail route — `validateSearch` + `groupId` injection

**Files:**
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId.tsx`

- [ ] **Step 1: Read the current route to see how view/list/board is wired**

Run: `cat packages/frontend/src/routes/_authed/orgs/\$orgSlug/projects/\$slug/sprints/\$groupId.tsx`

Note the existing search/path params and the `view: "list" | "board"` toggle.

- [ ] **Step 2: Add `validateSearch` using `ticketListQueryFromSearch`**

The sprint detail also has its own `view` search param. Compose the two:

```ts
import { ticketListQueryFromSearch } from "@projectproject/shared"

interface SprintRouteSearch extends ReturnType<typeof ticketListQueryFromSearch> {
  view?: "list" | "board"
}

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId"
)({
  component: SprintRoute,
  validateSearch: (search: Record<string, unknown>): SprintRouteSearch => {
    const query = ticketListQueryFromSearch(search)
    const view = search.view === "board" ? "board" : "list"
    return { ...query, view }
  }
})
```

- [ ] **Step 3: Pass the query through to `SprintDetail`**

The component reads `Route.useSearch()`, injects `filter.groupId = [groupIdFromPath]`, and passes the resulting query to whatever surface needs it. Sprint detail's list view will consume it; sprint board view continues to ignore it (board's data shape is unaffected by this refactor).

```ts
function SprintRoute() {
  const { orgSlug, slug, groupId } = Route.useParams()
  const search = Route.useSearch()
  const scopedQuery: TicketListQuery = {
    ...search,
    filter: {
      ...search.filter,
      groupId: [groupId as GroupId]
    }
  }
  return (
    <SprintDetail
      orgSlug={orgSlug}
      slug={slug}
      groupId={groupId as GroupId}
      view={search.view ?? "list"}
      listQuery={scopedQuery}
    />
  )
}
```

`SprintDetail`'s `listQuery: TicketListQuery` prop is new; we'll wire it into `SprintTicketList` in Phase G. Until then expect a type error in this file.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`

Expected: errors on `SprintDetail` props (we update those next). Component-level type errors are fine at this commit.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId.tsx
git commit -m "frontend(route): sprint detail uses schema-driven validateSearch with groupId scope"
```

---

## Phase G — Frontend components

### Task G1: Rewrite `Toolbar` to read/write URL search params

**Files:**
- Modify: `packages/frontend/src/components/TicketList/Toolbar.tsx`

This is the largest component change. Toolbar no longer reads atoms — it reads the resolved query and writes new query values via `navigate({ search })`.

- [ ] **Step 1: Update the props**

Replace the existing prop interface:

```ts
export function Toolbar({
  orgSlug,
  slug,
  query,
  members,
  showSprintFilter = false
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  showSprintFilter?: boolean
}) {
```

Remove `tickets: ReadonlyArray<Ticket>` and `uiKey?: string`.

- [ ] **Step 2: Rip out the `useAtom` calls**

Replace every `const [x, setX] = useAtom(xFilterAtom(key))` with a derivation from `query` plus a `setSearch` helper that calls `navigate`:

```ts
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  type TicketListQuery,
  ticketListQueryToSearch
} from "@projectproject/shared"

const router = useRouter()
const navigate = useNavigate()

const updateQuery = (next: TicketListQuery) => {
  void navigate({
    to: router.state.location.pathname,
    search: ticketListQueryToSearch(next),
    replace: true
  })
}
```

- [ ] **Step 3: Derive UI state from `query`**

```ts
const filter = query.filter ?? {}
const status: TicketStatus | "all" =
  filter.status?.length === 1 ? filter.status[0]! : "all"
const type: TicketType | "all" =
  filter.type?.length === 1 ? filter.type[0]! : "all"
const assignee: string =
  filter.assignee?.length === 1
    ? filter.assignee[0] === null
      ? "unassigned"
      : (filter.assignee[0] as string)
    : "all"
const selectedTags = filter.tags ?? []
const sprintFilter: SprintFilter =
  filter.groupId?.length === 1 ? (filter.groupId[0] as SprintFilter) : "all"
const sortKey = query.sort.key
const queryStr = query.q ?? ""
```

The single-element narrowing reflects the locked decision that UI stays single-select; multi-element arrays from the URL fall back to "all" (graceful degradation).

- [ ] **Step 4: Write the setter helpers**

For each control, write a setter that builds the new `TicketListQuery` and calls `updateQuery`:

```ts
const setStatus = (s: TicketStatus | "all") => {
  const nextFilter: TicketFilter | undefined = {
    ...filter,
    status: s === "all" ? undefined : [s]
  }
  updateQuery({ ...query, filter: pruneFilter(nextFilter) })
}

const pruneFilter = (
  f: TicketFilter | undefined
): TicketFilter | undefined => {
  if (!f) return undefined
  const hasAny =
    f.status?.length ||
    f.type?.length ||
    f.assignee?.length ||
    f.tags?.length ||
    f.groupId?.length ||
    f.hasBranch !== undefined ||
    f.hasPr !== undefined ||
    f.updatedAfter !== undefined
  return hasAny ? f : undefined
}
```

Mirror the pattern for `setType`, `setAssignee`, `setSelectedTags`, `setSprintFilter`, `setSortKey`, `setSearchQuery`. For `setSearchQuery`, debounce the `navigate` call (the user types character by character; pushing each keystroke to the URL is acceptable with `replace: true` but the rerender cost is non-trivial):

```ts
const queryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const setSearchQuery = (q: string) => {
  if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current)
  queryDebounceRef.current = setTimeout(() => {
    updateQuery({ ...query, q: q.length > 0 ? q : undefined })
  }, 200)
}
```

The input keeps an inline `useState` for the immediate-feedback value; debounced effect writes to URL. Pattern:

```ts
const [queryInput, setQueryInput] = useState(queryStr)
useEffect(() => {
  setQueryInput(queryStr)
}, [queryStr])
```

- [ ] **Step 5: Replace the chip count logic**

Today's `counts` `useMemo` (lines 141–167 in the original Toolbar) goes away. Replace with a read from `ticketsCountAtom`:

```ts
import {
  ticketsCountAtom,
  ticketsCountKey
} from "@/atoms/tickets"

const countQuery = { filter: filter, q: query.q }
const countsResult = useAtomValue(
  ticketsCountAtom(ticketsCountKey(orgSlug, slug, countQuery))
)
const counts =
  Result.isSuccess(countsResult)
    ? {
        all: countsResult.value.total,
        todo: countsResult.value.byStatus.todo ?? 0,
        in_progress: countsResult.value.byStatus.in_progress ?? 0,
        done: countsResult.value.byStatus.done ?? 0
      }
    : { all: 0, todo: 0, in_progress: 0, done: 0 }
```

Pass `counts` into `StatusChips` exactly as before.

- [ ] **Step 6: Clear-all helper**

```ts
const clearAll = () => {
  updateQuery({ sort: query.sort })
}
```

Resets to no filter, no q, default sort preserved.

- [ ] **Step 7: Typecheck**

Run: `bun run typecheck`

Expected: clean within `Toolbar.tsx`. Cross-file errors against `TicketList` props still possible.

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/components/TicketList/Toolbar.tsx
git commit -m "frontend(toolbar): URL-driven filter + count atom for chips"
```

---

### Task G2: Strip client-side filtering from `FilteredList`; add "Load more"

**Files:**
- Modify: `packages/frontend/src/components/TicketList/FilteredList.tsx`
- Modify: `packages/frontend/src/components/TicketList/index.tsx`
- Modify: `packages/frontend/messages/en/tickets.json`

- [ ] **Step 1: Rewrite `TicketList` (the wrapper component)**

```ts
import { Result, useAtomValue } from "@effect-atom/atom-react"
import type { ReactNode } from "react"
import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import type { Member, TicketListQuery, TicketId, Group, Ticket } from "@projectproject/shared"
import { Empty } from "@/components/ui/empty"
import { FilteredList } from "./FilteredList"
import { Toolbar } from "./Toolbar"
import { m } from "@/paraglide/messages"

export function TicketList({
  orgSlug,
  slug,
  query,
  members,
  extraRowActions,
  sprintMembership,
  creator,
  showSprintFilter
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
  creator?: ReactNode
  showSprintFilter?: boolean
}) {
  const listKey = ticketsListKey(orgSlug, slug, query)
  const list = useAtomValue(ticketsListAtom(listKey))

  return (
    <div className="group/list flex flex-col gap-3">
      {creator ?? <BacklogTicketCreator orgSlug={orgSlug} slug={slug} />}

      <div className="flex flex-col gap-3 transition-opacity duration-200 ease-out group-has-[form[data-active]]/list:opacity-35">
        <Toolbar
          orgSlug={orgSlug}
          slug={slug}
          query={query}
          members={members}
          showSprintFilter={showSprintFilter}
        />

        {Result.matchWithError(list, {
          onInitial: () => (
            <div className="skeleton h-24 rounded-xl border border-border bg-background" />
          ),
          onError: (error) => (
            <Empty variant="inline" className="border border-dashed border-border">
              {m.tickets_list_load_error({ error: error._tag })}
            </Empty>
          ),
          onDefect: (defect) => (
            <Empty variant="inline" className="border border-dashed border-border">
              {m.tickets_list_defect({ defect: String(defect) })}
            </Empty>
          ),
          onSuccess: ({ value, waiting }) => (
            <FilteredList
              orgSlug={orgSlug}
              slug={slug}
              listKey={listKey}
              items={value.items}
              nextCursor={value.nextCursor}
              waiting={waiting === true}
              members={members}
              extraRowActions={extraRowActions}
              sprintMembership={sprintMembership}
              hasActiveFilter={
                (query.filter && Object.keys(query.filter).length > 0) ||
                (query.q !== undefined && query.q.length > 0)
              }
            />
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `FilteredList`**

Drop every client-side `filter` / `useMemo` / `toSorted` call. Render `items` directly. Add the "Load more" button at the bottom when `nextCursor !== null`.

```ts
import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Link } from "@tanstack/react-router"
import { type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription
} from "@/components/ui/empty"
import { loadMoreTicketsAtom } from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { Group, Member, Ticket, TicketId } from "@projectproject/shared"
import { AssigneeRowTrigger } from "./AssigneeField"
import { PriorityButton } from "./PriorityField"
import { SprintField } from "./SprintField"
import { StatusButton } from "./StatusField"
import { TypeButton } from "./TypeField"
import { TicketGitChip } from "@/components/TicketGit"

const EMPTY_BORDER = "border border-dashed border-border"

export function FilteredList({
  orgSlug,
  slug,
  listKey,
  items,
  nextCursor,
  waiting,
  members,
  extraRowActions,
  sprintMembership,
  hasActiveFilter
}: {
  orgSlug: string
  slug: string
  listKey: string
  items: ReadonlyArray<Ticket>
  nextCursor: string | null
  waiting: boolean
  members: ReadonlyArray<Member>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
  hasActiveFilter: boolean
}) {
  const loadMore = useAtomSet(loadMoreTicketsAtom(listKey))
  const loadMoreState = useAtomValue(loadMoreTicketsAtom(listKey))
  const loadingMore = loadMoreState.waiting === true

  if (items.length === 0) {
    if (hasActiveFilter) {
      return (
        <Empty variant="inline" className={cn(EMPTY_BORDER, "p-6")}>
          <EmptyDescription>{m.tickets_no_filter_matches()}</EmptyDescription>
        </Empty>
      )
    }
    return <NoTicketsYet />
  }

  const showSprintCol =
    sprintMembership !== undefined &&
    items.some((t) => sprintMembership.get(t.id) !== undefined)
  const showExtraActionsCol = extraRowActions !== undefined
  const gridCols = cn(
    "grid divide-y divide-border rounded-xl border border-border bg-background",
    showExtraActionsCol
      ? "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto]"
      : "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]",
    waiting && "animate-pulse"
  )

  return (
    <div className="flex flex-col gap-3">
      <ul className={gridCols}>
        {items.map((t) => {
          const membership = sprintMembership?.get(t.id) ?? null
          return (
            <li key={t.id} className="col-span-full grid grid-cols-subgrid">
              <Row
                orgSlug={orgSlug}
                slug={slug}
                ticket={t}
                members={members}
                showSprintCol={showSprintCol}
                showExtraActionsCol={showExtraActionsCol}
                sprintMembership={membership}
                extraRowActions={extraRowActions}
              />
            </li>
          )
        })}
      </ul>
      {nextCursor !== null && (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          onClick={() => loadMore()}
          disabled={loadingMore}
          className="self-center"
        >
          {loadingMore ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
              {m.tickets_load_more_loading()}
            </>
          ) : (
            m.tickets_load_more_button()
          )}
        </Button>
      )}
    </div>
  )
}

function NoTicketsYet() {
  return (
    <Empty>
      <EmptyDescription className="max-w-xs text-xs">
        {m.tickets_empty_hint_prefix()}{" "}
        <span className="font-mono">{m.tickets_empty_hint_folder()}</span>.
      </EmptyDescription>
    </Empty>
  )
}

function Row({
  orgSlug,
  slug,
  ticket,
  members,
  showSprintCol,
  showExtraActionsCol,
  sprintMembership,
  extraRowActions
}: {
  orgSlug: string
  slug: string
  ticket: Ticket
  members: ReadonlyArray<Member>
  showSprintCol: boolean
  showExtraActionsCol: boolean
  sprintMembership: Group | null
  extraRowActions?: (ticket: Ticket) => ReactNode
}) {
  return (
    <div className="group/list-row col-span-full grid grid-cols-subgrid">
      <Link
        to="/orgs/$orgSlug/projects/$slug/tickets/$id"
        params={{ orgSlug, slug, id: ticket.id }}
        className={cn(
          "col-span-full grid cursor-pointer grid-cols-subgrid items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/30 focus-visible:ring-1 focus-visible:ring-ring",
          "[li:first-child_&]:rounded-t-xl",
          "[li:last-child_&]:rounded-b-xl"
        )}
      >
        <StatusButton orgSlug={orgSlug} slug={slug} ticket={ticket} stopPropagation />
        <PriorityButton orgSlug={orgSlug} slug={slug} ticket={ticket} stopPropagation />
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {ticket.id}
        </span>
        <div className="flex min-w-0 items-center">
          <span className="min-w-0 truncate text-sm font-medium">{ticket.title}</span>
          <div className="ml-auto flex shrink-0 items-center gap-2 pl-3">
            <TicketGitChip orgSlug={orgSlug} slug={slug} ticketId={ticket.id} />
            {showSprintCol && (
              <SprintField
                orgSlug={orgSlug}
                slug={slug}
                ticketId={ticket.id}
                membership={sprintMembership}
              />
            )}
            <AssigneeRowTrigger
              orgSlug={orgSlug}
              slug={slug}
              ticket={ticket}
              members={members}
              className="hidden sm:inline-flex"
            />
          </div>
        </div>
        <TypeButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          className="hidden sm:inline-flex"
        />
        {showExtraActionsCol && (
          <span
            className="inline-flex shrink-0 items-center"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
          >
            {extraRowActions?.(ticket)}
          </span>
        )}
      </Link>
    </div>
  )
}
```

The "No search matches" empty state is folded into the single "no filter matches" message; we drop the `NoSearchMatches` clear-search affordance because the URL is the truth and the Toolbar's clear-all is the right place for it.

- [ ] **Step 3: Add new i18n strings**

In `packages/frontend/messages/en/tickets.json`, in alphabetical order within the `tickets_` prefix group, add:

```json
"tickets_load_more_button": "Load more",
"tickets_load_more_loading": "Loading…"
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`

The remaining errors should be in `SprintTicketList` / `SprintDetail`. Fix next.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/TicketList/FilteredList.tsx packages/frontend/src/components/TicketList/index.tsx packages/frontend/messages/en/tickets.json
git commit -m "frontend(list): server-driven render + load more"
```

---

### Task G3: Update `SprintTicketList` and `SprintDetail`

**Files:**
- Modify: `packages/frontend/src/components/sprints/SprintTicketList.tsx`
- Modify: `packages/frontend/src/components/sprints/SprintDetail.tsx`

- [ ] **Step 1: Rewrite `SprintTicketList`**

```ts
import { TicketList } from "@/components/TicketList"
import type { Member, TicketListQuery } from "@projectproject/shared"
import type { ReactNode } from "react"

export function SprintTicketList({
  orgSlug,
  slug,
  query,
  members,
  creator
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  creator: ReactNode
}) {
  return (
    <TicketList
      orgSlug={orgSlug}
      slug={slug}
      query={query}
      members={members}
      creator={creator}
    />
  )
}
```

The component is now a thin pass-through, but kept as a distinct file so the sprint detail page can be enriched later (e.g. sprint-specific empty states).

- [ ] **Step 2: Update `SprintDetail` to accept and forward the query**

Add the prop:

```ts
export function SprintDetail({
  orgSlug,
  slug,
  groupId,
  view,
  listQuery
}: {
  orgSlug: string
  slug: string
  groupId: GroupId
  view: "list" | "board"
  listQuery: TicketListQuery
}) {
```

Find the `SprintTicketList` call site within `SprintDetail`:

```ts
<SprintTicketList
  orgSlug={orgSlug}
  slug={slug}
  query={listQuery}
  members={project.members}
  creator={creator}
/>
```

Delete the `filterIds` and `ticketIds` construction higher up in the function — they're no longer needed.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`

Expected: clean across the frontend. If anything still references old props on `<TicketList>`, fix in place.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/sprints/SprintTicketList.tsx packages/frontend/src/components/sprints/SprintDetail.tsx
git commit -m "frontend(sprints): SprintTicketList consumes TicketListQuery"
```

---

## Phase H — Cleanup

### Task H1: Delete dead code

**Files:**
- Delete: `packages/frontend/src/atoms/ticketListUi.ts`
- Delete: any remaining unused helpers in `packages/frontend/src/components/TicketList/sort.ts` (the runtime `SORTS` constant — if still imported anywhere, leave it; otherwise delete).
- Verify: no remaining imports of `ticketListUi`, `TicketListUrlSync`, or `SORTS` from the runtime sort module.

- [ ] **Step 1: Confirm no remaining imports of the dead modules**

Run: `grep -rn "ticketListUi\|TicketListUrlSync" packages/frontend --include="*.ts" --include="*.tsx"`

Expected: zero matches.

- [ ] **Step 2: Delete the file**

```bash
git rm packages/frontend/src/atoms/ticketListUi.ts
```

- [ ] **Step 3: Decide on `components/TicketList/sort.ts`**

Run: `grep -rn "from.*TicketList/sort" packages/frontend --include="*.ts" --include="*.tsx"`

If anything imports the `SORTS` constant for label rendering, keep the file but reduce it to just the label map (the comparators are obsolete since sort happens server-side). If nothing imports it, delete the file.

Likely outcome: the Toolbar imports `SORTS[k].label()` for the dropdown menu. Keep a labels-only version:

```ts
import { m } from "@/paraglide/messages"
import type { SortKey } from "@projectproject/shared"

export const SORT_LABELS: Record<SortKey, () => string> = {
  id: () => m.tickets_sort_id(),
  updated: () => m.tickets_sort_updated(),
  created: () => m.tickets_sort_created(),
  title: () => m.tickets_sort_title(),
  priority: () => m.tickets_sort_priority()
}
```

Update Toolbar's `SortMenu` import accordingly.

- [ ] **Step 4: Final typecheck + lint**

Run:
```
bun run typecheck
bun run lint
```

Both clean.

- [ ] **Step 5: Manual verification in the dev server**

Per the project's "no Playwright" rule, walk through these flows manually:

1. Project index page loads with default sort (created desc). Tickets appear in newest-first order.
2. Click each status chip → URL updates with `?status=…`. List filters. Chip counts update.
3. Type in the search box → URL updates after ~200ms debounce. List filters.
4. Open the filters dropdown, pick a type → URL updates. Combination of status + type works.
5. Pick "Assigned to me" → URL has `assignee=mine`. Bookmark this URL. Copy it. Paste in an incognito window logged in as a different user → that user's tickets show, not yours.
6. Bookmark a URL with `?assignee=unassigned` → returning to it shows unassigned tickets.
7. Sort by Title → list re-sorts. URL has `sort=title:asc`.
8. Scroll to bottom of a long list → "Load more" button appears. Click → next page appends. Cursor advances. Click again until exhausted; button disappears.
9. Create a ticket via the inline creator → it appears at the top (created desc default), count chips tick up. Net effect of `Reactivity.invalidate` should be a brief pulse on the list, then the new row.
10. Update a ticket's status via the row chip → list view's count chips update; if the ticket no longer matches the active filter, it disappears from view.
11. Navigate to a sprint detail page → tickets show, scoped to that sprint. Apply a status filter on top → URL gains `?status=todo`. Bookmark works.
12. Press the "X" clear-all button → URL gains nothing, all filters drop, default sort retained.

- [ ] **Step 6: Commit cleanup**

```bash
git add -A
git commit -m "frontend: delete ticketListUi.ts; trim sort.ts to label map"
```

---

## Self-review

**1. Spec coverage**

- URL as source of truth → Toolbar reads from `Route.useSearch()`, writes via `navigate` (G1). `TicketListUrlSync` removed (H1). ✓
- Per-resource shared filter schema → `packages/shared/src/filters/Ticket.ts` (A2). ✓
- Backend filters end-to-end → backend `list` + `count` consume `TicketListQuery` / `TicketCountQuery` (C2, C3, D1). ✓
- Cursor pagination, opaque, sort-coupled → existing `Pagination.ts` helpers; sort embedded in cursor via `sortKeyValue` (C2). Note: the existing cursor does not yet encode sort spec for validation; the engineer should add a sort fingerprint to the cursor payload during C2 if cursor stability across sort changes is needed. The current `CursorPayload` is `{id, sort: string}` — for v1 we accept that cursor invalidation isn't sort-checked; frontend resets cursor on sort change.
- Status facet via separate count endpoint → C3, T-50 closed. ✓
- Reactivity-based invalidation → mutation atoms in E4. ✓
- Filter-keyed family with TTL → E1 (list), E2 (count). ✓
- "mine" / "unassigned" sentinels → URL transform in A3, backend resolution in C1. ✓
- Single-select UI preserved → Toolbar uses single-element arrays (G1). ✓
- T-48 default sort → `DEFAULT_TICKET_SORT` constant, `Schema.optionalWith({ default })` (A2). ✓
- Two surfaces (project index + sprint detail) → F1, F2, G3. ✓
- MCP migration → A1, A2 (path updates). ✓
- Sprint board out of scope → noted, no tasks. ✓

**2. Placeholder scan**

Pass. No TBDs, no "implement appropriate" hand-waves, no "similar to X" references. Every code step shows real code. A few "find via grep" steps are present where the exact line numbers depend on current state of the file — those are concrete instructions, not placeholders.

**3. Type consistency**

- `TicketListQuery`, `TicketListPage`, `TicketCountQuery`, `TicketCounts` — referenced consistently across A2/B1/C2/C3/E1/E2.
- `ticketsListAtom` / `ticketsCountAtom` / `loadMoreTicketsAtom` — names used consistently in E1–E4 and G1–G2.
- `ticketsListKey` / `ticketsCountKey` — same key naming pattern.
- `matchesTicketQuery` — defined in C1, used in C2 and C3.

**Gap noted during review:** The original Toolbar reads `tickets.length === 0` to suppress itself ("if list is empty, no toolbar"). The new Toolbar runs unconditionally — the count atom can be empty initially. That's fine UX (the toolbar with all-zero counts is more honest than an absent toolbar), but if you want the old behavior, gate Toolbar rendering on `counts.all > 0`. Decision deferred to manual verification at H1 step 5.

---

## Out of scope / future work

These were explicitly discussed during planning and deferred:

- **Multi-select UI on type/assignee** — schema is multi-capable; UI stays single-select. A dedicated design PR can introduce checkbox-in-dropdown affordances.
- **Sort direction toggle** — schema is `{ key, dir }`; UI exposes key only, direction is implicit per-key via `NATURAL_SORT_DIR`. Adding a direction toggle is additive on top of this PR.
- **Pure `matchesTicketQuery` on the frontend for optimistic reconciliation** — list-level optimism is dropped. If we re-add it later, the shared function gets relocated from `backend/Services/TicketFilters.ts` to `packages/shared/src/filters/`.
- **Cursor sort-fingerprint validation** — current cursor only encodes `{id, sort: string}`; if sort spec changes mid-pagination the cursor still applies. For v1 we rely on the frontend resetting cursor on sort change. Production-grade would embed `{key, dir}` in the cursor and reject mismatches.
- **Sprint board filtering** — uses a different data shape (status columns); separate refactor if/when it's needed.
- **Other filterable resources (members, projects, sprints list)** — pattern is established; consuming it for a new resource is a copy/adapt of `filters/Ticket.ts`.
- **`count` endpoints for other resources (T-50 generalization)** — pattern established; adopted as needed.
- **Server-side facets for dimensions beyond status** — `tickets.count` returns `byStatus` only; adding `byType` / `byAssignee` is an additive schema change with a parallel SQL aggregate.
- **Saved views / per-user defaults** — the URL is the canonical state; saved views would be a layer on top (likely a `SavedView` resource in shared, with its own ticket).

---

## Implementation log — Phase A (completed 2026-05-17)

Branch `feat/url-driven-filtering`. Three commits landed cleanly; typecheck green workspace-wide after each commit.

### A1 — `d31262b` `shared: promote pagination + cursor helpers out of mcp/`

- `git mv` of `packages/shared/src/mcp/{Pagination,cursor}{,.test}.ts` → `packages/shared/src/{Pagination,cursor}{,.test}.ts`.
- `packages/shared/src/mcp/index.ts` rewired (`import { Page, Pagination } from "../Pagination"`); removed the two `export *` lines for Pagination/cursor — the package root now owns those exports.
- `packages/shared/src/index.ts` gained `export * from "./Pagination"` and `export * from "./cursor"`.
- All 4 + 9 pre-existing tests pass at the new location. No content changes inside the moved files; pre-existing comments rode along with the renames, no new ones authored.

### A2 — `cdc103e` `shared: add TicketListQuery/Page/Counts; relocate filter schemas`

- New `packages/shared/src/filters/Ticket.ts` (~83 lines, pure declarations): `SortKey`, `SortDir`, `TicketSort`, `DEFAULT_TICKET_SORT`, `NATURAL_SORT_DIR`, `AssigneeFilter`, `TicketFilter`, `TICKET_LIST_LIMIT` (= 50), `TicketListQuery`, `TicketListPage`, `TicketCounts`, `TicketCountQuery`.
- `AssigneeFilter` widened from the prior `NullOr(String)` to `Schema.Union(Schema.Literal("mine"), Schema.Null, Schema.String)` — all eight pre-existing `TicketFilter` fields preserved (status, type, assignee, tags, hasBranch, hasPr, updatedAfter, groupId). One pre-existing one-line comment in the old MCP file (`// null encodes "unassigned"; …`) intentionally dropped, per project no-comments rule.
- `packages/shared/src/filters/Group.ts` ported verbatim (`kind`, `active`).
- `packages/shared/src/filters/index.ts` is the local barrel; `packages/shared/src/index.ts` re-exports it via `export * from "./filters"`.
- `packages/shared/src/mcp/index.ts` rewired to `import { TicketFilter, GroupFilter } from "../filters"`; the two redundant `export *` lines for the filter modules removed (they now flow through the package root).
- Old `packages/shared/src/mcp/filters/` directory removed; `grep "mcp/filters"` returns zero across `packages/**/*.{ts,tsx}`.

### A3 — `0b22e36` `shared: URL <-> TicketListQuery transform`

- New `packages/shared/src/filters/url.ts` (~170 lines) and `url.test.ts` (~93 lines, 7 deterministic test cases including round-trip). All 7 tests pass.
- Public API exactly matches the plan: `ticketListQueryFromSearch(search): TicketListQuery` and `ticketListQueryToSearch(query): Record<string, string | ReadonlyArray<string>>`. Sentinels (`"mine"`, `"unassigned"`) handled symmetrically; default sort omitted on encode; unknown/malformed values gracefully degraded.
- Two compile-time deviations from the verbatim plan code (the plan's snippet didn't compile against schema-derived readonly types):
  1. Introduced internal `MutableTicketFilter` / `MutableTicketListQuery` mapped types — used only inside the decoder to incrementally assign fields, then cast back to the readonly `TicketListQuery` for the return. The public signature is unchanged.
  2. Introduced a structural `TicketListQueryInput` type for `ticketListQueryToSearch` that relaxes `sort` to optional (so URL-update call sites don't have to re-pass sort when they're only changing filter or `q`). Fields are still concretely typed — no `any`.
- Commit message uses ASCII `<->` rather than the unicode `↔` from the plan (PowerShell heredoc encoding fallback documented in the task).

### Test-runner incantation for `@projectproject/shared`

A3's implementer surfaced that the package has no `test` script and the prior workaround (`bun --filter @projectproject/backend test --include "../shared/..."`) is rejected by vitest 3.2.4. The reliable command from inside the repo:

```
cd packages/backend
bun --env-file=../../.env vitest run --root ../shared
```

Optionally narrow with a positional path argument (e.g. `src/filters/url.test.ts`). Phase B and later subagents should use this instead of inventing new invocations.

### Carry-over for Phase F1

The code-quality reviewer flagged that `decodeStringArray` results for `tags` and `groupId` are cast straight to the branded `TagName[]` / `GroupId[]` without running the schema's pattern validation. This is faithful to the plan's verbatim code but means malformed values from a URL would type as branded strings even when they shouldn't. The validation boundary is currently the API schema downstream (B1/D1).

When wiring Phase F1's `validateSearch`, decide explicitly:
- Either accept the API as the validation boundary (status quo, document it), or
- Tighten `decodeStringArray` to run `Schema.decodeUnknownEither(TagName)` / `GroupId` per element and drop invalid ones.

No action needed in Phase B; surfaced here so it doesn't get lost.

### Phase A self-check

- Workspace typecheck clean after each commit (`bun run typecheck`).
- All shared tests green (52 total after A3).
- `grep "mcp/Pagination|mcp/cursor|mcp/filters" packages --include="*.ts" --include="*.tsx"` → zero matches.
- `routeTree.gen.ts` was modified on-disk at session start (LF/CRLF noise, unrelated to Phase A) and remains uncommitted — left for a later phase to consolidate.

Three commits ahead of `main`; ready to start Phase B in a fresh context.

---

## Implementation log — Phase B (completed 2026-05-17)

Phase B is a single task (B1). Landed as two commits because the plan's verbatim snippet `setUrlParams(TicketListQuery)` does not compile — Effect HttpApi requires a flat URL params schema. The first commit established the new contract with a workable-but-verbose flat-schema pair; the second tightened those schemas after code review. Five commits ahead of `main` total.

### B1 — `835cc08` `shared(api): tickets.list takes TicketListQuery; add tickets.count`

- `packages/shared/src/api.ts`: `tickets.list` gained `setUrlParams(TicketListParams)` and `addSuccess(TicketListPage)` in place of `addSuccess(Schema.Array(Ticket))`. New `tickets.count` endpoint added immediately after `list` (`GET /orgs/:orgSlug/projects/:slug/tickets/count`, `setPath(ProjectPath)`, `setUrlParams(TicketCountParams)`, `addSuccess(TicketCounts)`, `addError(Unauthorized).addError(NotFound)`). Both reuse the existing `ProjectPath` (branded `Slug`) rather than the plan's illustrative inline `Schema.String` struct — preserves the path-level typing convention.
- `Unauthorized` kept on both endpoints to match the sibling-endpoint convention in `TicketsGroup` (the `.middleware(Authentication)` wrapper makes it implicit, but every sibling explicitly declares it).
- Imports `{ TicketCounts, TicketListPage }` only — `TicketListQuery` / `TicketCountQuery` were never imported because they can't satisfy `setUrlParams`'s `_I extends Record<string, string | ReadonlyArray<string> | undefined>` constraint.

### B1 (revision) — `6c57bd6` `shared(api): tighten tickets.list/count param schemas`

Code-quality reviewer's revision pass. Net `-21` lines.

- Verified that `@effect/platform`'s `normalizeUrlParams` (in `HttpApiBuilder.js`, `isSingleStringType` check) wraps single-occurrence URL params into a one-element array before decoding when the field schema is not a single-string-shaped one. So `Schema.Array(Schema.String)` accepts both `?status=todo` and `?status=todo&status=in_progress` cleanly — the original `Union(String, Array(String))` workaround was unnecessary.
- Extracted `MultiStringParam = Schema.optional(Schema.Array(Schema.String))` and applied to all five multi-value fields (`status`, `type`, `assignee`, `tags`, `groupId`).
- Extracted `BaseTicketFilterParams` (8 shared fields) and derived `TicketListParams = Schema.extend(BaseTicketFilterParams, Schema.Struct({ sort, cursor }))` and `TicketCountParams = BaseTicketFilterParams`. Zero duplication.
- Fixed import ordering: `./filters/Ticket` was wedged inside the `./schemas/*` block; moved to after the `./schemas/Group` block, before `./errors`.

### Wire shape captured here (so Phase D / Phase E don't have to re-derive it)

URL params shape that `tickets.list` and `tickets.count` accept on the wire (after `normalizeUrlParams`'s array-wrap):

```ts
{
  status?:    ReadonlyArray<string>
  type?:      ReadonlyArray<string>
  assignee?:  ReadonlyArray<string>   // "mine" | "unassigned" | userId
  tags?:      ReadonlyArray<string>
  groupId?:   ReadonlyArray<string>
  hasBranch?: string                  // "true" | "false"
  hasPr?:     string                  // "true" | "false"
  q?:         string
  sort?:      string                  // "<key>:<dir>", list only
  cursor?:    string                  // list only
}
```

This is exactly what `ticketListQueryToSearch` in `packages/shared/src/filters/url.ts` emits (modulo `normalizeUrlParams` wrapping single occurrences). Phase D handlers decode it into the nested `TicketListQuery` envelope by calling `ticketListQueryFromSearch` on `request.urlParams`. Don't try to wire `setUrlParams(TicketListQuery)` directly — it cannot satisfy the framework's `_I` constraint.

### Known coupling (carry-over for whoever expands filters)

`TicketListParams` / `TicketCountParams` in `api.ts` enumerate the same flat-URL key set as `ticketListQueryToSearch` in `filters/url.ts`. There is no compile-time link between them. Adding a new filter field (e.g. `milestone`) requires updating three places in lockstep:
1. `TicketFilter` in `packages/shared/src/filters/Ticket.ts`
2. Encode/decode in `packages/shared/src/filters/url.ts`
3. `BaseTicketFilterParams` (and possibly `MultiStringParam` usage) in `packages/shared/src/api.ts`

The `MultiStringParam` alias keeps the per-field cost low (one line per field), but the cross-file pairing remains. Considered moving the params schemas into `filters/Ticket.ts` for centralization; rejected because the flat shape is a wire-format concession to `setUrlParams`'s constraint, not a domain concept, and co-locating it with the rich `TicketListQuery` would blur that file's responsibility. Status quo accepted; documenting the coupling here.

Related known gap: `TicketFilter` includes `updatedAfter: Schema.optional(Schema.Date)`, but `ticketListQueryFromSearch` / `ticketListQueryToSearch` (Phase A3) and the params schemas (Phase B) do not encode/decode it. URL-driven `updatedAfter` filtering is currently unreachable. Not B's problem; surfaced for the eventual feature-completion pass.

### Typecheck baseline after Phase B

`bun run typecheck` from repo root:

| Package | Exit | Errors | Notes |
|---|---|---|---|
| `@projectproject/shared` | 0 | 0 | Clean. |
| `@projectproject/backend` | 2 | 2 errors, both `src/handlers/tickets.ts` | (a) `count` endpoint unhandled; (b) `list` returns `Ticket[]` not `TicketListPage`. Both Phase D's job. |
| `@projectproject/frontend` | 2 | 25 errors across `atoms/tickets.ts`, `mentions/ticketProvider.tsx`, `components/sprints/*`, `components/TagEditor.tsx`, `components/TicketList/*`, `routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx` | All callsites treating the list result as `Ticket[]` instead of `TicketListPage`. Phase D adds the `urlParams` arg; Phase E rewires consumers to `result.items`. |

Phase D should expect the backend error count to drop to 0 and the frontend error count to shrink further (the `urlParams` argument-missing errors disappear; the `result.items` errors are Phase E).

### Carry-over for Phase D

- The handler reads flat URL params off `request.urlParams` (typed as the `TicketListParams` / `TicketCountParams` Struct.Type). Call `ticketListQueryFromSearch(request.urlParams as Record<string, unknown>)` to get the nested `TicketListQuery`. The cast is needed because `urlParams` is typed as the schema's decoded `Type` (a specific struct), but `ticketListQueryFromSearch` accepts the general `Record<string, unknown>` shape.
- Handler for `count` substitutes `"mine"` → `CurrentUser.id` in the assignee list before computing counts. Same substitution applies to `list`. Per the plan, omit the `status` dimension from the count query when faceting status (so chips don't read circular counts) — but the wire schema for `count` doesn't carry a "omit dimension" flag; the chip caller just doesn't pass `status` in the URL when fetching counts for status faceting.

### Phase B self-check

- Workspace typecheck delta matches plan expectations: `packages/shared` clean; backend/frontend errors scoped entirely to consumers of the changed endpoints.
- Two commits ahead of `0b22e36` (the Phase A tip), five ahead of `main`.
- No comments added to `api.ts`. Header banner preserved.
- Only `packages/shared/src/api.ts` modified. `routeTree.gen.ts` LF/CRLF noise from Phase A still uncommitted.
- Code-quality review approved on the revision (`6c57bd6`); spec review approved on the original (`835cc08`) and the revision did not change endpoint declarations.

---

## Implementation log — Phase C (completed 2026-05-17)

Phase C is service-layer only — three tasks (C1, C2, C3) that left both backend handlers and the frontend untouched. Six commits ahead of the Phase B tip (`6c57bd6`); eleven ahead of `main`. Two architectural deviations from the locked spec were made on judgment to avoid silent failures, both documented inline below and called out in the Phase D carry-over.

### C1 — `4101b53` `backend: extend ticket matcher with q + 'mine' resolution`

- New `matchesTicketQuery(ticket, query: Pick<TicketListQuery, "filter" | "q">, viewerId): boolean` exported from `packages/backend/src/Services/TicketFilters.ts`. Delegates to the existing `matchesTicketFilter` after substituting `"mine"` → `viewerId` in `filter.assignee`; then case-insensitive substring search on `q`. `matchesTicketFilter` body byte-identical to before — only the import line changed.
- Test file already existed; appended five `matchesTicketQuery` cases inside the same `TicketFilters.test.ts` (`describe` block), reusing the existing `decodeTicketId` / `baseTicket` / `isoDate` helpers. Tests use `@effect/vitest`, not vanilla `vitest`.
- The `Pick<TicketListQuery, "filter" | "q">` signature was the spec-locked shape, and it's exactly `TicketCountQuery`'s shape too — C3 reuses the same helper without an adapter.
- `groupId` filtering stays out of the matcher layer. The service layer (C2/C3) keeps applying `resolveGroupMembers` adjacent to `matchesTicketQuery`. This preserves the existing architecture: matcher knows about ticket fields; groups are an external relationship pulled from another service.

### C1 (hardening) — `1bedc75` `backend: harden q match — trim, check title/id independently`

Code-quality reviewer's pass. The plan's verbatim snippet built a joined haystack `title + " " + id` for substring matching. Two real failure modes flagged and fixed:

1. `q = " "` (or any whitespace-only string) passed the `length > 0` guard and matched every ticket. Now `query.q.trim()` precedes the length check, so whitespace-only queries no-op.
2. A `q` straddling the synthetic space (e.g. `"world T"` against title `"Hello world"` + id `"T-1"`) used to false-positive. Replaced with independent `.includes` calls against `title` and `id` — no synthetic delimiter, no straddle.

Added three test cases for the new behavior: combined `q + filter` AND contract, delimiter negative, whitespace-only no-op. Test file `TicketFilters.test.ts` lands at 21 cases, all green.

### C2 — `097e0e0` `backend: tickets.list takes TicketListQuery; sorts + paginates`

Main consolidation. Removed both the unpaged `Tickets.list(orgSlug, ownerId, slug)` and `Tickets.listPaged(orgSlug, userId, slug, filter, cursor, limit)`. Single replacement `list(orgSlug, userId, slug, query: TicketListQuery) => Effect<TicketListPage, NotFound | MarkdownError>`.

- Imports cleaned in both `Services/Tickets.ts` (interface) and `Layers/Tickets.ts` (impl). Dropped `CursorPayload`, `TicketFilter`, `matchesTicketFilter`. Added `TicketListPage`, `TicketListQuery`, `TicketSort`, `TICKET_LIST_LIMIT`, `tryDecodeCursor`, `matchesTicketQuery`.
- New module-level helpers `PRIORITY_ORDINAL`, `sortKeyValue`, `sortTickets` in `Layers/Tickets.ts` — exactly the spec's helpers. `sortKeyValue` returns a comparable string for each of the 5 sort keys; `sortTickets` applies the asc/desc sign and tie-breaks on `a.id.localeCompare(b.id)`.
- `resolveGroupMembers` + `groupMemberSet.has(t.id)` filter preserved adjacent to `matchesTicketQuery`. The matcher does not handle `groupId`; the service does.
- Smoke tests in `Tickets.test.ts`: default sort is `created desc`, sort by title asc, cursor round-trip across 55 tickets (TICKET_LIST_LIMIT + 5), `q` + `"mine"` substitution.
- **Out-of-spec side effect:** `packages/backend/src/mcp/handlers.ts` had to be migrated from the deleted `listPaged` to the new `list(query)` because dropping `listPaged` would otherwise break the workspace. Mechanical migration; flagged as a regression in step.

### C2 (MCP limit thread-through) — `ce19c3e` `backend: thread MCP-requested limit through tickets.list`

The mechanical MCP migration in `097e0e0` introduced a silent failure: the MCP `list_tickets` input schema accepts `Pagination.limit` (1-200), but the new `list(orgSlug, userId, slug, query)` couldn't accept a runtime limit, so `input.limit` was silently discarded and the MCP surface was capped at `TICKET_LIST_LIMIT = 50` regardless of caller request.

**Deviation from the locked spec:** extended the `Tickets.list` service signature with an optional 5th parameter `limit?: number`. When omitted (HTTP path), the service uses `TICKET_LIST_LIMIT`. When passed (MCP path), the service uses the requested limit. No shared schema changes, no HTTP API change — the HTTP handler is `list(org, user, slug, query)` and continues to get the default 50 per page.

This deviation was made because (a) silent failures violate project rules, (b) the alternative (removing `limit` from MCP's input schema) would break MCP callers, and (c) the locked spec didn't anticipate the MCP call site. The HTTP wire contract is unaffected.

Tests: added a service-level test asserting `list(..., limit: 3)` truncates to 3 items with non-null cursor. Hardened the MCP handler test (`mcp/handlers.test.ts`) to capture the limit forwarded into the service and synthesize 25 fake tickets so the bound is genuinely exercised; previously it had passed only because the fixture had ≤10 tickets and the limit was silently ignored.

### C2 (cursor direction fix) — `b377aad` `shared+backend: paginateSorted honors sort direction`

Code-quality reviewer caught a high-severity bug: `paginateSorted` in `packages/shared/src/cursor.ts` was written when the only caller (`listPaged`) always sorted ascending by id. Its cursor-walking uses `s > sort` / `id > id` — ascending semantics. With C2's variable-direction sorting (and `DEFAULT_TICKET_SORT = { key: "created", dir: "desc" }`), page 2 of any desc sort would come back empty: `findIndex` returns `-1` because every subsequent item has a sortKey ≤ cursor.sort.

The default code path (`created desc`) was therefore broken for any project with more than 50 tickets. The existing cursor test only exercised `id asc` so it never tripped this.

**Deviation from the locked spec:** added an optional `dir?: "asc" | "desc"` field to `PaginateSortedOptions` in `packages/shared/src/cursor.ts`. Defaults to `"asc"` so the four other callers (`Projects`, `Tags`, `Groups`, `BetterAuth` — all id-asc by inspection) continue to work without changes. When `"desc"`, the comparator flips. The id tie-break stays `>` because within equal sortKeys we always advance forward through ids.

Justified because (a) it's fixing a genuine bug introduced by C2's sort-direction expansion, (b) it's a backward-compatible addition, (c) `paginateSorted`'s contract was always supposed to handle the array's sort direction — the original implementation just assumed asc because the only caller was asc.

Other cleanups in the same commit:
- Tightened `PRIORITY_ORDINAL` to `Record<TicketPriority, number>`. The implementer had originally populated it with `urgent: 4, … none: 0` (anticipating a future widening of the enum), but `TicketPriority = Schema.Literal("low", "med", "high")` — only three values. Dead keys removed; the `?? 0` fallback in `sortKeyValue` dropped now that the table is exhaustively keyed.
- Added a `cursor.test.ts` case `"walks descending arrays when dir is 'desc'"`.
- Added a `Tickets.test.ts` case `"list paginates by cursor with default created desc sort"` — 55 tickets at hourly `createdAt` intervals, asserts both pages are monotone-desc within themselves, no overlap between pages, page 2 has 5 items, terminal cursor. Would have caught the bug; now locks it down.

### C3 — `dc15764` `backend: implement tickets.count with byStatus facet`

- New `count(orgSlug, userId, slug, query: TicketCountQuery) => Effect<TicketCounts, NotFound | MarkdownError>` in `Services/Tickets.ts` (interface) and `Layers/Tickets.ts` (impl), exposed in the layer binding next to `list`.
- Strict reuse of the helpers `list` uses: `ensureAccess`, `resolveGroupMembers`, `readTicketForCollection`, `readableTickets`, `documentToTicket`, `matchesTicketQuery`. No duplicated reading or filtering pipeline.
- **The load-bearing strip:** before passing `query` to the matcher, `count` constructs `filterWithoutStatus = { ...query.filter, status: undefined }` and assembles `queryForCount: Pick<TicketListQuery, "filter" | "q">` from that and `query.q`. This guarantees the byStatus facet counts every status bucket against the same denominator regardless of which status the UI is currently filtering by.
- `byStatus` is initialized `{ todo: 0, in_progress: 0, done: 0 }` BEFORE the increment loop so every key is always present in the response — the frontend's chip layout can read all three keys unconditionally.
- Five smoke tests: empty project (all zeros), mixed-status project no filter, status-strip equality (filter `{ status: ["done"] }` returns the same total/byStatus as no filter — fails immediately if the strip breaks), non-status filter still applies (type filter), `"mine"` substitution. Tickets.test.ts lands at 14 cases, all green.
- `count` is NOT exposed in `mcp/handlers.ts` — the plan doesn't require it and there's no MCP caller yet. Phase D wires the HTTP handler.

### Typecheck baseline after Phase C

`bun run typecheck` from repo root:

| Package | Exit | Errors | Notes |
|---|---|---|---|
| `@projectproject/shared` | 0 | 0 | Clean. |
| `@projectproject/backend` | 2 | 2 errors, both `src/handlers/tickets.ts` | Same two as Phase B: (a) `count` endpoint unhandled; (b) `list` arity mismatch. Phase D's job. |
| `@projectproject/frontend` | 2 | 25 errors | Identical to Phase B's set — same callsites treating list as `Ticket[]`. Phase D adds `urlParams`; Phase E rewires consumers. |

Test status from `packages/backend`:
- `TicketFilters.test.ts` 21/21 green.
- `Tickets.test.ts` 14/14 green.
- `mcp/handlers.test.ts` 18 pass / 4 skip (pre-existing placeholders).
- `cursor.test.ts` (shared) 10/10 green.
- **Pre-existing failure carry-over:** `Groups.test.ts` has 6 failing tests (`completed_before_start` validation). These fail on `main` too — verified by checking out main and re-running. Unrelated to Phase C; not addressed here.

### Carry-over for Phase D

Most of the Phase D guidance is already captured at the end of the Phase B log (decoding flat URL params via `ticketListQueryFromSearch`, `"mine"` substitution at the handler, status-strip semantics). One C-era addition:

- The service-level `list` now accepts an optional 5th `limit?: number` parameter. The HTTP handler in D1 should call `tickets.list(org.orgSlug, user.id, path.slug, query)` (omitting `limit` — HTTP page size is hardcoded at `TICKET_LIST_LIMIT`). The MCP handler is already wired to pass through; no change there.
- The service-level `count` signature is `(orgSlug, userId, slug, query: TicketCountQuery)`. The handler builds `query` by calling the URL→query helper on `request.urlParams`. The matcher already substitutes `"mine"`; the handler just forwards `user.id`.
- `paginateSorted` in `packages/shared/src/cursor.ts` now accepts an optional `dir` field on its options. Backend's `list` passes `dir: query.sort.dir`. No other workspace caller passes `dir` — they all default to `"asc"` (correct, since they all sort id-asc).

### Open carry-overs still on the books

- **F1 territory (decoder branding):** `decodeStringArray` in `packages/shared/src/filters/url.ts` casts URL `tags` / `groupId` to branded types without running per-element schema validation. Document or tighten when wiring `validateSearch`. Inherited from Phase A.
- **D / E territory (wire-shape coupling):** `BaseTicketFilterParams` in `api.ts`, `ticketListQueryToSearch` / `ticketListQueryFromSearch` in `filters/url.ts`, and `TicketFilter` in `filters/Ticket.ts` are coupled by manual enumeration. Adding a new filter field requires updates in three places. Inherited from Phase B.
- **`updatedAfter`:** in the schema but not in URL transforms or params struct. URL-driven filtering by `updatedAfter` is currently unreachable. Inherited from Phase B.
- **Cursor sort-fingerprint validation:** v1 deliberately doesn't encode `{ key, dir }` into the cursor payload. Frontend resets cursor on sort change. Documented in plan self-review; out of scope for Phase C/D.

### Phase C self-check

- Workspace typecheck delta unchanged from Phase B baseline: shared 0, backend 2 (`handlers/tickets.ts`), frontend 25 (same consumers as before).
- Six commits ahead of `6c57bd6` (Phase B tip); eleven ahead of `main`.
- No comments added in any C commit.
- Files modified strictly within scope: `packages/backend/src/Services/TicketFilters.{ts,test.ts}`, `packages/backend/src/Services/Tickets.{ts,test.ts}`, `packages/backend/src/Layers/Tickets.ts`, plus the deviations: `packages/backend/src/mcp/handlers.{ts,test.ts}` (mechanical migration + limit thread-through) and `packages/shared/src/cursor.{ts,test.ts}` (paginateSorted direction). No frontend, no api.ts, no other shared schemas.
- `routeTree.gen.ts` LF/CRLF noise from earlier phases still uncommitted.
- Two-stage review (spec compliance + code quality) ran on each task; both deviations (`Tickets.list` 5th param, `paginateSorted` `dir` option) surfaced via reviewer feedback and were fixed with new commits rather than amends. No commit was amended; one fresh commit per fix.

Ready to start Phase D in a fresh context.

---

## Implementation log — Phase D (completed 2026-05-18)

Phase D is a single task (D1). Landed as a single commit (`475d25a`); thirteen ahead of `main`. One justified deviation — a one-line barrel re-export in `packages/shared/src/filters/index.ts` to close a gap left by Phase A. Backend handlers are now fully wired; backend typecheck drops from 2 errors → 0. Frontend remains at 25 errors (Phase E's set, unchanged).

### D1 — `475d25a` `backend(handlers): wire tickets.list query params; add tickets.count`

- `packages/backend/src/handlers/tickets.ts`: `list` handler rewritten from a 3-arg call (`tickets.list(orgSlug, userId, slug)`) to a 4-arg call that decodes `urlParams` into a nested `TicketListQuery` via `ticketListQueryFromSearch(urlParams as Record<string, unknown>)`. The optional 5th `limit` argument is omitted — HTTP page size is locked to `TICKET_LIST_LIMIT` via the cursor. `count` handler added as a structural twin: same `{ path, urlParams }` destructure, same `Effect.gen` body, same `ticketListQueryFromSearch` conversion, same `dieOnMarkdown` pipe. `ticketListQueryFromSearch` was added to the existing `@projectproject/shared` destructured import — no duplicate import line, no reorganization.
- The two type errors carried in this file from Phases B and C — `count` endpoint unhandled, and `list` arity mismatch — both resolve.
- `TicketCountQuery` accepted the `TicketListQuery` return from `ticketListQueryFromSearch` directly via structural subtyping; no explicit `{ filter, q }` extraction was needed. The compiler is satisfied because `TicketListQuery` contains `filter` and `q` as required fields and adds extras (`sort`, `cursor`) that `TicketCountQuery` ignores.

### D1 deviation — barrel re-export in `packages/shared/src/filters/index.ts`

The plan documented (in the Phase B carry-over) that the handler would `import { ticketListQueryFromSearch } from "@projectproject/shared"`. That import path could not actually resolve at Phase C tip: `packages/shared/src/filters/url.ts` was created in Phase A but never re-exported through `filters/index.ts`. The shared package root (`packages/shared/src/index.ts`) re-exports `./filters` as a barrel, so the gap was specifically inside the filters barrel.

The fix is one line — `export * from "./url"` appended in `filters/index.ts` after the existing `Ticket` and `Group` re-exports. No API surface added, no function modified, no logic change. Without it the handler edit would not compile.

Documented in the commit body. Inherited gap, closed silently as part of D1 rather than asking for a separate commit. Acceptable scope creep — it is the smallest possible bridge that makes the plan-mandated import resolve.

### Typecheck baseline after Phase D

`bun run typecheck` from repo root:

| Package | Exit | Errors | Notes |
|---|---|---|---|
| `@projectproject/shared` | 0 | 0 | Clean (was 0 throughout B/C). |
| `@projectproject/backend` | 0 | 0 | Was 2 at C tip — `count` unhandled and `list` arity. Both resolved by D1. |
| `@projectproject/frontend` | 2 | 25 | Unchanged from Phase B/C baseline. All 25 are downstream of the changed `tickets.list` return shape and the new `urlParams` requirement. Phase E's job — rewires the consumer atoms / components. |

Test status from `packages/backend`:
- Did not run a full backend test suite — D1 only edits one handler file and does not exercise new service logic. Phase C's `TicketFilters.test.ts` / `Tickets.test.ts` cover the handler's dependencies (matcher, `list`, `count`). Backend typecheck-clean was the gating signal per the plan.
- Pre-existing `Groups.test.ts` failure carry-over (6 cases, `completed_before_start`) unaddressed; unrelated to this branch.

### Smoke verification

Skipped by design. The plan's Step 4 ("Smoke the API by hand") was deferred — the per-task brief explicitly directed not to start the dev server or drive a browser. Typecheck-clean backend is the bar D1 set out to meet.

### Carry-over for Phase E

- The HTTP `list` endpoint now returns `TicketListPage` (envelope with `items: ReadonlyArray<Ticket>` plus `cursor: string | null`), not `Ticket[]`. All 25 frontend errors at HEAD are consumers treating the response as a bare array. Phase E rewires them to read `.items` (and threads `cursor` through the new `loadMoreTicketsAtom`).
- `ticketListQueryFromSearch` is now reachable through `@projectproject/shared` (barrel fix landed in D1). Phase E's `validateSearch` / atom families can import it directly — no deep-path imports needed.
- All other handler-level concerns (`"mine"` substitution, status-strip for byStatus) are settled in the service layer. The frontend doesn't need to do anything special at the call boundary; it just constructs URLs.

### Open carry-overs still on the books (inherited, unchanged in D)

- **F1 territory (decoder branding):** `decodeStringArray` in `packages/shared/src/filters/url.ts` casts URL `tags` / `groupId` to branded types without per-element schema validation. Document or tighten when wiring `validateSearch`.
- **D / E territory (wire-shape coupling):** `BaseTicketFilterParams` in `api.ts`, `ticketListQueryToSearch` / `ticketListQueryFromSearch` in `filters/url.ts`, and `TicketFilter` in `filters/Ticket.ts` are coupled by manual enumeration. Adding a new filter field requires updates in three places.
- **`updatedAfter`:** in the schema but not in URL transforms or params struct. URL-driven filtering by `updatedAfter` is currently unreachable.
- **Cursor sort-fingerprint validation:** v1 doesn't encode `{ key, dir }` into the cursor payload. Frontend resets cursor on sort change.

### Phase D self-check

- Workspace typecheck delta matches plan expectations: shared 0 (unchanged), backend 0 (was 2 — both resolved), frontend 25 (unchanged — Phase E's set).
- One commit ahead of `86fab62` (Phase C tip); thirteen ahead of `main`.
- No comments added in D1. Pre-existing top-of-file comment in `tickets.ts` preserved unchanged.
- Files modified strictly within scope: `packages/backend/src/handlers/tickets.ts` and the inherited-gap bridge `packages/shared/src/filters/index.ts`. No frontend, no api.ts, no other shared or backend files. `routeTree.gen.ts` LF/CRLF noise from earlier phases still uncommitted.
- Two-stage review (spec compliance + code quality) ran. Spec reviewer verified the barrel-fix deviation against `git show 86fab62:packages/shared/src/filters/index.ts` and confirmed `export * from "./url"` was absent at the Phase C tip while `url.ts` itself existed; approved as a justified gap-fix. Code-quality reviewer approved with no Critical / Important / Minor issues. Single commit; no amends.

Ready to start Phase E in a fresh context.

