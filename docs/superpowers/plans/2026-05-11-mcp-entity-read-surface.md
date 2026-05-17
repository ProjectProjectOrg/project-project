# MCP Entity Read Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the read-only entity tools an agent needs to navigate ProjectProject: `list_orgs`, `get_org`, `list_projects`, `get_project`, `list_groups`, `get_group`, `list_tickets` (with rich server-side filter), `get_ticket`, `list_tags`, `list_members`, `get_git_state`. Reuse existing schemas; add `listPaged`/`getGitState`/`listOrganizationsPaged`/`getOrganization`/`listMembersPaged` to the existing services rather than building parallel ones.

**Architecture:** Catalog-first. Append entries to `packages/shared/src/mcp/index.ts`; the existing dispatcher in `packages/backend/src/mcp/dispatch.ts` walks them with zero changes. Filtering happens server-side in the service layer. Pagination is uniform: `Pagination` input (already shipped in Foundation), `Page<T>` output, opaque `{id, sort}` base64url cursors with per-entity natural sort.

**Tech Stack:** Effect v3, `@effect/platform`, Drizzle + Postgres, `@modelcontextprotocol/sdk`, `@effect/vitest` for service-layer tests, `bun:test` for the dispatcher-side smoke test.

**Spec:** `docs/superpowers/specs/2026-05-11-mcp-entity-read-surface-design.md`

---

## File Structure

**New:**

- `packages/shared/src/schemas/Org.ts` — `Org`, `OrgRole` schemas.
- `packages/shared/src/mcp/filters/Ticket.ts` — `TicketFilter` input schema.
- `packages/shared/src/mcp/cursor.ts` — typed per-entity cursor helpers (zero-pad / sort key extraction). Keeps padding rules out of every service.
- `packages/shared/src/mcp/cursor.test.ts` — cursor helper round-trip tests.
- `packages/backend/src/Services/TicketFilters.ts` — small pure module `applyTicketFilter(ticket, filter): boolean`. Pure, easy to unit-test, callable from the markdown service without dragging in dependencies.
- `packages/backend/src/Services/TicketFilters.test.ts`.
- `packages/backend/src/mcp/handlers.test.ts` — bun:test smoke for one filtered `list_tickets` call through the dispatcher.

**Modified:**

- `packages/shared/src/index.ts` — re-export `Org` and `TicketFilter`.
- `packages/shared/src/mcp/index.ts` — append 10 new `McpTools` entries (`me` stays).
- `packages/backend/src/Services/Tickets.ts` — extend `TicketsShape` with `listPaged` + `getGitState`.
- `packages/backend/src/Layers/Tickets.ts` — implement both.
- `packages/backend/src/Services/Groups.ts` — extend with `listPaged`.
- `packages/backend/src/Layers/Groups.ts` — implement.
- `packages/backend/src/Services/Projects.ts` — extend with `listPaged` + `listMembersPaged`.
- `packages/backend/src/Layers/Projects.ts` — implement both.
- `packages/backend/src/Services/Tags.ts` — extend with `listPaged`.
- `packages/backend/src/Layers/Tags.ts` — implement.
- `packages/backend/src/Services/BetterAuth.ts` — extend with `listOrganizationsPaged` + `getOrganization`.
- `packages/backend/src/Layers/BetterAuth.ts` — implement both.
- `packages/backend/src/mcp/handlers.ts` — register 10 new handlers; widen the `HandlersMap<R>` `R` union.

---

## Task 0: Prerequisites

**Files:** none.

- [ ] **Step 1: Confirm we are on the right branch and Foundation has landed.**

Run:
```bash
git status && git log --oneline -5
```
Expected: clean tree on `feat/T-6-mcp-simple-ai-chat`; recent log shows the Foundation commits (per-session transports, OAuth list/revoke, OAuth tables wired up).

- [ ] **Step 2: Confirm the `me` tool round-trips through `/mcp`.**

Boot the backend and inspect:
```bash
bun --filter=@projectproject/backend dev &
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```
Walk the OAuth flow once, invoke `me`. Expected: a response with `user` and `roles`. If this fails, fix Foundation regressions before continuing — Plan 2 assumes the dispatcher path works end-to-end.

- [ ] **Step 3: Re-read the spec.**

Open `docs/superpowers/specs/2026-05-11-mcp-entity-read-surface-design.md`. Confirm the catalog table, the ticket filter semantics, and the per-entity cursor sort table — every later task references one of these.

---

## Task 1: `Org` schema

**Files:**
- Create: `packages/shared/src/schemas/Org.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Implement the schema.**

```ts
// packages/shared/src/schemas/Org.ts
import * as Schema from "effect/Schema"
import { Slug } from "./Project"

export const OrgRole = Schema.Literal("owner", "admin", "member")
export type OrgRole = typeof OrgRole.Type

export const Org = Schema.Struct({
  slug: Slug,
  name: Schema.String,
  role: OrgRole
})
export type Org = typeof Org.Type
```

- [ ] **Step 2: Re-export from the shared barrel.**

Open `packages/shared/src/index.ts`. After the existing `export * from "./schemas/Group"` add:
```ts
export * from "./schemas/Org"
```

- [ ] **Step 3: Type-check.**

```bash
bun --filter=@projectproject/shared tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add packages/shared/src/schemas/Org.ts packages/shared/src/index.ts
git commit -m "feat(shared): Org schema for MCP entity tools"
```

---

## Task 2: `TicketFilter` schema

**Files:**
- Create: `packages/shared/src/mcp/filters/Ticket.ts`
- Modify: `packages/shared/src/mcp/index.ts` (re-export)
- Modify: `packages/shared/src/index.ts` (no-op if already re-exporting `./mcp`)

- [ ] **Step 1: Implement.**

```ts
// packages/shared/src/mcp/filters/Ticket.ts
import * as Schema from "effect/Schema"
import { TicketStatus, TicketType } from "../../schemas/Ticket"
import { TagName } from "../../schemas/Tag"

