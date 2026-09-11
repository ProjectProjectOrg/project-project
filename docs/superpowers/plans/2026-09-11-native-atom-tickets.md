# Native Atom Data Layer — Foundations and Tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ticket detail and the backlog onto `AtomHttpApi` queries wrapped in per-view `Atom.optimistic`, so every ticket edit paints instantly and holds until that view's own refetch lands, and delete the settle-key and pending-map plumbing that currently fakes this.

**Architecture:** One `AtomHttpApi.Service` replaces the hand-rolled `ApiClient` plus `runtime`. Each view (ticket detail, backlog) gets one query, one `Atom.optimistic` wrapper over it, and mutations built with `Atom.optimisticFn` against that wrapper. Mutation input is exactly the API payload; family keys are request objects; reactivity keys live in the atom module. Components read a wrapper and call a setter.

**Tech Stack:** Effect v4 (`4.0.0-rc.112`), `effect/unstable/reactivity/{Atom,AtomHttpApi,AsyncResult,Reactivity,AtomRegistry}`, `@effect/atom-react`, React 19, TanStack Router, Vitest via `vite-plus`.

**Spec:** `docs/superpowers/specs/2026-09-11-native-atom-data-layer-design.md`

**Scope:** This plan covers spec stages 0 and 1 only (foundations plus tickets). Stages 2 (sprints), 3 (aggregate modules) and 4 (removal of `ApiClient`/`runtime.ts`) get their own plans once this lands. `packages/frontend/src/atoms/tickets.ts` therefore survives this plan in reduced form, holding only what sprints still import.

## Global Constraints

- Effect v4 only. Import from `effect/unstable/reactivity/...`, never from `@effect-atom/atom` or `@effect-atom/atom-react` for atom construction. React bindings (`useAtomValue`, `useAtomSet`, `useAtomRefresh`) come from `@effect/atom-react`.
- Read `node_modules/effect/AGENTS.md` before writing Effect code.
- Never add a pending map, settle key, preview merge, `suspendOnWaiting` hold, or React context to make an edit show instantly. Follow `.agents/skills/effect-atom-optimistic-updates/SKILL.md`.
- Mutation input types are the payload schemas from `@projectproject/shared`, unchanged. Path params come from the atom's family key.
- Reactivity keys use **array form** (`["tickets/acme/web"]`), never record form. Record form hashes the bare top-level key as well, so `{ tickets: [...] }` fires every atom registered under `tickets` and precision is impossible.
- Reuse the existing key strings exactly (`tickets/<scope>`, `ticket-lists/<scope>`, `ticket-title-query/<scope>`, `ticket-updated-query/<scope>`) so new atoms and legacy `tickets.ts`/`sprints.ts` atoms invalidate each other during the migration.
- Tests are Vitest at registry level with `vi.stubGlobal("fetch", ...)`, following `packages/frontend/src/atoms/tickets.sections.test.ts`.
- Commands: `bun run test` (all), `bun run test <path>` (one file), `bun run typecheck`, `vp fmt`, `vp lint`. Run from `packages/frontend`.
- Never run `npx prettier`. Use `vp fmt`.
- Commit after every task. Conventional commits with scope, e.g. `feat(atoms): ...`.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `packages/frontend/src/api/Api.ts` | The single `AtomHttpApi` client and its runtime |
| `packages/frontend/src/api/keys.ts` | Typed constructors for reactivity key strings |
| `packages/frontend/src/atoms/lib/results.ts` | Pure helpers to combine several `AsyncResult`s into one |
| `packages/frontend/src/atoms/ticketPatch.ts` | Pure functions applying an `UpdateTicketInput` to a ticket |
| `packages/frontend/src/atoms/ticketDetail.ts` | Detail query, wrapper, update/archive/unarchive/delete |
| `packages/frontend/src/atoms/backlog.ts` | Sections query, page queries, composed view, wrapper, mutations |
| `packages/frontend/src/atoms/ticketCounts.ts` | Counts query and wrapper for the project sidebar |
| `packages/frontend/src/atoms/ticketSearch.ts` | Ticket search query |

**Modified:** the ticket list components (`Row`, `SectionList`, `index`, `BacklogView`, `PriorityField`, `TypeField`, `AssigneeField`, `StatusField`), `TicketHoverCard`, `Breadcrumbs`, the project and ticket routes, `packages/frontend/src/atoms/tickets.ts` (reduced), `AGENTS.md`.

**Boundary rule:** the field components (`PriorityField`, `TypeField`, `AssigneeField`, `StatusField`) become presentational. They take `onPatch` and `waiting` props and contain no atoms. This is what lets the backlog move to the new layer in this plan while the sprint board keeps using legacy `updateTicketAtom` until stage 2.

---

### Task 1: The Api client and reactivity keys

**Files:**
- Create: `packages/frontend/src/api/Api.ts`
- Create: `packages/frontend/src/api/keys.ts`
- Test: `packages/frontend/src/api/Api.test.ts`

**Interfaces:**
- Consumes: `AppApi` from `@projectproject/shared`.
- Produces: `Api` (with `Api.query`, `Api.mutation`, `Api.runtime`, `Api.use`), `projectScope(orgSlug, slug): string`, and `Keys` with members `ticket`, `ticketsIn`, `ticketLists`, `ticketPages`, `ticketTitleQuery`, `ticketUpdatedQuery`, each returning a `string`.

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/api/Api.test.ts`:

```ts
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Api } from "./Api"
import { Keys, projectScope } from "./keys"

afterEach(() => vi.unstubAllGlobals())

describe("Api", () => {
  it("shares one atom and one request between structurally equal queries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ total: 0, byStatus: {} })))
    )
    const request = {
      params: { orgSlug: "acme", slug: "web" },
      query: {},
      reactivityKeys: [Keys.ticketsIn(projectScope("acme", "web"))],
      timeToLive: "2 minutes"
    } as const
    const a = Api.query("tickets", "count", { ...request })
    const b = Api.query("tickets", "count", { ...request })
    expect(a).toBe(b)

    const registry = AtomRegistry.make()
    registry.mount(a)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(a))).toBe(true)
      )
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      registry.dispose()
    }
  })
})