export const TicketFilter = Schema.Struct({
  status: Schema.optional(Schema.Array(TicketStatus)),
  type: Schema.optional(Schema.Array(TicketType)),
  // null encodes "unassigned"; non-null strings are user ids.
  assignee: Schema.optional(Schema.Array(Schema.NullOr(Schema.String))),
  tags: Schema.optional(Schema.Array(TagName)),
  hasBranch: Schema.optional(Schema.Boolean),
  hasPr: Schema.optional(Schema.Boolean),
  updatedAfter: Schema.optional(Schema.Date)
})
export type TicketFilter = typeof TicketFilter.Type
```

- [ ] **Step 2: Re-export from the mcp barrel.**

Open `packages/shared/src/mcp/index.ts`. After `export * from "./MeOutput"` add:
```ts
export * from "./filters/Ticket"
```

- [ ] **Step 3: Type-check.**

```bash
bun --filter=@projectproject/shared tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add packages/shared/src/mcp/filters/Ticket.ts packages/shared/src/mcp/index.ts
git commit -m "feat(shared): TicketFilter schema for list_tickets"
```

---

## Task 3: Per-entity cursor helpers

**Files:**
- Create: `packages/shared/src/mcp/cursor.ts`
- Create: `packages/shared/src/mcp/cursor.test.ts`

The existing `Pagination.ts` ships `encodeCursor({id, sort})` / `decodeCursor`. This task adds two thin helpers used by every service: zero-pad numeric ids (T-7 → `"0000000007"`) and decode-or-default (malformed cursor → `undefined`, treated as start). Centralized so the same padding width is used everywhere.

- [ ] **Step 1: Write the failing test.**

```ts
// packages/shared/src/mcp/cursor.test.ts
import { describe, expect, it } from "@effect/vitest"
import {
  padNumericIdSort,
  tryDecodeCursor
} from "./cursor"
import { encodeCursor } from "./Pagination"

describe("cursor helpers", () => {
  it("pads numeric ids to 10 chars", () => {
    expect(padNumericIdSort("T-1")).toBe("0000000001")
    expect(padNumericIdSort("G-42")).toBe("0000000042")
    expect(padNumericIdSort("T-1234567890")).toBe("1234567890")
  })

  it("falls back to undefined for non-numeric ids", () => {
    expect(padNumericIdSort("not-numeric")).toBe(undefined)
  })

  it("tryDecodeCursor returns payload for a valid cursor", () => {
    const c = encodeCursor({ id: "T-7", sort: "0000000007" })
    expect(tryDecodeCursor(c)).toEqual({ id: "T-7", sort: "0000000007" })
  })

  it("tryDecodeCursor returns undefined for garbage", () => {
    expect(tryDecodeCursor("not-base64-or-json")).toBe(undefined)
    expect(tryDecodeCursor(undefined)).toBe(undefined)
  })
})
```

- [ ] **Step 2: Run, expect fail.**

```bash
bun --filter=@projectproject/shared test cursor.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```ts
// packages/shared/src/mcp/cursor.ts
import { decodeCursor, type CursorPayload } from "./Pagination"

export const CURSOR_NUMERIC_WIDTH = 10

// Tickets and groups have ids like `T-7` / `G-42`. Sort lexically by a fixed-
// width zero-padded numeric string so `"0000000002"` < `"0000000010"`.
export const padNumericIdSort = (id: string): string | undefined => {
  const dash = id.indexOf("-")
  if (dash < 0) return undefined
  const tail = id.slice(dash + 1)
  if (!/^[0-9]+$/.test(tail)) return undefined
  return tail.padStart(CURSOR_NUMERIC_WIDTH, "0")
}

export const tryDecodeCursor = (
  cursor: string | undefined
): CursorPayload | undefined => {
  if (!cursor) return undefined
  try {
    return decodeCursor(cursor)
  } catch {
    return undefined
  }
}
```

- [ ] **Step 4: Re-export from the barrel.**

In `packages/shared/src/mcp/index.ts`, after `export * from "./Pagination"`:
```ts
export * from "./cursor"
```

- [ ] **Step 5: Run, expect pass.**

```bash
bun --filter=@projectproject/shared test cursor.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add packages/shared/src/mcp/cursor.ts packages/shared/src/mcp/cursor.test.ts packages/shared/src/mcp/index.ts
git commit -m "feat(shared): cursor helpers for paginated MCP lists"
```

---

## Task 4: Pure ticket filter predicate

**Files:**
- Create: `packages/backend/src/Services/TicketFilters.ts`
- Create: `packages/backend/src/Services/TicketFilters.test.ts`

The predicate is a pure function over a `Ticket` and a `TicketFilter`. Keeping it pure (no Effect, no DB) means we can table-test every field cheaply, and `Tickets.listPaged` calls it inside a normal `Array.filter`.

- [ ] **Step 1: Write the failing test.**

```ts
// packages/backend/src/Services/TicketFilters.test.ts
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import type { Ticket, TicketFilter } from "@projectproject/shared"
import { TagName, TicketId } from "@projectproject/shared"
import { matchesTicketFilter } from "./TicketFilters"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)
const decodeTagName = Schema.decodeUnknownSync(TagName)

const baseTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: decodeTicketId("T-1"),
  title: "Test",
  status: "todo",
  type: "feat",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  lastTransitionedPr: null,
  assignees: [],
  createdBy: "user-1",
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-10T00:00:00.000Z"),
  ...overrides
})

describe("matchesTicketFilter", () => {
  it("undefined filter matches everything", () => {
    expect(matchesTicketFilter(baseTicket(), undefined)).toBe(true)
  })

  it("empty filter object matches everything", () => {
    expect(matchesTicketFilter(baseTicket(), {})).toBe(true)
  })

  it("status filter ORs across entries", () => {
    const t = baseTicket({ status: "in_progress" })
    const f: TicketFilter = { status: ["in_progress", "done"] }
    expect(matchesTicketFilter(t, f)).toBe(true)
    expect(matchesTicketFilter(baseTicket({ status: "todo" }), f)).toBe(false)
  })

  it("empty status array matches nothing", () => {
    expect(matchesTicketFilter(baseTicket(), { status: [] })).toBe(false)
  })

  it("type filter ORs across entries", () => {
    const f: TicketFilter = { type: ["bug"] }
    expect(matchesTicketFilter(baseTicket({ type: "bug" }), f)).toBe(true)
    expect(matchesTicketFilter(baseTicket({ type: "feat" }), f)).toBe(false)
  })

  it("assignee: null entry matches unassigned tickets", () => {
    const t = baseTicket({ assignees: [] })
    expect(matchesTicketFilter(t, { assignee: [null] })).toBe(true)
    expect(matchesTicketFilter(t, { assignee: ["alice"] })).toBe(false)
  })

  it("assignee mix matches union of unassigned + named", () => {
    const f: TicketFilter = { assignee: [null, "alice"] }
    expect(matchesTicketFilter(baseTicket({ assignees: [] }), f)).toBe(true)
    expect(matchesTicketFilter(baseTicket({ assignees: ["alice"] }), f)).toBe(true)
    expect(matchesTicketFilter(baseTicket({ assignees: ["bob"] }), f)).toBe(false)
  })

  it("tags filter ORs across entries (any tag in common wins)", () => {
    const t = baseTicket({ tags: [decodeTagName("bug"), decodeTagName("perf")] })
    expect(matchesTicketFilter(t, { tags: [decodeTagName("bug")] })).toBe(true)
    expect(matchesTicketFilter(t, { tags: [decodeTagName("ui")] })).toBe(false)
  })

  it("hasBranch true requires non-null branch", () => {
    expect(matchesTicketFilter(baseTicket({ branch: "feat/x" }), { hasBranch: true })).toBe(true)
    expect(matchesTicketFilter(baseTicket({ branch: null }), { hasBranch: true })).toBe(false)
  })

  it("hasBranch false requires null branch", () => {
    expect(matchesTicketFilter(baseTicket({ branch: null }), { hasBranch: false })).toBe(true)
    expect(matchesTicketFilter(baseTicket({ branch: "feat/x" }), { hasBranch: false })).toBe(false)
  })

  it("hasPr mirrors hasBranch against pr", () => {
    expect(matchesTicketFilter(baseTicket({ pr: 7 }), { hasPr: true })).toBe(true)
    expect(matchesTicketFilter(baseTicket({ pr: null }), { hasPr: true })).toBe(false)
  })

  it("updatedAfter is strict greater-than", () => {
    const t = baseTicket({ updatedAt: new Date("2026-05-10T00:00:00.000Z") })
    expect(matchesTicketFilter(t, { updatedAfter: new Date("2026-05-09T00:00:00.000Z") })).toBe(true)
    expect(matchesTicketFilter(t, { updatedAfter: new Date("2026-05-10T00:00:00.000Z") })).toBe(false)
    expect(matchesTicketFilter(t, { updatedAfter: new Date("2026-05-11T00:00:00.000Z") })).toBe(false)
  })

  it("ANDs across fields", () => {
    const t = baseTicket({ status: "in_progress", type: "bug" })
    expect(matchesTicketFilter(t, { status: ["in_progress"], type: ["bug"] })).toBe(true)
    expect(matchesTicketFilter(t, { status: ["in_progress"], type: ["feat"] })).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect fail.**

```bash
bun --filter=@projectproject/backend test TicketFilters.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

```ts
// packages/backend/src/Services/TicketFilters.ts
import type { Ticket, TicketFilter } from "@projectproject/shared"

export const matchesTicketFilter = (
  ticket: Ticket,
  filter: TicketFilter | undefined
): boolean => {
  if (!filter) return true

  if (filter.status !== undefined) {
    if (filter.status.length === 0) return false
    if (!filter.status.includes(ticket.status)) return false
  }

  if (filter.type !== undefined) {
    if (filter.type.length === 0) return false
    if (!filter.type.includes(ticket.type)) return false
  }

  if (filter.assignee !== undefined) {
    if (filter.assignee.length === 0) return false
    const wantsUnassigned = filter.assignee.includes(null)
    const wantedIds = filter.assignee.filter(
      (a): a is string => a !== null
    )
    const isUnassigned = ticket.assignees.length === 0
    const hasWantedId = ticket.assignees.some((a) => wantedIds.includes(a))
    if (!(wantsUnassigned && isUnassigned) && !hasWantedId) return false
  }

  if (filter.tags !== undefined) {
    if (filter.tags.length === 0) return false
    if (!filter.tags.some((t) => ticket.tags.includes(t))) return false
  }

  if (filter.hasBranch !== undefined) {
    if (filter.hasBranch && ticket.branch === null) return false
    if (!filter.hasBranch && ticket.branch !== null) return false
  }

  if (filter.hasPr !== undefined) {
    if (filter.hasPr && ticket.pr === null) return false
    if (!filter.hasPr && ticket.pr !== null) return false
  }

  if (filter.updatedAfter !== undefined) {
    if (ticket.updatedAt.getTime() <= filter.updatedAfter.getTime()) return false
  }

  return true
}
```

- [ ] **Step 4: Run, expect pass.**

```bash
bun --filter=@projectproject/backend test TicketFilters.test.ts
```
Expected: PASS — all 12 cases.

- [ ] **Step 5: Commit.**

```bash
git add packages/backend/src/Services/TicketFilters.ts packages/backend/src/Services/TicketFilters.test.ts
git commit -m "feat(backend): pure ticket-filter predicate"
```

---

## Task 5: `Tickets.listPaged` + `Tickets.getGitState`

**Files:**
- Modify: `packages/backend/src/Services/Tickets.ts`
- Modify: `packages/backend/src/Layers/Tickets.ts`

- [ ] **Step 1: Extend the Service shape.**

Open `packages/backend/src/Services/Tickets.ts`. Add the imports:
```ts
import type {
  // existing imports unchanged
  TicketFilter
} from "@projectproject/shared"
import type { CursorPayload } from "@projectproject/shared"
```

Inside `TicketsShape`, after the existing `list` method declaration, add:
```ts
readonly listPaged: (
  orgSlug: string,
  userId: string,
  slug: string,
  filter: TicketFilter | undefined,
  cursor: CursorPayload | undefined,
  limit: number
) => Effect.Effect<
  { items: ReadonlyArray<Ticket>; nextCursor: string | null },
  NotFound | MarkdownError
>
readonly getGitState: (
  orgSlug: string,
  userId: string,
  slug: string,
  ticketId: string | undefined
) => Effect.Effect<GitStatesResponse, NotFound | MarkdownError>
```

- [ ] **Step 2: Implement in the Layer.**

Open `packages/backend/src/Layers/Tickets.ts`. Below the existing imports add:
```ts
import {
  encodeCursor,
  padNumericIdSort,
  type CursorPayload,
  type TicketFilter
} from "@projectproject/shared"
import { matchesTicketFilter } from "../Services/TicketFilters"
```