describe("keys", () => {
  it("builds the legacy key strings so old and new atoms interoperate", () => {
    const scope = projectScope("acme", "web")
    expect(scope).toBe("acme/web")
    expect(Keys.ticketsIn(scope)).toBe("tickets/acme/web")
    expect(Keys.ticketLists(scope)).toBe("ticket-lists/acme/web")
    expect(Keys.ticket(scope, "T-1" as never)).toBe("ticket-content/acme/web/T-1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/api/Api.test.ts`
Expected: FAIL — cannot resolve `./Api` and `./keys`.

- [ ] **Step 3: Write the keys module**

Create `packages/frontend/src/api/keys.ts`:

```ts
import type { TicketId } from "@projectproject/shared"

/** `orgSlug/slug` — the string every project-scoped reactivity key is built on. */
export const projectScope = (orgSlug: string, slug: string): string =>
  `${orgSlug}/${slug}`

/**
 * Reactivity keys, array form only.
 *
 * Record form (`{ tickets: [...] }`) also hashes the bare key `tickets`, which
 * every ticket query would register under, so any ticket mutation would refresh
 * every ticket query. Array form keeps invalidation precise.
 *
 * These strings intentionally match the ones the legacy `atoms/tickets.ts` and
 * `atoms/sprints.ts` already use, so during the migration a legacy mutation
 * refreshes the new atoms and vice versa.
 */
export const Keys = {
  /** One ticket's content, wherever it is shown. */
  ticket: (scope: string, id: TicketId): string => `ticket-content/${scope}/${id}`,
  /** Any query whose rows are tickets in this project. */
  ticketsIn: (scope: string): string => `tickets/${scope}`,
  /** Any list/section/board projection of this project's tickets. */
  ticketLists: (scope: string): string => `ticket-lists/${scope}`,
  /** Cursor pages loaded on top of a backlog section. */
  ticketPages: (scope: string): string => `ticket-pages/${scope}`,
  /** Queries whose ordering or matching depends on ticket titles. */
  ticketTitleQuery: (scope: string): string => `ticket-title-query/${scope}`,
  /** Queries whose ordering or matching depends on `updatedAt`. */
  ticketUpdatedQuery: (scope: string): string => `ticket-updated-query/${scope}`
} as const
```

- [ ] **Step 4: Write the Api client**

Create `packages/frontend/src/api/Api.ts`:

```ts
import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as AtomHttpApi from "effect/unstable/reactivity/AtomHttpApi"
import { AppApi } from "@projectproject/shared"

/**
 * `globalThis.fetch` is resolved per call rather than captured at layer build
 * time. Tests replace it with `vi.stubGlobal("fetch", ...)` after the layer has
 * been built, and that only works if the lookup is deferred. Do not inline
 * `FetchHttpClient.layer` here.
 */
const httpClient = Layer.provide(
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.Fetch, ((request, init) =>
    globalThis.fetch(request, init)) as typeof globalThis.fetch)
)

/**
 * The frontend's single API client.
 *
 * - `Api.query(group, endpoint, request)` is the only way to read server state.
 *   The request object is the cache key, so two structurally equal requests
 *   share one atom and one in-flight fetch.
 * - `Api.runtime.fn(...)` builds mutation bodies that can reach the client.
 * - `Api.use((client) => ...)` calls an endpoint inside an Effect.
 */
export class Api extends AtomHttpApi.Service<Api>()("Api", {
  api: AppApi,
  httpClient,
  baseUrl: "/api"
}) {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test src/api/Api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck, format, lint**

Run: `bun run typecheck && vp fmt && vp lint`
Expected: clean, pre-existing warnings only.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/api
git commit -m "feat(api): add the AtomHttpApi client and reactivity key vocabulary"
```

---

### Task 2: Pure helpers for patches and result composition

**Files:**
- Create: `packages/frontend/src/atoms/ticketPatch.ts`
- Create: `packages/frontend/src/atoms/lib/results.ts`
- Test: `packages/frontend/src/atoms/ticketPatch.test.ts`
- Test: `packages/frontend/src/atoms/lib/results.test.ts`

**Interfaces:**
- Produces: `applyTicketPatch(ticket: Ticket, patch: UpdateTicketInput): Ticket`, `applyTicketDetailPatch(ticket: TicketDetail, patch: UpdateTicketInput): TicketDetail`, `Results.blocked(parts): AsyncResult<never, E> | undefined`, `Results.meta(parts): { waiting: boolean; timestamp: number }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/frontend/src/atoms/ticketPatch.test.ts`:

```ts
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"
import { TicketId, TicketStatus, type TicketDetail } from "@projectproject/shared"
import { applyTicketDetailPatch, applyTicketPatch } from "./ticketPatch"

const base = {
  id: Schema.decodeSync(TicketId)("T-1"),
  title: "Before",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: "chore",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  body: "Before"
} satisfies TicketDetail

describe("applyTicketPatch", () => {
  it("overrides only the provided fields", () => {
    const next = applyTicketPatch(base, { priority: "high" })
    expect(next.priority).toBe("high")
    expect(next.title).toBe("Before")
  })

  it("ignores body, which is not part of a list row", () => {
    const next = applyTicketPatch(base, { body: "After" })
    expect(next).not.toHaveProperty("body", "After")
  })
})

describe("applyTicketDetailPatch", () => {
  it("also applies body", () => {
    const next = applyTicketDetailPatch(base, { body: "After", title: "Next" })
    expect(next.body).toBe("After")
    expect(next.title).toBe("Next")
  })
})
```

Create `packages/frontend/src/atoms/lib/results.test.ts`:

```ts
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { describe, expect, it } from "vitest"
import { Results } from "./results"

describe("Results.blocked", () => {
  it("returns undefined when everything succeeded", () => {
    expect(
      Results.blocked([AsyncResult.success(1), AsyncResult.success(2)])
    ).toBeUndefined()
  })

  it("returns the first non-success", () => {
    const initial = AsyncResult.initial<number>()
    expect(Results.blocked([AsyncResult.success(1), initial])).toBe(initial)
  })
})

describe("Results.meta", () => {
  it("is waiting when any part is waiting and takes the newest timestamp", () => {
    const older = AsyncResult.success(1, { timestamp: 10 })
    const newer = AsyncResult.success(2, { timestamp: 20, waiting: true })
    expect(Results.meta([older, newer])).toEqual({ waiting: true, timestamp: 20 })
  })

  it("is not waiting when every part settled", () => {
    const a = AsyncResult.success(1, { timestamp: 30 })
    const b = AsyncResult.success(2, { timestamp: 25 })
    expect(Results.meta([a, b])).toEqual({ waiting: false, timestamp: 30 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/atoms/ticketPatch.test.ts src/atoms/lib/results.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the patch helpers**

Create `packages/frontend/src/atoms/ticketPatch.ts`. This is the existing
`applyOptimisticTicketPreview` / `applyOptimisticTicketUpdate` pair, moved out
of `atoms/tickets.ts` and renamed:

```ts
import type { Ticket, TicketDetail, UpdateTicketInput } from "@projectproject/shared"

/** Apply a server patch to a list row. Fields absent from the patch are kept. */
export function applyTicketPatch(
  ticket: Ticket,
  patch: UpdateTicketInput
): Ticket {
  return {
    ...ticket,
    title: patch.title ?? ticket.title,
    status: patch.status ?? ticket.status,
    type: patch.type ?? ticket.type,
    priority: patch.priority ?? ticket.priority,
    tags: patch.tags ?? ticket.tags,
    assignees: patch.assignees ?? ticket.assignees
  }
}

/** Same, for the detail view, which also owns `body`. */
export function applyTicketDetailPatch(
  ticket: TicketDetail,
  patch: UpdateTicketInput
): TicketDetail {
  return {
    ...applyTicketPatch(ticket, patch),
    body: patch.body ?? ticket.body
  }
}
```

- [ ] **Step 4: Write the result helpers**

Create `packages/frontend/src/atoms/lib/results.ts`:

```ts
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"

type AnyResult = AsyncResult.AsyncResult<any, any>

/**
 * Combine several `AsyncResult`s that back one rendered region.
 *
 * `Atom.optimistic` only drops its overlay when the wrapped source emits a
 * non-waiting Success with a timestamp at least as new as the optimistic value.
 * A region assembled from several queries must therefore report `waiting: true`
 * while any of them is in flight, and carry the newest contributing timestamp.
 * Getting this wrong reintroduces the flicker this whole design removes.
 */
export const Results = {
  /** The first part that is not a Success, or `undefined` when all succeeded. */
  blocked: <E>(
    parts: ReadonlyArray<AsyncResult.AsyncResult<unknown, E>>
  ): AsyncResult.AsyncResult<never, E> | undefined => {
    for (const part of parts) {
      if (!AsyncResult.isSuccess(part)) {
        return part as AsyncResult.AsyncResult<never, E>
      }
    }
    return undefined
  },

  /** Waiting if any part is waiting; timestamp is the newest across parts. */
  meta: (
    parts: ReadonlyArray<AnyResult>
  ): { readonly waiting: boolean; readonly timestamp: number } => {
    let waiting = false
    let timestamp = 0
    for (const part of parts) {
      if (part.waiting) waiting = true
      if (AsyncResult.isSuccess(part) && part.timestamp > timestamp) {
        timestamp = part.timestamp
      }
    }
    return { waiting, timestamp }
  }
} as const
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/atoms/ticketPatch.test.ts src/atoms/lib/results.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/atoms/ticketPatch.ts packages/frontend/src/atoms/ticketPatch.test.ts packages/frontend/src/atoms/lib
git commit -m "feat(atoms): add pure ticket patch and result composition helpers"
```

---

### Task 3: Ticket detail wrapper and update mutation

**Files:**
- Create: `packages/frontend/src/atoms/ticketDetail.ts`
- Test: `packages/frontend/src/atoms/ticketDetail.test.ts`

**Interfaces:**
- Consumes: `Api`, `Keys`, `projectScope` (Task 1); `applyTicketDetailPatch` (Task 2).
- Produces: `TicketRequest`, `ticketRequest(orgSlug, slug, id): TicketRequest`, `ticketDetail(req)`, `updateTicketDetail(req)`, `archiveTicket(req)`, `unarchiveTicket(req)`, `deleteTicket(req)`.

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/atoms/ticketDetail.test.ts`:

```ts
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TicketDetail, TicketId, TicketStatus } from "@projectproject/shared"
import { ticketDetail, ticketRequest, updateTicketDetail } from "./ticketDetail"

const ticket = {
  id: Schema.decodeSync(TicketId)("T-1"),
  title: "Before",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: "chore",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  body: "Before"
} satisfies TicketDetail

const encode = Schema.encodeSync(TicketDetail)
const req = ticketRequest("acme", "web", ticket.id)

afterEach(() => vi.unstubAllGlobals())

describe("ticket detail optimistic update", () => {
  it("paints instantly, holds until the refetch lands, then shows server truth", async () => {
    let served = ticket
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(Response.json(encode(served)))
      })
    )
    const registry = AtomRegistry.make()
    const view = ticketDetail(req)
    registry.mount(view)
    registry.mount(updateTicketDetail(req))
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ _tag: "Success", waiting: false })
      )

      registry.set(updateTicketDetail(req), { priority: "high" })
      expect(registry.get(view)).toMatchObject({
        waiting: true,
        value: { priority: "high" }
      })

      // A stale GET resolving mid-transition must not be shown.
      served = ticket
      expect(registry.get(view)).toMatchObject({ value: { priority: "high" } })

      const confirmed = { ...ticket, priority: "high" as const, title: "Renamed by server" }
      served = confirmed
      finish(Response.json(encode(confirmed)))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.priority).toBe("high")
      expect(settled.value.title).toBe("Renamed by server")
    } finally {
      registry.dispose()
    }
  })

  it("rolls back when the mutation fails", async () => {
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(Response.json(encode(ticket)))
      })
    )
    const registry = AtomRegistry.make()
    const view = ticketDetail(req)
    registry.mount(view)
    registry.mount(updateTicketDetail(req))
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ _tag: "Success", waiting: false })
      )
      registry.set(updateTicketDetail(req), { priority: "high" })
      expect(registry.get(view)).toMatchObject({ value: { priority: "high" } })

      finish(new Response("nope", { status: 500 }))

      await vi.waitFor(() =>
        expect(registry.get(updateTicketDetail(req)).waiting).toBe(false)
      )
      expect(registry.get(view)).toMatchObject({ value: { priority: "med" } })
    } finally {
      registry.dispose()
    }
  })

  it("stacks two rapid edits", async () => {
    const pending: Array<(r: Response) => void> = []
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => pending.push(resolve))
        }
        return Promise.resolve(Response.json(encode(ticket)))
      })
    )
    const registry = AtomRegistry.make()
    const view = ticketDetail(req)
    registry.mount(view)
    registry.mount(updateTicketDetail(req))
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ _tag: "Success", waiting: false })
      )
      registry.set(updateTicketDetail(req), { priority: "high" })
      registry.set(updateTicketDetail(req), { type: "bug" })
      expect(registry.get(view)).toMatchObject({
        value: { priority: "high", type: "bug" }
      })
    } finally {
      registry.dispose()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/atoms/ticketDetail.test.ts`
Expected: FAIL — cannot resolve `./ticketDetail`.

- [ ] **Step 3: Write the module**

Create `packages/frontend/src/atoms/ticketDetail.ts`:

```ts
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import type {
  ArchiveTicketInput,
  TicketId,
  UpdateTicketInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { applyTicketDetailPatch } from "./ticketPatch"

export interface TicketRequest {
  readonly params: {
    readonly orgSlug: string
    readonly slug: string
    readonly id: TicketId
  }
}

export const ticketRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): TicketRequest => ({ params: { orgSlug, slug, id } })

const scopeOf = (req: TicketRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

/**
 * Listens only to this ticket's own content key. It deliberately does NOT
 * listen to `ticketsIn`, because this view's own mutation publishes that key
 * for the backlog, and self-invalidation would refetch twice per edit.
 */
const ticketQuery = (req: TicketRequest) =>
  Api.query("tickets", "get", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.ticket(scopeOf(req), req.params.id)]
  })

/** The detail value every consumer reads. */
export const ticketDetail = Atom.family((req: TicketRequest) =>
  Atom.optimistic(ticketQuery(req))
)

/** Keys the OTHER views listen to, never ones `ticketQuery` registered. */
const publishFor = (req: TicketRequest, patch: UpdateTicketInput) => {
  const scope = scopeOf(req)
  const fields = Object.keys(patch)
  const contentOnly = fields.every((f) => f === "title" || f === "body")
  if (!contentOnly) {
    return [Keys.ticketsIn(scope), Keys.ticketLists(scope), Keys.ticketPages(scope)]
  }
  const keys = [Keys.ticketUpdatedQuery(scope)]
  if (patch.title !== undefined) {
    keys.push(Keys.ticketsIn(scope), Keys.ticketTitleQuery(scope))
  }
  return keys
}

export const updateTicketDetail = Atom.family((req: TicketRequest) =>
  Atom.optimisticFn(ticketDetail(req), {
    reducer: (current, patch: UpdateTicketInput) =>
      AsyncResult.map(current, (ticket) => applyTicketDetailPatch(ticket, patch)),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (patch: UpdateTicketInput) {
          const updated = yield* Api.use((client) =>
            client.tickets.update({ params: req.params, payload: patch })
          )
          // Show the confirmed server value before the refetch resolves.
          set(AsyncResult.success(updated))
          yield* Reactivity.invalidate(publishFor(req, patch))
          return updated
        })
      )
  })
)

export const archiveTicket = Atom.family((req: TicketRequest) =>
  Atom.optimisticFn(ticketDetail(req), {
    reducer: (current, _input: ArchiveTicketInput) =>
      AsyncResult.map(current, (ticket) =>
        ticket.archivedAt === null
          ? { ...ticket, archivedAt: new Date() }
          : ticket
      ),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: ArchiveTicketInput) {
          const updated = yield* Api.use((client) =>
            client.tickets.archive({ params: req.params, payload: input })
          )
          set(AsyncResult.success(updated))
          yield* Reactivity.invalidate([
            Keys.ticketsIn(scopeOf(req)),
            Keys.ticketLists(scopeOf(req)),
            Keys.ticketPages(scopeOf(req))
          ])
          return updated
        })
      )
  })
)

export const unarchiveTicket = Atom.family((req: TicketRequest) =>
  Atom.optimisticFn(ticketDetail(req), {
    reducer: (current, _input: void) =>
      AsyncResult.map(current, (ticket) => ({ ...ticket, archivedAt: null })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (_input: void) {
          const updated = yield* Api.use((client) =>
            client.tickets.unarchive({ params: req.params })
          )
          set(AsyncResult.success(updated))
          yield* Reactivity.invalidate([
            Keys.ticketsIn(scopeOf(req)),
            Keys.ticketLists(scopeOf(req)),
            Keys.ticketPages(scopeOf(req))
          ])
          return updated
        })
      )
  })
)

export const deleteTicket = Atom.family((req: TicketRequest) =>
  Api.runtime.fn(
    Effect.fn(function* (_input: void) {
      yield* Api.use((client) => client.tickets.delete({ params: req.params }))
      yield* Reactivity.invalidate([
        Keys.ticketsIn(scopeOf(req)),
        Keys.ticketLists(scopeOf(req)),
        Keys.ticketPages(scopeOf(req))
      ])
    })
  )
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/atoms/ticketDetail.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
bun run typecheck && vp fmt && vp lint
git add packages/frontend/src/atoms/ticketDetail.ts packages/frontend/src/atoms/ticketDetail.test.ts
git commit -m "feat(atoms): add the native ticket detail wrapper and mutations"
```

---

### Task 4: Backlog sections wrapper and value-field updates

**Files:**
- Create: `packages/frontend/src/atoms/backlog.ts`
- Test: `packages/frontend/src/atoms/backlog.test.ts`

**Interfaces:**
- Consumes: `Api`, `Keys`, `projectScope`, `Results`, `applyTicketPatch`.
- Produces: `BacklogRequest`, `backlogRequest(orgSlug, slug, query: TicketListQuery): BacklogRequest`, `BacklogRow`, `BacklogSection`, `BacklogValue`, `backlog(req)`, `updateBacklogTicket({ req, id })`.

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/atoms/backlog.test.ts`:

```ts
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TicketDetail, TicketId, TicketStatus } from "@projectproject/shared"
import { backlog, backlogRequest, updateBacklogTicket } from "./backlog"

const ticket = {
  id: Schema.decodeSync(TicketId)("T-1"),
  title: "Before",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: "chore",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  body: "Before"
} satisfies TicketDetail

const encode = Schema.encodeSync(TicketDetail)
const req = backlogRequest("acme", "web", { sort: { key: "id", dir: "asc" } })

const sections = (items: ReadonlyArray<TicketDetail>) =>
  Response.json({
    counts: { total: items.length, byStatus: { todo: items.length } },
    sections: { todo: { items: items.map(encode), nextCursor: null } }
  })

afterEach(() => vi.unstubAllGlobals())

describe("backlog optimistic update", () => {
  it("holds the preview until the sections refetch lands", async () => {
    let served = [ticket]
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(sections(served))
      })
    )
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const mutation = updateBacklogTicket({ req, id: ticket.id })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ _tag: "Success", waiting: false })
      )

      registry.set(mutation, { priority: "high" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) throw new Error("no optimistic value")
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value.sections.todo.items[0].ticket.priority).toBe("high")

      const confirmed = { ...ticket, priority: "high" as const }
      served = [confirmed]
      finish(Response.json(encode(confirmed)))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      // Never observed "med" again between paint and settle.
      expect(settled.value.sections.todo.items[0].ticket.priority).toBe("high")
    } finally {
      registry.dispose()
    }
  })

  it("reverts the row when the mutation fails", async () => {
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(sections([ticket]))
      })
    )
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const mutation = updateBacklogTicket({ req, id: ticket.id })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ _tag: "Success", waiting: false })
      )
      registry.set(mutation, { priority: "high" })
      finish(new Response("nope", { status: 500 }))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.sections.todo.items[0].ticket.priority).toBe("med")
    } finally {
      registry.dispose()
    }
  })

  it("shares one atom between structurally equal requests", () => {
    const a = backlogRequest("acme", "web", { sort: { key: "id", dir: "asc" } })
    const b = backlogRequest("acme", "web", { sort: { key: "id", dir: "asc" } })
    expect(backlog(a)).toBe(backlog(b))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/atoms/backlog.test.ts`
Expected: FAIL — cannot resolve `./backlog`.

- [ ] **Step 3: Write the module**

Create `packages/frontend/src/atoms/backlog.ts`:

```ts
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import {
  ticketListQueryToSearch,
  type Ticket,
  type TicketCounts,
  type TicketId,
  type TicketListQuery,
  type UpdateTicketInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { Results } from "./lib/results"
import { applyTicketPatch } from "./ticketPatch"

export interface BacklogRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
  readonly query: Record<string, string | ReadonlyArray<string>>
}

/**
 * Build the request that identifies one backlog. Status filter and cursor are
 * dropped because the sections endpoint returns every status with its own first
 * page. This replaces the old `ticketsSectionsKey` string builder.
 */
export const backlogRequest = (
  orgSlug: string,
  slug: string,
  query: TicketListQuery
): BacklogRequest => ({
  params: { orgSlug, slug },
  query: ticketListQueryToSearch({
    ...query,
    filter: { ...query.filter, status: undefined },
    cursor: undefined
  })
})

const scopeOf = (req: BacklogRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export interface BacklogRow {
  readonly ticket: Ticket
  /** React key. Equals the ticket id except for rows created in this session. */
  readonly key: string
  readonly pending: boolean
}

export interface BacklogSection {
  readonly items: ReadonlyArray<BacklogRow>
  readonly nextCursor: string | null
}

export interface BacklogValue {
  readonly counts: TicketCounts
  readonly sections: Readonly<Record<string, BacklogSection>>
}

const toRow = (ticket: Ticket): BacklogRow => ({
  ticket,
  key: ticket.id,
  pending: false
})

const sectionsQuery = (req: BacklogRequest) =>
  Api.query("tickets", "sections", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.ticketsIn(scopeOf(req))]
  })

/**
 * The composed backlog value. Task 6 extends this readable with loaded cursor
 * pages; the wrapper below never changes.
 */
const backlogView = (req: BacklogRequest) =>
  Atom.readable(
    (get) => {
      const base = get(sectionsQuery(req))
      const blocked = Results.blocked([base])
      if (blocked) return blocked
      if (!AsyncResult.isSuccess(base)) return base
      const sections: Record<string, BacklogSection> = {}
      for (const [status, page] of Object.entries(base.value.sections)) {
        sections[status] = {
          items: page.items.map(toRow),
          nextCursor: page.nextCursor
        }
      }
      const { waiting, timestamp } = Results.meta([base])
      return AsyncResult.success<BacklogValue>(
        { counts: base.value.counts, sections },
        { waiting, timestamp }
      )
    },
    (refresh) => refresh(sectionsQuery(req))
  )

/** The value every backlog consumer reads. */
export const backlog = Atom.family((req: BacklogRequest) =>
  Atom.optimistic(backlogView(req))
)

const patchRow = (
  value: BacklogValue,
  id: TicketId,
  patch: UpdateTicketInput
): BacklogValue => {
  const sections: Record<string, BacklogSection> = {}
  for (const [status, section] of Object.entries(value.sections)) {
    sections[status] = {
      ...section,
      items: section.items.map((row) =>
        row.ticket.id === id
          ? { ...row, ticket: applyTicketPatch(row.ticket, patch) }
          : row
      )
    }
  }
  return { ...value, sections }
}

const replaceRow = (value: BacklogValue, ticket: Ticket): BacklogValue => {
  const sections: Record<string, BacklogSection> = {}
  for (const [status, section] of Object.entries(value.sections)) {
    sections[status] = {
      ...section,
      items: section.items.map((row) =>
        row.ticket.id === ticket.id ? { ...row, ticket } : row
      )
    }
  }
  return { ...value, sections }
}

export const updateBacklogTicket = Atom.family(
  ({ req, id }: { readonly req: BacklogRequest; readonly id: TicketId }) =>
    Atom.optimisticFn(backlog(req), {
      reducer: (current, patch: UpdateTicketInput) =>
        AsyncResult.map(current, (value) => patchRow(value, id, patch)),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (patch: UpdateTicketInput, get) {
            const updated = yield* Api.use((client) =>
              client.tickets.update({
                params: { ...req.params, id },
                payload: patch
              })
            )
            set(
              AsyncResult.map(get(backlog(req)), (value) =>
                replaceRow(value, updated)
              )
            )
            // Only keys other views listen to. `ticketsIn` is registered by
            // this view's own query, so publishing it here would refetch twice.
            yield* Reactivity.invalidate([
              Keys.ticket(scopeOf(req), id),
              Keys.ticketLists(scopeOf(req))
            ])
            return updated
          })
        )
    })
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/atoms/backlog.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
bun run typecheck && vp fmt && vp lint
git add packages/frontend/src/atoms/backlog.ts packages/frontend/src/atoms/backlog.test.ts
git commit -m "feat(atoms): add the native backlog wrapper and ticket update"
```

---

### Task 5: Status moves through the same backlog mutation

A status change is `updateBacklogTicket({ req, id })` called with `{ status }`.
The reducer must also move the row between sections and adjust counts, which
retires `updateTicketStatusAtom` and `pendingTicketStatusChangesAtom`.

**Files:**
- Modify: `packages/frontend/src/atoms/backlog.ts` (`patchRow`)
- Test: `packages/frontend/src/atoms/backlog.test.ts` (append)

**Interfaces:**
- Consumes: Task 4's `patchRow`, `BacklogValue`.
- Produces: no new exports; `updateBacklogTicket` now handles `{ status }`.

- [ ] **Step 1: Write the failing test**

Append to `packages/frontend/src/atoms/backlog.test.ts`:

```ts
describe("backlog status move", () => {
  it("moves the row between sections and adjusts counts", async () => {
    const doing = Schema.decodeSync(TicketStatus)("in_progress")
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(
          Response.json({
            counts: { total: 1, byStatus: { todo: 1, in_progress: 0 } },
            sections: {
              todo: { items: [encode(ticket)], nextCursor: null },
              in_progress: { items: [], nextCursor: null }
            }
          })
        )
      })
    )
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const mutation = updateBacklogTicket({ req, id: ticket.id })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ _tag: "Success", waiting: false })
      )
      registry.set(mutation, { status: doing })

      const moved = registry.get(view)
      if (!AsyncResult.isSuccess(moved)) throw new Error("no optimistic value")
      expect(moved.value.sections.todo.items).toHaveLength(0)
      expect(moved.value.sections.in_progress.items[0].ticket.id).toBe(ticket.id)
      expect(moved.value.counts.byStatus.todo).toBe(0)
      expect(moved.value.counts.byStatus.in_progress).toBe(1)
      expect(moved.value.counts.total).toBe(1)

      finish(Response.json(encode({ ...ticket, status: doing })))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/atoms/backlog.test.ts`
Expected: FAIL — row stays in `todo`, counts unchanged.

- [ ] **Step 3: Make `patchRow` structural**

Replace `patchRow` in `packages/frontend/src/atoms/backlog.ts` with:

```ts
const patchRow = (
  value: BacklogValue,
  id: TicketId,
  patch: UpdateTicketInput
): BacklogValue => {
  let moved: BacklogRow | undefined
  let from: string | undefined
  const sections: Record<string, BacklogSection> = {}

  for (const [status, section] of Object.entries(value.sections)) {
    const items: Array<BacklogRow> = []
    for (const row of section.items) {
      if (row.ticket.id !== id) {
        items.push(row)
        continue
      }
      const next = { ...row, ticket: applyTicketPatch(row.ticket, patch) }
      // A status patch relocates the row; anything else edits it in place.
      if (patch.status !== undefined && patch.status !== status) {
        moved = next
        from = status
      } else {
        items.push(next)
      }
    }
    sections[status] = { ...section, items }
  }

  if (!moved || patch.status === undefined) return { ...value, sections }

  const target = sections[patch.status] ?? { items: [], nextCursor: null }
  sections[patch.status] = {
    ...target,
    items: [moved, ...target.items.filter((row) => row.ticket.id !== id)]
  }

  const byStatus = { ...value.counts.byStatus }
  if (from !== undefined) {
    byStatus[from] = Math.max(0, (byStatus[from] ?? 0) - 1)
  }
  byStatus[patch.status] = (byStatus[patch.status] ?? 0) + 1

  return { counts: { total: value.counts.total, byStatus }, sections }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/atoms/backlog.test.ts`
Expected: PASS (4 tests). The Task 4 tests must still pass — a non-status patch takes the in-place branch.

- [ ] **Step 5: Commit**

```bash
bun run typecheck && vp fmt && vp lint
git add packages/frontend/src/atoms/backlog.ts packages/frontend/src/atoms/backlog.test.ts
git commit -m "feat(atoms): move backlog rows between sections on status change"
```

---

### Task 6: Backlog pagination as composed queries

Load-more pages become their own `Api.query` atoms listed in a small state atom,
so they survive the wrapper's commit refresh instead of being invalidated by a
timestamp comparison.

**Files:**
- Modify: `packages/frontend/src/atoms/backlog.ts`
- Test: `packages/frontend/src/atoms/backlog.test.ts` (append)

**Interfaces:**
- Produces: `loadMoreBacklog({ req, status })` — an `Api.runtime.fn` taking `void`.
- Changes: `backlogView` now reads page queries; `updateBacklogTicket` also publishes `Keys.ticketPages`.

- [ ] **Step 1: Write the failing test**

Append to `packages/frontend/src/atoms/backlog.test.ts`:

```ts
describe("backlog pagination", () => {
  it("keeps loaded pages across an optimistic commit refresh", async () => {
    const second = { ...ticket, id: Schema.decodeSync(TicketId)("T-2") }
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        if (url.pathname.endsWith("/sections")) {
          return Promise.resolve(
            Response.json({
              counts: { total: 2, byStatus: { todo: 2 } },
              sections: {
                todo: { items: [encode(ticket)], nextCursor: "cursor-1" }
              }
            })
          )
        }
        return Promise.resolve(
          Response.json({ items: [encode(second)], nextCursor: null })
        )
      })
    )
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const mutation = updateBacklogTicket({ req, id: ticket.id })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ _tag: "Success", waiting: false })
      )
      registry.set(loadMoreBacklog({ req, status: "todo" }), undefined)
      await vi.waitFor(() => {
        const loaded = registry.get(view)
        if (!AsyncResult.isSuccess(loaded)) throw new Error("not loaded")
        expect(loaded.value.sections.todo.items).toHaveLength(2)
      })

      registry.set(mutation, { priority: "high" })
      finish(Response.json(encode({ ...ticket, priority: "high" })))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.sections.todo.items.map((r) => r.ticket.id)).toEqual([
        "T-1",
        "T-2"
      ])
    } finally {
      registry.dispose()
    }
  })
})
```

Add `loadMoreBacklog` to the import at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/atoms/backlog.test.ts`
Expected: FAIL — `loadMoreBacklog` is not exported.