Inside the `Effect.gen(function*() {...})` body, after the existing `const list` declaration, add:
```ts
const listPaged = (
  orgSlug: string,
  userId: string,
  slug: string,
  filter: TicketFilter | undefined,
  cursor: CursorPayload | undefined,
  limit: number
): Effect.Effect<
  { items: ReadonlyArray<Ticket>; nextCursor: string | null },
  NotFound | MarkdownError
> =>
  Effect.gen(function* () {
    yield* ensureAccess(orgSlug, userId, slug)
    const ids = yield* ticketDocs.listIds(orgSlug, slug)
    const tickets = yield* Effect.forEach(
      ids,
      (id) => readTicket(orgSlug, slug, id),
      { concurrency: 8 }
    )
    const sorted = tickets
      .map(documentToTicket)
      .filter((t) => matchesTicketFilter(t, filter))
      .toSorted(
        (a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2))
      )

    const startIdx =
      cursor === undefined
        ? 0
        : (() => {
            const idx = sorted.findIndex(
              (t) => (padNumericIdSort(t.id) ?? "") > cursor.sort
            )
            return idx < 0 ? sorted.length : idx
          })()

    const slice = sorted.slice(startIdx, startIdx + limit + 1)
    const hasMore = slice.length > limit
    const items = hasMore ? slice.slice(0, limit) : slice
    const last = items[items.length - 1]
    const nextCursor =
      hasMore && last
        ? encodeCursor({ id: last.id, sort: padNumericIdSort(last.id) ?? last.id })
        : null

    return { items, nextCursor }
  })
```

Inside the same body, also add:
```ts
const getGitState = (
  orgSlug: string,
  userId: string,
  slug: string,
  ticketId: string | undefined
): Effect.Effect<GitStatesResponse, NotFound | MarkdownError> =>
  Effect.gen(function* () {
    const all = yield* listGitStates(orgSlug, userId, slug)
    if (ticketId === undefined) return all
    const single = all.states[ticketId]
    return {
      states: single ? { [ticketId]: single } : {},
      transitioned: all.transitioned.filter((t) => t.ticketId === ticketId),
      tokenStatus: all.tokenStatus,
      repoStatus: all.repoStatus
    }
  })
```

Finally, add both to the returned object:
```ts
return {
  list,
  listPaged,
  get,
  create,
  update,
  remove,
  replaceTag,
  createBranch,
  attachBranch,
  openPr,
  clearBranch,
  listGitStates,
  getGitState
} satisfies TicketsShape
```

- [ ] **Step 3: Type-check.**

```bash
bun --filter=@projectproject/backend tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add packages/backend/src/Services/Tickets.ts packages/backend/src/Layers/Tickets.ts
git commit -m "feat(backend): Tickets.listPaged with server-side filter + getGitState"
```

---

## Task 6: `Groups.listPaged`

**Files:**
- Modify: `packages/backend/src/Services/Groups.ts`
- Modify: `packages/backend/src/Layers/Groups.ts`

- [ ] **Step 1: Extend the Service shape.**

In `packages/backend/src/Services/Groups.ts` add the imports:
```ts
import type { CursorPayload } from "@projectproject/shared"
```

Inside `GroupsShape`, after the existing `list` method, add:
```ts
readonly listPaged: (
  orgSlug: string,
  userId: string,
  slug: string,
  cursor: CursorPayload | undefined,
  limit: number
) => Effect.Effect<
  { items: ReadonlyArray<Group>; nextCursor: string | null },
  NotFound | MarkdownError
>
```

- [ ] **Step 2: Implement in the Layer.**

Open `packages/backend/src/Layers/Groups.ts`. Add imports:
```ts
import {
  encodeCursor,
  padNumericIdSort,
  type CursorPayload
} from "@projectproject/shared"
```

After the existing `const list` declaration add:
```ts
const listPaged = (
  orgSlug: string,
  userId: string,
  slug: string,
  cursor: CursorPayload | undefined,
  limit: number
): Effect.Effect<
  { items: ReadonlyArray<Group>; nextCursor: string | null },
  NotFound | MarkdownError
> =>
  Effect.gen(function* () {
    yield* projects.requireMember(orgSlug, userId, slug)
    const ids = yield* groupDocs.listIds(orgSlug, slug)
    const results = yield* Effect.forEach(
      ids,
      (id) => groupDocs.read(orgSlug, slug, id),
      { concurrency: 8 }
    )
    const sorted = results
      .map(documentToGroup)
      .toSorted((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)))

    const startIdx =
      cursor === undefined
        ? 0
        : (() => {
            const idx = sorted.findIndex(
              (g) => (padNumericIdSort(g.id) ?? "") > cursor.sort
            )
            return idx < 0 ? sorted.length : idx
          })()

    const slice = sorted.slice(startIdx, startIdx + limit + 1)
    const hasMore = slice.length > limit
    const items = hasMore ? slice.slice(0, limit) : slice
    const last = items[items.length - 1]
    const nextCursor =
      hasMore && last
        ? encodeCursor({ id: last.id, sort: padNumericIdSort(last.id) ?? last.id })
        : null

    return { items, nextCursor }
  })
```

Add `listPaged` to the returned object alongside `list`.

- [ ] **Step 3: Type-check.**

```bash
bun --filter=@projectproject/backend tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add packages/backend/src/Services/Groups.ts packages/backend/src/Layers/Groups.ts
git commit -m "feat(backend): Groups.listPaged"
```

---

## Task 7: `Projects.listPaged` + `Projects.listMembersPaged`

**Files:**
- Modify: `packages/backend/src/Services/Projects.ts`
- Modify: `packages/backend/src/Layers/Projects.ts`

- [ ] **Step 1: Extend the Service shape.**

In `packages/backend/src/Services/Projects.ts` add the imports:
```ts
import type { CursorPayload, Member } from "@projectproject/shared"
```

After the existing `list` method declaration add:
```ts
readonly listPaged: (
  orgSlug: string,
  userId: string,
  cursor: CursorPayload | undefined,
  limit: number
) => Effect.Effect<
  { items: ReadonlyArray<Project>; nextCursor: string | null }
>
readonly listMembersPaged: (
  orgSlug: string,
  userId: string,
  slug: string,
  cursor: CursorPayload | undefined,
  limit: number
) => Effect.Effect<
  { items: ReadonlyArray<Member>; nextCursor: string | null },
  NotFound
>
```