- [ ] **Step 3: Add page queries and the loaded-cursor state**

Insert into `packages/frontend/src/atoms/backlog.ts`, above `backlogView`:

```ts
/** Cursors the user has loaded, per status. Client view state, not cache. */
const loadedPagesAtom = Atom.family((_req: BacklogRequest) =>
  Atom.make<Readonly<Record<string, ReadonlyArray<string>>>>({}).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

/**
 * One cursor page. Registers `ticketPages` as well as `ticketsIn` so a mutation
 * can refresh pages without also re-invalidating the sections query, which the
 * optimistic wrapper already refreshes on commit.
 */
const pageQuery = (req: BacklogRequest, status: string, cursor: string) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: { ...req.query, status: [status], cursor },
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.ticketsIn(scopeOf(req)), Keys.ticketPages(scopeOf(req))]
  })

const dedupeById = (rows: ReadonlyArray<BacklogRow>): ReadonlyArray<BacklogRow> => {
  const seen = new Set<string>()
  const out: Array<BacklogRow> = []
  for (const row of rows) {
    if (seen.has(row.ticket.id)) continue
    seen.add(row.ticket.id)
    out.push(row)
  }
  return out
}
```

- [ ] **Step 4: Compose pages into the view**

Replace `backlogView` in `packages/frontend/src/atoms/backlog.ts` with:

```ts
const backlogView = (req: BacklogRequest) =>
  Atom.readable(
    (get) => {
      const base = get(sectionsQuery(req))
      if (!AsyncResult.isSuccess(base)) return base
      const loaded = get(loadedPagesAtom(req))
      const parts: Array<AsyncResult.AsyncResult<unknown, unknown>> = [base]
      const sections: Record<string, BacklogSection> = {}

      for (const [status, page] of Object.entries(base.value.sections)) {
        const rows: Array<BacklogRow> = page.items.map(toRow)
        let nextCursor = page.nextCursor
        for (const cursor of loaded[status] ?? []) {
          const result = get(pageQuery(req, status, cursor))
          parts.push(result)
          // A failed page keeps its cursor so the user can retry; it must not
          // fail the whole section.
          if (!AsyncResult.isSuccess(result)) continue
          for (const ticket of result.value.items) rows.push(toRow(ticket))
          nextCursor = result.value.nextCursor
        }
        sections[status] = { items: dedupeById(rows), nextCursor }
      }

      const { waiting, timestamp } = Results.meta(parts)
      return AsyncResult.success<BacklogValue>(
        { counts: base.value.counts, sections },
        { waiting, timestamp }
      )
    },
    (refresh) => refresh(sectionsQuery(req))
  )
```