- [ ] **Step 2: Implement in the Layer.**

Open `packages/backend/src/Layers/Projects.ts`. Add imports:
```ts
import {
  encodeCursor,
  type CursorPayload
} from "@projectproject/shared"
```

After the existing `const list` declaration add:
```ts
const listPaged = (
  orgSlug: string,
  userId: string,
  cursor: CursorPayload | undefined,
  limit: number
): Effect.Effect<{ items: ReadonlyArray<Project>; nextCursor: string | null }> =>
  Effect.gen(function* () {
    const all = yield* list(orgSlug, userId)
    const sorted = [...all].toSorted((a, b) => {
      const dt = b.createdAt.getTime() - a.createdAt.getTime()
      if (dt !== 0) return dt
      return a.slug.localeCompare(b.slug)
    })
    const startIdx =
      cursor === undefined
        ? 0
        : (() => {
            const idx = sorted.findIndex((p) => {
              const key = `${(Number.MAX_SAFE_INTEGER - p.createdAt.getTime())
                .toString()
                .padStart(20, "0")}|${p.slug}`
              return key > cursor.sort
            })
            return idx < 0 ? sorted.length : idx
          })()
    const slice = sorted.slice(startIdx, startIdx + limit + 1)
    const hasMore = slice.length > limit
    const items = hasMore ? slice.slice(0, limit) : slice
    const last = items[items.length - 1]
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            id: last.slug,
            sort: `${(Number.MAX_SAFE_INTEGER - last.createdAt.getTime())
              .toString()
              .padStart(20, "0")}|${last.slug}`
          })
        : null
    return { items, nextCursor }
  })
```

Why the awkward sort key: createdAt-desc requires inverting the timestamp; encoding `(MAX - millis)` left-padded means lexicographic comparison matches "newer first". The `|slug` tiebreaker keeps ordering stable when two projects share a timestamp.

For members, reuse the existing `get` to pull `ProjectDetail.members`:
```ts
const listMembersPaged = (
  orgSlug: string,
  userId: string,
  slug: string,
  cursor: CursorPayload | undefined,
  limit: number
): Effect.Effect<
  { items: ReadonlyArray<Member>; nextCursor: string | null },
  NotFound
> =>
  Effect.gen(function* () {
    const detail = yield* get(orgSlug, userId, slug).pipe(
      Effect.catchTag("MarkdownError", (e) => Effect.die(e))
    )
    const sorted = [...detail.members].toSorted((a, b) => {
      const byName = a.name.localeCompare(b.name)
      return byName !== 0 ? byName : a.id.localeCompare(b.id)
    })
    const startIdx =
      cursor === undefined
        ? 0
        : (() => {
            const idx = sorted.findIndex(
              (m) => `${m.name}|${m.id}` > cursor.sort
            )
            return idx < 0 ? sorted.length : idx
          })()
    const slice = sorted.slice(startIdx, startIdx + limit + 1)
    const hasMore = slice.length > limit
    const items = hasMore ? slice.slice(0, limit) : slice
    const last = items[items.length - 1]
    const nextCursor =
      hasMore && last
        ? encodeCursor({ id: last.id, sort: `${last.name}|${last.id}` })
        : null
    return { items, nextCursor }
  })
```

Add both to the returned `satisfies ProjectsShape` object.

- [ ] **Step 3: Type-check.**

```bash
bun --filter=@projectproject/backend tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add packages/backend/src/Services/Projects.ts packages/backend/src/Layers/Projects.ts
git commit -m "feat(backend): Projects.listPaged + listMembersPaged"
```

---

## Task 8: `Tags.listPaged`

**Files:**
- Modify: `packages/backend/src/Services/Tags.ts`
- Modify: `packages/backend/src/Layers/Tags.ts`

- [ ] **Step 1: Extend the Service shape.**

In `packages/backend/src/Services/Tags.ts` add to the imports:
```ts
import type { CursorPayload } from "@projectproject/shared"
```

After the existing `list` declaration add:
```ts
readonly listPaged: (
  orgSlug: string,
  userId: string,
  slug: string,
  cursor: CursorPayload | undefined,
  limit: number
) => Effect.Effect<
  { items: ReadonlyArray<Tag>; nextCursor: string | null },
  NotFound
>
```

- [ ] **Step 2: Implement in the Layer.**

Open `packages/backend/src/Layers/Tags.ts`. Add imports:
```ts
import {
  encodeCursor,
  type CursorPayload
} from "@projectproject/shared"
```

After the existing `const list` declaration add:
```ts
const listPaged = (
  orgSlug: string,
  userId: string,
  slug: string,
  cursor: CursorPayload | undefined,
  limit: number
): Effect.Effect<
  { items: ReadonlyArray<Tag>; nextCursor: string | null },
  NotFound
> =>
  Effect.gen(function* () {
    const all = yield* list(orgSlug, userId, slug)
    const sorted = [...all].toSorted((a, b) => a.name.localeCompare(b.name))
    const startIdx =
      cursor === undefined
        ? 0
        : (() => {
            const idx = sorted.findIndex((t) => t.name > cursor.sort)
            return idx < 0 ? sorted.length : idx
          })()
    const slice = sorted.slice(startIdx, startIdx + limit + 1)
    const hasMore = slice.length > limit
    const items = hasMore ? slice.slice(0, limit) : slice
    const last = items[items.length - 1]
    const nextCursor =
      hasMore && last
        ? encodeCursor({ id: last.name, sort: last.name })
        : null
    return { items, nextCursor }
  })
```

Add `listPaged` to the returned object.

- [ ] **Step 3: Type-check.**

```bash
bun --filter=@projectproject/backend tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add packages/backend/src/Services/Tags.ts packages/backend/src/Layers/Tags.ts
git commit -m "feat(backend): Tags.listPaged"
```

---

## Task 9: `BetterAuth.listOrganizationsPaged` + `getOrganization`

**Files:**
- Modify: `packages/backend/src/Services/BetterAuth.ts`
- Modify: `packages/backend/src/Layers/BetterAuth.ts`

The existing `listOrganizations` returns `Array<{ orgSlug, role }>` — used by the `me` handler. We add a new method that returns `Array<Org>` (`{ slug, name, role }`) plus a paginated wrapper, and a point-read by slug. The `me` handler doesn't change.

- [ ] **Step 1: Extend the Service shape.**