- [ ] **Step 5: Add the load-more mutation**

Append to `packages/frontend/src/atoms/backlog.ts`:

```ts
export const loadMoreBacklog = Atom.family(
  ({ req, status }: { readonly req: BacklogRequest; readonly status: string }) =>
    Api.runtime.fn(
      Effect.fn(function* (_input: void, get) {
        const current = get(backlog(req))
        if (!AsyncResult.isSuccess(current)) return
        const cursor = current.value.sections[status]?.nextCursor
        if (!cursor) return
        const loaded = get(loadedPagesAtom(req))
        const cursors = loaded[status] ?? []
        if (cursors.includes(cursor)) return
        get.set(loadedPagesAtom(req), {
          ...loaded,
          [status]: [...cursors, cursor]
        })
      })
    )
)
```

- [ ] **Step 6: Publish the pages key from the update mutation**

In `updateBacklogTicket`, change the invalidate call to:

```ts
            yield* Reactivity.invalidate([
              Keys.ticket(scopeOf(req), id),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req))
            ])
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun run test src/atoms/backlog.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
bun run typecheck && vp fmt && vp lint
git add packages/frontend/src/atoms/backlog.ts packages/frontend/src/atoms/backlog.test.ts
git commit -m "feat(atoms): compose backlog cursor pages into the optimistic view"
```

---

### Task 7: Quick create

**Files:**
- Modify: `packages/frontend/src/atoms/backlog.ts`
- Test: `packages/frontend/src/atoms/backlog.test.ts` (append)

**Interfaces:**
- Produces: `QuickCreateArg` (`{ ticket: QuickCreateTicketInput; viewerId: string; projectPrefix: string; clientId: string }`) and `quickCreateBacklogTicket(req)`.

- [ ] **Step 1: Write the failing test**

Append to `packages/frontend/src/atoms/backlog.test.ts`:

```ts
describe("backlog quick create", () => {
  it("keeps the caller's row key when the server row arrives", async () => {
    const created = {
      ...ticket,
      id: Schema.decodeSync(TicketId)("T-9"),
      title: "Created"
    }
    let served = [ticket]
    let finish = (_r: Response) => {}
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Promise<Response>((resolve) => {
            finish = resolve
          })
        }
        return Promise.resolve(sections(served))
      })
    )
    const registry = AtomRegistry.make()
    const view = backlog(req)
    const create = quickCreateBacklogTicket(req)
    registry.mount(view)
    registry.mount(create)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ _tag: "Success", waiting: false })
      )
      registry.set(create, {
        ticket: { title: "Created", status: ticket.status },
        viewerId: "user-1",
        projectPrefix: "T",
        clientId: "creation-1"
      })

      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) throw new Error("no optimistic value")
      expect(optimistic.value.sections.todo.items[0]).toMatchObject({
        key: "creation-1",
        pending: true
      })

      served = [created, ticket]
      finish(Response.json(encode(created)))
      await vi.waitFor(() => expect(registry.get(create).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(
        settled.value.sections.todo.items.map(({ key, pending }) => ({ key, pending }))
      ).toEqual([
        { key: "creation-1", pending: false },
        { key: "T-1", pending: false }
      ])
    } finally {
      registry.dispose()
    }
  })
})
```

Add `quickCreateBacklogTicket` to the test file's imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/atoms/backlog.test.ts`
Expected: FAIL — `quickCreateBacklogTicket` is not exported.

- [ ] **Step 3: Add the created-key index and the mutation**

Append to `packages/frontend/src/atoms/backlog.ts`:

```ts
/**
 * Maps a server ticket id to the client key its row was created with, so the
 * row keeps its React identity when the optimistic placeholder is replaced by
 * the real ticket. View state, not cache.
 */
const createdKeysAtom = Atom.family((_scope: string) =>
  Atom.make<ReadonlyMap<TicketId, string>>(new Map()).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

export interface QuickCreateArg {
  readonly ticket: QuickCreateTicketInput
  readonly viewerId: string
  readonly projectPrefix: string
  readonly clientId: string
}

const placeholderId = (
  taken: ReadonlyArray<BacklogRow>,
  prefix: string
): TicketId => {
  const used = new Set(taken.map((row) => row.ticket.id))
  let n = 999999
  while (used.has(`${prefix}-${n}` as TicketId)) n++
  return `${prefix}-${n}` as TicketId
}

export const quickCreateBacklogTicket = Atom.family((req: BacklogRequest) =>
  Atom.optimisticFn(backlog(req), {
    reducer: (current, input: QuickCreateArg) =>
      AsyncResult.map(current, (value) => {
        const status = input.ticket.status ?? "todo"
        const section = value.sections[status] ?? { items: [], nextCursor: null }
        const now = new Date()
        const predicted: Ticket = {
          id: placeholderId(section.items, input.projectPrefix),
          title: input.ticket.title,
          status,
          type: input.ticket.type ?? "other",
          priority: "med",
          tags: [],
          branch: null,
          pr: null,
          prState: null,
          lastTransitionedPr: null,
          gitState: { tag: "no_branch", baseBranch: "" },
          assignees: [],
          archivedAt: null,
          createdBy: input.viewerId,
          createdAt: now,
          updatedAt: now
        }
        return {
          counts: {
            total: value.counts.total + 1,
            byStatus: {
              ...value.counts.byStatus,
              [status]: (value.counts.byStatus[status] ?? 0) + 1
            }
          },
          sections: {
            ...value.sections,
            [status]: {
              ...section,
              items: [
                { ticket: predicted, key: input.clientId, pending: true },
                ...section.items
              ]
            }
          }
        }
      }),
    fn: Api.runtime.fn(
      Effect.fn(function* (input: QuickCreateArg, get) {
        const created = yield* Api.use((client) =>
          client.tickets.quickCreate({
            params: req.params,
            payload: input.ticket
          })
        )
        const index = createdKeysAtom(scopeOf(req))
        get.set(index, new Map(get(index)).set(created.id, input.clientId))
        yield* Reactivity.invalidate([
          Keys.ticketLists(scopeOf(req)),
          Keys.ticketPages(scopeOf(req))
        ])
        return created
      })
    )
  })
)
```

Add `QuickCreateTicketInput` to the `@projectproject/shared` type import.

- [ ] **Step 4: Apply the created-key index in the view**

In `backlogView`, replace the `sections[status] = { items: dedupeById(rows), ... }`
assignment so rows adopt their client key:

```ts
        const createdKeys = get(createdKeysAtom(scopeOf(req)))
        sections[status] = {
          items: dedupeById(rows).map((row) => ({
            ...row,
            key: createdKeys.get(row.ticket.id) ?? row.key
          })),
          nextCursor
        }
```

Read `createdKeys` once before the loop, not inside it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/atoms/backlog.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
bun run typecheck && vp fmt && vp lint
git add packages/frontend/src/atoms/backlog.ts packages/frontend/src/atoms/backlog.test.ts
git commit -m "feat(atoms): add optimistic quick create to the backlog view"
```

---

### Task 8: Counts and search modules

**Files:**
- Create: `packages/frontend/src/atoms/ticketCounts.ts`
- Create: `packages/frontend/src/atoms/ticketSearch.ts`
- Test: `packages/frontend/src/atoms/ticketCounts.test.ts`

**Interfaces:**
- Produces: `countsRequest(orgSlug, slug, query: TicketCountQuery)`, `ticketCounts(req)`, `searchRequest(orgSlug, slug, options)`, `ticketSearch(req)`.

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/atoms/ticketCounts.test.ts`:

```ts
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { afterEach, describe, expect, it, vi } from "vitest"
import { countsRequest, ticketCounts } from "./ticketCounts"

afterEach(() => vi.unstubAllGlobals())

describe("ticketCounts", () => {
  it("reads the counts endpoint and shares structurally equal requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(Response.json({ total: 3, byStatus: { todo: 3 } }))
      )
    )
    const a = countsRequest("acme", "web", {})
    const b = countsRequest("acme", "web", {})
    expect(ticketCounts(a)).toBe(ticketCounts(b))

    const registry = AtomRegistry.make()
    const view = ticketCounts(a)
    registry.mount(view)
    try {
      await vi.waitFor(() => {
        const result = registry.get(view)
        if (!AsyncResult.isSuccess(result)) throw new Error("not ready")
        expect(result.value.total).toBe(3)
      })
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      registry.dispose()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/atoms/ticketCounts.test.ts`
Expected: FAIL — cannot resolve `./ticketCounts`.

- [ ] **Step 3: Write the counts module**

Create `packages/frontend/src/atoms/ticketCounts.ts`:

```ts
import * as Atom from "effect/unstable/reactivity/Atom"
import {
  ticketListQueryToSearch,
  type TicketCountQuery
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export interface CountsRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
  readonly query: Record<string, string | ReadonlyArray<string>>
}

export const countsRequest = (
  orgSlug: string,
  slug: string,
  query: TicketCountQuery
): CountsRequest => ({
  params: { orgSlug, slug },
  query: ticketListQueryToSearch(query)
})

const countsQuery = (req: CountsRequest) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return Api.query("tickets", "count", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.ticketsIn(scope), Keys.ticketLists(scope)]
  })
}

/**
 * Counts are read by the project sidebar, which never mutates them directly.
 * The wrapper exists so a future count-affecting mutation has something to
 * target, and so `waiting` is available for the badge.
 */
export const ticketCounts = Atom.family((req: CountsRequest) =>
  Atom.optimistic(countsQuery(req))
)
```

- [ ] **Step 4: Write the search module**

Create `packages/frontend/src/atoms/ticketSearch.ts`:

```ts
import * as Atom from "effect/unstable/reactivity/Atom"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export interface TicketSearchOptions {
  readonly q?: string
  readonly excludeGroupId?: string
  readonly limit?: number
}

export interface SearchRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
  readonly query: Record<string, string>
}

export const searchRequest = (
  orgSlug: string,
  slug: string,
  options: TicketSearchOptions
): SearchRequest => ({
  params: { orgSlug, slug },
  query: {
    ...(options.q ? { q: options.q } : {}),
    ...(options.excludeGroupId ? { excludeGroupId: options.excludeGroupId } : {}),
    ...(options.limit ? { limit: String(options.limit) } : {})
  }
})

export const ticketSearch = Atom.family((req: SearchRequest) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return Api.query("tickets", "search", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scope),
      Keys.ticketLists(scope),
      Keys.ticketTitleQuery(scope)
    ]
  })
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test src/atoms/ticketCounts.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
bun run typecheck && vp fmt && vp lint
git add packages/frontend/src/atoms/ticketCounts.ts packages/frontend/src/atoms/ticketCounts.test.ts packages/frontend/src/atoms/ticketSearch.ts
git commit -m "feat(atoms): add native ticket counts and search queries"
```

---

### Task 9: Field components become presentational

Removes the atoms from the four field components so the backlog can move to the
new layer while the sprint board still uses legacy `updateTicketAtom`.

**Files:**
- Modify: `packages/frontend/src/components/TicketList/PriorityField.tsx`
- Modify: `packages/frontend/src/components/TicketList/TypeField.tsx`
- Modify: `packages/frontend/src/components/TicketList/AssigneeField.tsx`
- Modify: `packages/frontend/src/components/TicketList/StatusField.tsx`
- Modify: `packages/frontend/src/components/sprints/SprintBoardCard.tsx`
- Modify: `packages/frontend/src/components/TicketList/Row.tsx`