In `packages/backend/src/Services/BetterAuth.ts` add to the imports:
```ts
import type { CursorPayload, NotFound, Org } from "@projectproject/shared"
```

Inside `BetterAuthShape`, after the existing `listOrganizations` method, add:
```ts
readonly listOrganizationsPaged: (
  userId: string,
  cursor: CursorPayload | undefined,
  limit: number
) => Effect.Effect<
  { items: ReadonlyArray<Org>; nextCursor: string | null },
  BetterAuthError
>
readonly getOrganization: (
  userId: string,
  orgSlug: string
) => Effect.Effect<Org, BetterAuthError | NotFound>
```

- [ ] **Step 2: Implement in the Layer.**

Open `packages/backend/src/Layers/BetterAuth.ts`. Add imports:
```ts
import {
  encodeCursor,
  NotFound,
  type CursorPayload,
  type Org,
  type OrgRole
} from "@projectproject/shared"
```

Inside the returned object literal, after the existing `listOrganizations` definition, add:
```ts
listOrganizationsPaged: (
  userId: string,
  cursor: CursorPayload | undefined,
  limit: number
) =>
  Effect.gen(function* () {
    const rows = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            slug: organization.slug,
            name: organization.name,
            role: member.role
          })
          .from(member)
          .innerJoin(organization, eq(member.organizationId, organization.id))
          .where(eq(member.userId, userId)),
      catch: (cause) => new BetterAuthError({ cause })
    })
    const allowed = new Set(["owner", "admin", "member"] as const)
    const orgs: ReadonlyArray<Org> = rows.flatMap((r) =>
      allowed.has(r.role as OrgRole)
        ? [{ slug: r.slug as Org["slug"], name: r.name, role: r.role as OrgRole }]
        : []
    )
    const sorted = [...orgs].toSorted((a, b) => a.name.localeCompare(b.name))
    const startIdx =
      cursor === undefined
        ? 0
        : (() => {
            const idx = sorted.findIndex((o) => o.name > cursor.sort)
            return idx < 0 ? sorted.length : idx
          })()
    const slice = sorted.slice(startIdx, startIdx + limit + 1)
    const hasMore = slice.length > limit
    const items = hasMore ? slice.slice(0, limit) : slice
    const last = items[items.length - 1]
    const nextCursor =
      hasMore && last
        ? encodeCursor({ id: last.slug, sort: last.name })
        : null
    return { items, nextCursor }
  }),
getOrganization: (userId: string, orgSlug: string) =>
  Effect.gen(function* () {
    const row = yield* Effect.tryPromise({
      try: () =>
        db
          .select({
            slug: organization.slug,
            name: organization.name,
            role: member.role
          })
          .from(member)
          .innerJoin(
            organization,
            eq(member.organizationId, organization.id)
          )
          .where(and(eq(member.userId, userId), eq(organization.slug, orgSlug)))
          .limit(1),
      catch: (cause) => new BetterAuthError({ cause })
    })
    const first = row[0]
    if (!first) return yield* new NotFound()
    const allowed = new Set(["owner", "admin", "member"] as const)
    if (!allowed.has(first.role as OrgRole)) return yield* new NotFound()
    return {
      slug: first.slug as Org["slug"],
      name: first.name,
      role: first.role as OrgRole
    }
  }),
```

- [ ] **Step 3: Type-check.**

```bash
bun --filter=@projectproject/backend tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add packages/backend/src/Services/BetterAuth.ts packages/backend/src/Layers/BetterAuth.ts
git commit -m "feat(backend): BetterAuth.listOrganizationsPaged + getOrganization"
```

---

## Task 10: Widen the `McpTools` catalog

**Files:**
- Modify: `packages/shared/src/mcp/index.ts`

- [ ] **Step 1: Add the new tool entries.**

Open `packages/shared/src/mcp/index.ts`. Add the imports needed for the new entries:
```ts
import { NotFound } from "../errors"
import { Slug } from "../schemas/Project"
import { Org } from "../schemas/Org"
import { Project, ProjectDetail, Member } from "../schemas/Project"
import { Ticket, TicketDetail, TicketId } from "../schemas/Ticket"
import { Group, GroupDetail, GroupId } from "../schemas/Group"
import { Tag } from "../schemas/Tag"
import { GitStatesResponse } from "../schemas/GitState"
import { Page, Pagination } from "./Pagination"
import { TicketFilter } from "./filters/Ticket"
```

(Some imports may already exist — merge cleanly.)

Replace the existing `McpTools` definition with:
```ts
export const McpTools = {
  me: {
    description: "Identity of the authed user and their org/project roles.",
    input: Schema.Struct({}),
    output: MeOutput,
    errors: [Unauthorized] as const
  },
  list_orgs: {
    description: "List organizations the caller belongs to.",
    input: Pagination,
    output: Page(Org),
    errors: [Unauthorized] as const
  },
  get_org: {
    description: "Fetch one organization by slug.",
    input: Schema.Struct({ orgSlug: Slug }),
    output: Org,
    errors: [Unauthorized, NotFound] as const
  },
  list_projects: {
    description: "List projects in an org the caller can see.",
    input: Schema.Struct({ orgSlug: Slug, ...Pagination.fields }),
    output: Page(Project),
    errors: [Unauthorized, NotFound] as const
  },
  get_project: {
    description:
      "Fetch one project including github connection, members, and raw markdown body.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug }),
    output: ProjectDetail,
    errors: [Unauthorized, NotFound] as const
  },
  list_groups: {
    description: "List groups (sprints, epics, milestones) in a project.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      ...Pagination.fields
    }),
    output: Page(Group),
    errors: [Unauthorized, NotFound] as const
  },
  get_group: {
    description: "Fetch one group including raw markdown body.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug, id: GroupId }),
    output: GroupDetail,
    errors: [Unauthorized, NotFound] as const
  },
  list_tickets: {
    description:
      "List tickets in a project with optional server-side filtering.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      filter: Schema.optional(TicketFilter),
      ...Pagination.fields
    }),
    output: Page(Ticket),
    errors: [Unauthorized, NotFound] as const
  },
  get_ticket: {
    description: "Fetch one ticket including raw markdown body.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug, id: TicketId }),
    output: TicketDetail,
    errors: [Unauthorized, NotFound] as const
  },
  list_tags: {
    description: "List tags defined in a project.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      ...Pagination.fields
    }),
    output: Page(Tag),
    errors: [Unauthorized, NotFound] as const
  },
  list_members: {
    description: "List members of a project with their role.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      ...Pagination.fields
    }),
    output: Page(Member),
    errors: [Unauthorized, NotFound] as const
  },
  get_git_state: {
    description:
      "Fetch git / PR state for a project, optionally narrowed to one ticket.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      ticketId: Schema.optional(TicketId)
    }),
    output: GitStatesResponse,
    errors: [Unauthorized, NotFound] as const
  }
} as const satisfies Record<string, McpToolSpec<any, any, any>>
```