**Interfaces:**
- Produces the shared prop contract used by Tasks 10 and 11:
  ```ts
  interface TicketFieldProps {
    readonly onPatch: (patch: UpdateTicketInput) => void
    readonly waiting: boolean
  }
  ```
  `PriorityButton`, `TypeButton`, `AssigneeField`, `StatusButton`, and the
  matching `*BadgeTrigger` variants all take these two props plus their existing
  presentational props, and no longer take `orgSlug`, `slug`, `sprintTicketsKey`,
  `ticketSectionsKey`, `query`, or `countKey`.

- [ ] **Step 1: Convert `PriorityField`**

In `PriorityButton` and `PriorityBadgeTrigger`, delete the `useAtomSet` call,
the `updateTicketAtom` import, and the `orgSlug`, `slug`, `sprintTicketsKey`,
`ticketSectionsKey` props. Add `onPatch` and `waiting`. Replace each
`update({ priority: p, ... })` call with:

```tsx
onClick={() => {
  if (p === ticket.priority) return
  onPatch({ priority: p })
}}
```

Apply `waiting && "animate-pulse"` to the icon wrapper that displays the
current priority, not to the trigger.

- [ ] **Step 2: Convert `TypeField` the same way**

`onPatch({ type: t })` in place of `update({ type: t, ... })`.

- [ ] **Step 3: Convert `AssigneeField` the same way**

`onPatch({ assignees: next })` in place of `update({ assignees: next, ... })`.

- [ ] **Step 4: Convert `StatusField`**

Delete `updateTicketStatusAtom`, `pendingTicketStatusChangesAtom`,
`ticketsListKeyForStatus`, `ticketsCountKey` and `projectKey` usage from both
`StatusButton` and `StatusBadgeTrigger`. The current status comes from
`ticket.status` alone, because the caller now hands down an already-optimistic
ticket. Replace the `onSelect` body with:

```tsx
onSelect={(status) => {
  if (status === ticket.status) return
  onPatch({ status })
}}
```

Keep the `statuses` read from `projectStatusesAtom` — that is a different
resource and stays as it is.

- [ ] **Step 5: Update the two call sites to keep compiling**

In `Row.tsx`, keep the existing legacy `updateTicketAtom` wiring for now and
pass it down, so this task compiles on its own:

```tsx
const update = useAtomSet(updateTicketAtom(ticketKey(orgSlug, slug, ticket.id)))
const onPatch = (patch: UpdateTicketInput) =>
  update({ ...patch, ticketSectionsKey: ticketSectionsKeyValue })
```

In `SprintBoardCard.tsx`, do the same with `sprintTicketsKey`:

```tsx
const update = useAtomSet(updateTicketAtom(ticketKey(orgSlug, slug, ticket.id)))
const onPatch = (patch: UpdateTicketInput) => update({ ...patch, sprintTicketsKey })
```

Pass `onPatch` and `waiting={updatePreview.waiting}` to every field component.

- [ ] **Step 6: Verify nothing regressed**

Run: `bun run test && bun run typecheck`
Expected: the full suite passes, same counts as before this task.

- [ ] **Step 7: Commit**

```bash
vp fmt && vp lint
git add packages/frontend/src/components
git commit -m "refactor(tickets): make the ticket field components presentational"
```

---

### Task 10: Backlog components move to the native layer

**Files:**
- Modify: `packages/frontend/src/components/TicketList/index.tsx`
- Modify: `packages/frontend/src/components/TicketList/SectionList.tsx`
- Modify: `packages/frontend/src/components/TicketList/Row.tsx`
- Modify: `packages/frontend/src/components/TicketList/BacklogView.tsx`
- Modify: `packages/frontend/src/components/TicketList/BacklogTicketCreator.tsx`
- Modify: `packages/frontend/src/components/TicketList/SectionTicketCreator.tsx`
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/index.tsx`
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx`

**Interfaces:**
- Consumes: `backlog`, `backlogRequest`, `updateBacklogTicket`, `loadMoreBacklog`, `quickCreateBacklogTicket`, `BacklogValue`, `BacklogSection`, `BacklogRow` (Tasks 4-7); `ticketCounts`, `countsRequest` (Task 8); the field props from Task 9.

- [ ] **Step 1: Switch `TicketList` to the backlog wrapper**

In `index.tsx`, replace the `ticketsSectionsAtom` / `ticketsSectionsKey` /
`ticketsSectionsBaseAtom` trio with:

```tsx
const req = useMemo(
  () => backlogRequest(orgSlug, slug, query),
  [orgSlug, slug, query]
)
const result = useAtomValue(backlog(req))
const refresh = useAtomRefresh(backlog(req))
```

`useMemo` is required: a new request object each render is a new family key.
Keep the existing retained-previous-value logic, keying it on `req` instead of
the old string key.

- [ ] **Step 2: Pass the request down instead of the query string key**

`SectionList` takes `req: BacklogRequest` in place of building `sectionKey` from
`ticketsListKeyForStatus`. Replace:

```tsx
const loadMore = useAtomSet(loadMoreBacklog({ req, status }))
const loadMoreState = useAtomValue(loadMoreBacklog({ req, status }))
const loadingMore = loadMoreState.waiting
```

Delete the `pendingTicketStatusChangesAtom` read and the
`pendingStatusChanges.has(ticket.id) && "animate-pulse"` wrapper. The row owns
its own pulse now.

- [ ] **Step 3: Rewire `Row`**

Delete the `ticketUpdatePreviewAtom`, `applyOptimisticTicketPreview`,
`ticketsSectionsKey` and legacy `updateTicketAtom` imports. Replace the preview
block with:

```tsx
const update = useAtomSet(updateBacklogTicket({ req, id: ticket.id }))
const updateState = useAtomValue(updateBacklogTicket({ req, id: ticket.id }))
const onPatch = (patch: UpdateTicketInput) => update(patch)
```

Render `ticket` directly everywhere `visibleTicket` was used; the wrapper
already returns the optimistic row. Pass `onPatch` and
`waiting={updateState.waiting}` to the field components. `Row` takes `req`
instead of `query`.

- [ ] **Step 4: Rewire the creators**

`BacklogTicketCreator` and `SectionTicketCreator` call
`useAtomSet(quickCreateBacklogTicket(req))` and pass `clientId` as they do
today.

- [ ] **Step 5: Rewire the routes**

In `projects/$slug/index.tsx`, mount `backlog(backlogRequest(orgSlug, slug, query))`.
In `projects/$slug/route.tsx`, replace both `ticketsCountAtom(ticketsCountKey(orgSlug, slug, {}))`
uses with `ticketCounts(countsRequest(orgSlug, slug, {}))`.

- [ ] **Step 6: Verify**

Run: `bun run test && bun run typecheck`
Expected: pass. `src/components/routeReads.test.tsx` may need its atom names
updated; update it, do not delete assertions.

- [ ] **Step 7: Manual check**

Run the app per `docs/PROJECTPROJECT.md`. On the backlog, change a priority, a
type, an assignee and a status on the same row in quick succession. Each must
paint instantly, pulse, and never show the old value again.

- [ ] **Step 8: Commit**

```bash
vp fmt && vp lint
git add packages/frontend/src/components/TicketList packages/frontend/src/routes
git commit -m "refactor(tickets): move the backlog onto the native atom layer"
```

---

### Task 11: Detail page, hover card and breadcrumbs