- [ ] **Step 2: Type-check.**

```bash
bun --filter=@projectproject/shared tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add packages/shared/src/mcp/index.ts
git commit -m "feat(shared): expand McpTools catalog with entity-read surface"
```

---

## Task 11: Register all handlers

**Files:**
- Modify: `packages/backend/src/mcp/handlers.ts`

Each handler is a thin wrapper. Common shape: decode `cursor` via `tryDecodeCursor`, apply default `limit = 50`, delegate to the service method.

- [ ] **Step 1: Replace `handlers.ts`.**

Open `packages/backend/src/mcp/handlers.ts` and replace the file with:
```ts
// packages/backend/src/mcp/handlers.ts
//
// Effect programs that back each entry in the shared `McpTools` catalog. The
// dispatcher walks the catalog and the handler map together — keys must match
// exactly.

import * as Effect from "effect/Effect"
import {
  CurrentUser,
  NotFound,
  Unauthorized,
  tryDecodeCursor,
  type MeOutput,
  type Pagination,
  type TicketFilter
} from "@projectproject/shared"
import { Users } from "../Services/Users"
import { BetterAuth, type BetterAuthError } from "../Services/BetterAuth"
import { Projects } from "../Services/Projects"
import { Tickets } from "../Services/Tickets"
import { Groups } from "../Services/Groups"
import { Tags } from "../Services/Tags"
import type { HandlersMap } from "./dispatch"

const DEFAULT_LIMIT = 50

type Env =
  | CurrentUser
  | Users
  | BetterAuth
  | Projects
  | Tickets
  | Groups
  | Tags

const me = (
  _input: {}
): Effect.Effect<MeOutput, Unauthorized | BetterAuthError, CurrentUser | Users | BetterAuth> =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const users = yield* Users
    const [user] = yield* users.fullByIds([current.id])
    if (!user) return yield* new Unauthorized()
    const betterAuth = yield* BetterAuth
    const orgs = yield* betterAuth.listOrganizations(current.id)
    return {
      user,
      roles: orgs.map((o) => ({ orgSlug: o.orgSlug, role: o.role }))
    }
  })

const list_orgs = (input: Pagination) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const betterAuth = yield* BetterAuth
    return yield* betterAuth.listOrganizationsPaged(
      current.id,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const get_org = (input: { orgSlug: string }) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const betterAuth = yield* BetterAuth
    return yield* betterAuth.getOrganization(current.id, input.orgSlug)
  })

const list_projects = (input: { orgSlug: string } & Pagination) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    return yield* projects.listPaged(
      input.orgSlug,
      current.id,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const get_project = (input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    return yield* projects.get(input.orgSlug, current.id, input.projectSlug)
  })

const list_groups = (
  input: { orgSlug: string; projectSlug: string } & Pagination
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const groups = yield* Groups
    return yield* groups.listPaged(
      input.orgSlug,
      current.id,
      input.projectSlug,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const get_group = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const groups = yield* Groups
    return yield* groups.get(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.id
    )
  })

const list_tickets = (
  input: {
    orgSlug: string
    projectSlug: string
    filter?: TicketFilter
  } & Pagination
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tickets = yield* Tickets
    return yield* tickets.listPaged(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.filter,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const get_ticket = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tickets = yield* Tickets
    return yield* tickets.get(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.id
    )
  })

const list_tags = (
  input: { orgSlug: string; projectSlug: string } & Pagination
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tags = yield* Tags
    return yield* tags.listPaged(
      input.orgSlug,
      current.id,
      input.projectSlug,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const list_members = (
  input: { orgSlug: string; projectSlug: string } & Pagination
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    return yield* projects.listMembersPaged(
      input.orgSlug,
      current.id,
      input.projectSlug,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const get_git_state = (input: {
  orgSlug: string
  projectSlug: string
  ticketId?: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tickets = yield* Tickets
    return yield* tickets.getGitState(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.ticketId
    )
  })

export const handlers: HandlersMap<Env> = {
  me,
  list_orgs,
  get_org,
  list_projects,
  get_project,
  list_groups,
  get_group,
  list_tickets,
  get_ticket,
  list_tags,
  list_members,
  get_git_state
}
```

- [ ] **Step 2: Type-check.**

```bash
bun --filter=@projectproject/backend tsc --noEmit
```
Expected: no errors. If the `McpServer` Layer's `ManagedRuntime` `R` doesn't already cover `Projects | Tickets | Groups | Tags`, the type-check will fail here with a "Type ... is not assignable to ..." error — move to Task 12 to widen the Layer.

- [ ] **Step 3: Commit.**

```bash
git add packages/backend/src/mcp/handlers.ts
git commit -m "feat(backend): register all MCP entity-read handlers"
```

---

## Task 12: Widen the `McpServer` Layer runtime (if needed)

**Files:**
- Modify: `packages/backend/src/Layers/McpServer.ts` (only if Task 11's type-check failed)

- [ ] **Step 1: Inspect the current Layer.**

```bash
grep -n "ManagedRuntime\|ServicesLayer\|Layer.provide" packages/backend/src/Layers/McpServer.ts
```

The Foundation Layer constructs a `ManagedRuntime` over the union of every service the handlers use. With Plan 2 adding `Projects | Tickets | Groups | Tags`, the runtime's environment must satisfy those Tags. The Foundation already merges `ServicesLayer` (the shared services Layer) — `Projects`/`Tickets`/`Groups`/`Tags` are already inside it, so no change is typically needed.

- [ ] **Step 2: If type-check failed in Task 11, widen the runtime.**

Identify the merged Layer used inside `McpServerLive` (likely `ServicesLayer`). Confirm it includes `ProjectsLive`, `TicketsLive`, `GroupsLive`, `TagsLive`. If any are missing, add them via `Layer.mergeAll(...)` in the same place. Do not introduce a new top-level merge — extend the existing one.

- [ ] **Step 3: Type-check.**

```bash
bun --filter=@projectproject/backend tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit only if you changed the file.**

```bash
git add packages/backend/src/Layers/McpServer.ts
git commit -m "fix(backend): widen McpServer runtime to satisfy new handlers"
```

---

## Task 13: Dispatcher smoke test

**Files:**
- Create: `packages/backend/src/mcp/handlers.test.ts`

The Foundation has a `me` smoke test using `bun:test`. Match it for `list_tickets`: register the dispatcher against a stub `McpServer` that captures the registered callback, then invoke the callback directly with an input and verify it produces a `Page<Ticket>`-shaped JSON envelope.

- [ ] **Step 1: Inspect the existing test to mirror its style.**

```bash
ls packages/backend/src/mcp/*.test.ts
```

If a `handlers.test.ts` or `dispatch.test.ts` already exists, read it first. Match its setup (stub `McpServer`, fake services, ManagedRuntime).

- [ ] **Step 2: Write the failing test.**

```ts
// packages/backend/src/mcp/handlers.test.ts
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Schema from "effect/Schema"
import { CurrentUser, TicketId } from "@projectproject/shared"
import { Tickets, type TicketsShape } from "../Services/Tickets"
import { Projects } from "../Services/Projects"
import { Groups } from "../Services/Groups"
import { Tags } from "../Services/Tags"
import { Users } from "../Services/Users"
import { BetterAuth } from "../Services/BetterAuth"
import { registerAllTools } from "./dispatch"
import { handlers } from "./handlers"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

const fakeTicket = {
  id: decodeTicketId("T-1"),
  title: "first",
  status: "todo" as const,
  type: "feat" as const,
  priority: "med" as const,
  tags: [],
  branch: null,
  pr: null,
  lastTransitionedPr: null,
  assignees: [],
  createdBy: "u-1",
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-10T00:00:00.000Z")
}

const TicketsStub = Layer.succeed(Tickets, {
  listPaged: (_o, _u, _s, _f, _c, _l) =>
    Effect.succeed({ items: [fakeTicket], nextCursor: null })
  // other methods left undefined; the smoke test only invokes listPaged.
} as unknown as TicketsShape)

const CurrentUserStub = Layer.succeed(CurrentUser, { id: "u-1" } as any)
const EmptyStub = <T>(tag: T) => Layer.succeed(tag as any, {} as any)

const TestLayer = Layer.mergeAll(
  CurrentUserStub,
  TicketsStub,
  EmptyStub(Projects),
  EmptyStub(Groups),
  EmptyStub(Tags),
  EmptyStub(Users),
  EmptyStub(BetterAuth)
)

describe("MCP dispatcher → list_tickets", () => {
  test("returns Page<Ticket>-shaped JSON envelope", async () => {
    const runtime = ManagedRuntime.make(TestLayer)

    const registered = new Map<
      string,
      (input: unknown) => Promise<{
        content: ReadonlyArray<{ type: "text"; text: string }>
        isError?: boolean
      }>
    >()
    const fakeServer = {
      registerTool: (
        name: string,
        _meta: unknown,
        cb: (input: unknown) => Promise<any>
      ) => {
        registered.set(name, cb)
      }
    } as any

    registerAllTools(fakeServer, runtime as any, handlers as any)

    const cb = registered.get("list_tickets")
    expect(cb).toBeDefined()
    const result = await cb!({
      orgSlug: "acme",
      projectSlug: "demo",
      limit: 10
    })

    expect(result.isError).toBeUndefined()
    const text = result.content[0].text
    const payload = JSON.parse(text)
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0].id).toBe("T-1")
    expect(payload.nextCursor).toBeNull()

    await runtime.dispose()
  })
})
```

- [ ] **Step 3: Run, expect pass.**

```bash
bun --filter=@projectproject/backend test handlers.test.ts
```
Expected: PASS. The runtime types are deliberately erased with `as any` in the stubs — this is a smoke test, not a type-fidelity test; service shape tests live next to the services.

- [ ] **Step 4: Commit.**

```bash
git add packages/backend/src/mcp/handlers.test.ts
git commit -m "test(backend): dispatcher smoke for list_tickets"
```

---

## Task 14: End-to-end verification

**Files:** none.

- [ ] **Step 1: Bring everything up.**

```bash
docker compose up -d
bun --filter=@projectproject/backend drizzle-kit migrate
bun --filter=@projectproject/backend dev &
bun --filter=@projectproject/frontend dev &
```

- [ ] **Step 2: Walk the inspector flow.**

```bash
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

Approve consent. From the inspector UI invoke, in order:

1. `me` → expect your user + roles.
2. `list_orgs` → expect a paged list including the orgs you belong to.
3. `get_org` for one of them → expect `{ slug, name, role }`.
4. `list_projects` for that org → expect a paged list.
5. `get_project` for one project → expect `ProjectDetail` with body + members.
6. `list_tickets` with `{ orgSlug, projectSlug }` → expect a paged ticket list.
7. `list_tickets` with `{ ..., filter: { status: ["todo"] } }` → expect only todo tickets.
8. `list_tickets` with `{ ..., filter: { status: [] } }` → expect an empty page.
9. `get_ticket` for an existing ticket → expect `TicketDetail` with raw markdown body.
10. `list_groups`, `get_group`, `list_tags`, `list_members`, `get_git_state` — each returns a sensible shape (no errors).

- [ ] **Step 3: Verify the acceptance scenario.**

In a fresh Claude Code session (or via the inspector), ask: "What's on the backlog for project X?" — Claude should call `list_tickets({ orgSlug, projectSlug, filter: { status: ["todo"] } })` and summarize the result. If it does, Plan 2 is shipped.

- [ ] **Step 4: Commit nothing — this is acceptance.**

---

## What ships after this plan

A complete read-only MCP surface over orgs, projects, groups, tickets, tags, members, and git state. Every list tool is paginated with opaque cursors; every detail tool returns the existing `*Detail` schema with raw markdown body verbatim; `list_tickets` filters server-side using the documented `TicketFilter` taxonomy. Doc-surface tools (`list_*_docs` / `get_*_doc`) stay as a follow-up plan; comments and writes follow after that.