**Files:**
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/tickets/$id.tsx`
- Modify: `packages/frontend/src/components/TicketPage/TicketPage.tsx`
- Modify: `packages/frontend/src/components/TicketHoverCard.tsx`
- Modify: `packages/frontend/src/components/Breadcrumbs.tsx`

**Interfaces:**
- Consumes: `ticketDetail`, `ticketRequest`, `updateTicketDetail`, `archiveTicket`, `unarchiveTicket`, `deleteTicket` (Task 3).

- [ ] **Step 1: Switch the route**

Replace `ticketAtom(ticketKey(orgSlug, slug, id))` with
`ticketDetail(ticketRequest(orgSlug, slug, id))` in both the loader mount and
the component read.

- [ ] **Step 2: Switch `TicketPage`**

Replace every `updateTicketAtom` / `updateTicketStatusAtom` / `archiveTicketAtom`
/ `unarchiveTicketAtom` / `deleteTicketAtom` use with the Task 3 equivalents,
built from one `req` value memoised per ticket. Status is now
`updateTicketDetail(req)` called with `{ status }`.

- [ ] **Step 3: Switch `TicketHoverCard` and `Breadcrumbs`**

Both read `ticketDetail(ticketRequest(...))`.

- [ ] **Step 4: Verify**

Run: `bun run test && bun run typecheck`
Expected: pass.

- [ ] **Step 5: Manual check**

Open a ticket from the backlog, edit its status on the detail page, and go back.
The backlog row must already show the new status. Hover a row to open the hover
card and confirm it matches.

- [ ] **Step 6: Commit**

```bash
vp fmt && vp lint
git add packages/frontend/src/routes packages/frontend/src/components
git commit -m "refactor(tickets): move the ticket detail surfaces onto the native atom layer"
```

---

### Task 12: Delete the legacy ticket plumbing and rewrite the convention

**Files:**
- Modify: `packages/frontend/src/atoms/tickets.ts`
- Delete: `packages/frontend/src/atoms/tickets.sections.test.ts` (superseded by `backlog.test.ts`)
- Modify: `packages/frontend/src/atoms/tickets.test.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- After this task `atoms/tickets.ts` exports only what sprints still needs:
  `ticketsInSprintAtom`, `ticketsInSprintKey`, `ticketKey`, `splitTicketKey`,
  `updateTicketAtom`, `ticketBodyDraftAtom`, `pendingTicketStatusAtom` users
  excepted. Everything else is gone.

- [ ] **Step 1: Delete the dead exports**

From `packages/frontend/src/atoms/tickets.ts` remove: `ticketsSectionsBaseAtom`,
`ticketsSectionsOptimisticAtom`, `ticketsSectionsAtom`, `ticketsSectionsKey`,
`ticketsListKey`, `ticketsListKeyForStatus`, `sectionsKeyForListKey`,
`splitFamilyKey`, `decodeListQuery`, `decodeStoredQuery`, `loadMoreTicketsAtom`,
`ticketsSectionsAppendedAtom`, `createdTicketKeysAtom`,
`pendingTicketStatusChangesAtom`, `ticketsCountBaseAtom`,
`ticketsCountOptimisticAtom`, `ticketsCountAtom`, `ticketsCountKey`,
`ticketRemoteAtom`, `ticketDetailBaseAtom`, `ticketAtom`, `hydrateTicketAtom`,
`ticketUpdateBaseAtom`, `optimisticTicketUpdateAtom`, `ticketUpdatePreviewAtom`,
`applyOptimisticTicketPreview`, `applyOptimisticTicketUpdate`,
`quickCreateTicketAtom`, `ticketSearchAtom`, `ticketSearchKey`,
`archiveTicketAtom`, `unarchiveTicketAtom`, `deleteTicketAtom`,
`updateTicketStatusAtom`, `watchTicketContent`.

Keep `ticketsInSprintAtom`, `ticketsInSprintKey`, `splitSprintKey`, `ticketKey`,
`splitTicketKey`, `ticketBodyDraftAtom`, and `updateTicketAtom` with its
`sprintTicketsKey` field only. Drop `ticketSectionsKey` from `UpdateTicketArg`.

- [ ] **Step 2: Run the suite and fix fallout**

Run: `bun run test && bun run typecheck`
Expected: the only failures are imports from sprint code. Fix those imports; do
not reintroduce any deleted export.

- [ ] **Step 3: Replace the AGENTS.md optimistic section**

In `AGENTS.md`, replace the whole "Mutations and optimistic updates" section
(currently lines 114-199) with:

```markdown
## Mutations and optimistic updates

**Default to optimistic.** Reads are `Api.query(...)` wrapped in
`Atom.optimistic`. Mutations are `Atom.optimisticFn` against the wrapper of the
view they fire from. Full rules and worked examples:
`.agents/skills/effect-atom-optimistic-updates/SKILL.md`. Design rationale:
`docs/superpowers/specs/2026-09-11-native-atom-data-layer-design.md`.

1. **One client.** `packages/frontend/src/api/Api.ts`. Never hand-roll a fetch
   atom.
2. **Reads are wrappers.** Every exported read is
   `Atom.family((req) => Atom.optimistic(query(req)))`. The query stays private.
   Family keys are request objects, not concatenated strings.
3. **Optimism is per view.** A mutation targets the wrapper of the view it fires
   from. Other views catch up through reactivity keys. Never fan one transition
   into several wrappers; never normalise entities into a store.
4. **Mutation input equals the API payload.** Path params come from the family
   key. Never add cache keys, settle targets, or view metadata to the input.
5. **Reactivity keys are array form, built in `src/api/keys.ts`,** and published
   inside the atom module. A mutation publishes only keys that OTHER views
   registered; publishing your own view's key causes a double refetch.
6. **Never hold a transition open** with `get.result(x, { suspendOnWaiting: true })`,
   a pending map, or a preview merge. The wrapper holds until its own source
   refetches.
7. **Reducers are pure,** use `AsyncResult.map(current, ...)`, and derive from
   `current` so stacked edits compose.
8. **Push the confirmed value** through `optimisticFn`'s `set` before returning,
   so the server's value shows before the refetch lands.
9. **Multi-query regions** compose in `Atom.readable(read, (refresh) => ...)`
   that forwards refresh to each source, and the wrapper goes around that. The
   composed result must report `waiting` if any source is waiting and carry the
   newest timestamp, or the hold breaks.
10. **Surface `waiting`** with `animate-pulse` on the data that changed, never on
    idle controls.

Reference: `packages/frontend/src/atoms/backlog.ts` and
`packages/frontend/src/atoms/ticketDetail.ts`.
```

- [ ] **Step 4: Note the remaining legacy surface**

Append to the same section:

```markdown
**Migration status.** Sprints (`atoms/sprints.ts`) and the aggregate modules
(tags, statuses, orgs, comments, attachments, github, everhour, figma, storage,
time tracking, oauth) still use the old `runtime` + `ApiClient` pair. They are
being moved in later stages of the spec. Do not copy their shape into new code.
```

- [ ] **Step 5: Full verification**

Run: `bun run test && bun run typecheck && vp fmt && vp lint`
Expected: full suite passes.

Run: `grep -rn "suspendOnWaiting\|ticketSectionsKey\|applyOptimisticTicketPreview\|pendingTicketStatusChangesAtom" packages/frontend/src`
Expected: hits only inside `atoms/sprints.ts` and its components.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(tickets): delete the legacy ticket cache plumbing"
```

---

## Self-Review

**Spec coverage.** Stage 0 is Tasks 1-2. Stage 1 is Tasks 3-12. Spec section 1
(one client) is Task 1; section 2 (key vocabulary) is Task 1 with the array-form
correction below; section 3 (reads are wrappers) is Tasks 3, 4, 8; section 4
(composed view models, pagination) is Task 6; section 5 (mutations) is Tasks 3-7;
section 6 (structural changes) is Tasks 5 and 7; section 7 (waiting and failure)
is Tasks 9-11; section 8 (component contract) is Tasks 9-11; "what is deleted"
is Task 12. Sprint items in the spec's deletion list
(`pendingTicketStatusAtom`, `pendingSprintAssignmentAtom`) are explicitly out of
scope here and stay for stage 2.

**Correction to fold back into the spec.** The spec proposes record-form
reactivity keys. Reading `Reactivity.keysToHashes` shows record form also hashes
the bare top-level key, so `{ tickets: [...] }` matches every atom registered
under `tickets` and precision is impossible. This plan uses array form with the
existing key strings, which additionally keeps legacy and new atoms
interoperating during the migration. Update the spec's section 2 accordingly.

**Placeholder scan.** No TBDs. Every code step carries the code. Task 9's
per-file edits are described as concrete substitutions rather than full file
bodies because the surrounding markup is large and unchanged; the prop contract
and the replacement call bodies are given exactly.

**Type consistency.** `BacklogRequest`, `BacklogRow`, `BacklogSection`,
`BacklogValue`, `TicketRequest`, `CountsRequest`, `SearchRequest` are each
defined once and used under the same name afterwards. `scopeOf` is local to each
atom module; `projectScope` is the shared builder. `applyTicketPatch` is used by
`backlog.ts`, `applyTicketDetailPatch` by `ticketDetail.ts`. `Results.blocked`
is introduced in Task 2 and used in Task 4, then superseded by a direct
`isSuccess` check in Task 6's rewrite of `backlogView`; it remains used by its
own test and is retained for stage 2's board composition.

**Known risk.** Task 6's hold depends on `backlogView` reporting `waiting: true`
while page queries refetch. If a page query is not mounted at commit time its
result is Initial, which `Results.meta` counts as not waiting. Task 6's test
covers the mounted case. If the unmounted case shows a flicker in manual
checking, treat Initial as waiting inside `Results.meta` and add a test.
