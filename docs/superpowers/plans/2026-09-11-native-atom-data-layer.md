# Native Atom Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the entire frontend data layer onto `AtomHttpApi` queries wrapped in per-view `Atom.optimistic`, so every edit paints instantly and holds until that view's own refetch lands, and delete the settle-key, pending-map and preview-merge plumbing that currently fakes this.

**Architecture:** One `AtomHttpApi.Service` replaces the hand-rolled `ApiClient` plus `runtime`. Each view gets one query, one `Atom.optimistic` wrapper over it, and mutations built with `Atom.optimisticFn` against that wrapper. Mutation input is exactly the API payload; family keys are request objects; reactivity keys live in the atom module. Components read a wrapper and call a setter.

**Tech Stack:** Effect v4 (`4.0.0-rc.112`), `effect/unstable/reactivity/{Atom,AtomHttpApi,AsyncResult,Reactivity,AtomRegistry}`, `@effect/atom-react`, React 19, TanStack Router, Vitest via `vite-plus`.

**Spec:** `docs/superpowers/specs/2026-09-11-native-atom-data-layer-design.md`

**Scope:** All five spec stages in one batch, on one branch. Every atom module moves, the old `ApiClient`, `AppLayer` and `runtime` are deleted, and no legacy and native pair coexists at the end. Ordering inside the batch still matters: every atom layer is built before any component is rewired, so no component is wired twice and no temporary compatibility shim is written.

## Phases

| Phase | Tasks | Deliverable |
| --- | --- | --- |
| A. Foundations | 1-2 | `Api`, reactivity keys, pure helpers |
| B. Ticket atoms | 3-8 | Detail, backlog, counts, search |
| C. Sprint atoms | 9-12 | Sprint list, detail, board, placement, membership |
| D. Components and routes | 13-16 | Field components, backlog, detail, board |
| E. Organisation API surface | 17-18 | Org members and invitations served over HttpApi |
| F. Aggregate modules | 19-25 | The thirteen remaining atom modules and their consumers |
| G. Deletion and docs | 26-27 | Old client and runtime gone, conventions rewritten |

Phases C, E and F do not depend on each other, except that Task 22 depends on Phase E. Phase D depends on B and C. Phase G depends on everything.

**Phase E is backend work** in `packages/shared` and `packages/backend`. It is the only phase that changes the API surface, which `AGENTS.md` lists as needing Wouter's sign-off. Get the endpoint shapes in Task 17 approved before writing Task 18.

## Global Constraints

- Effect v4 only. Import from `effect/unstable/reactivity/...`, never from `@effect-atom/atom` or `@effect-atom/atom-react` for atom construction. React bindings (`useAtomValue`, `useAtomSet`, `useAtomRefresh`) come from `@effect/atom-react`.
- Read `node_modules/effect/AGENTS.md` before writing Effect code.
- Never add a pending map, settle key, preview merge, `suspendOnWaiting` hold, or React context to make an edit show instantly. Follow `.agents/skills/effect-atom-optimistic-updates/SKILL.md`.
- Mutation input types are the payload schemas from `@projectproject/shared`, unchanged. Path params come from the atom's family key.
- Reactivity keys use **array form** (`["tickets/acme/web"]`), never record form. Record form hashes the bare top-level key as well, so `{ tickets: [...] }` fires every atom registered under `tickets` and precision is impossible.
- All reactivity keys come from `src/api/keys.ts`. Never write a key string inline.
- **A mutation publishes only keys that other views registered.** The optimistic wrapper already refreshes its own source on commit, so publishing a key your own view listens to costs a second refetch per edit.
- Build every atom layer before rewiring any component. Do not write a temporary shim to keep a half-migrated component compiling; if a component cannot be rewired yet, its task has not come up.
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
| `packages/frontend/src/atoms/ticketDetail.ts` | Detail query, wrapper, update/archive/unarchive/delete |
| `packages/frontend/src/atoms/backlog.ts` | Sections query, page queries, composed view, wrapper, mutations |
| `packages/frontend/src/atoms/ticketCounts.ts` | Counts query and wrapper for the project sidebar |
| `packages/frontend/src/atoms/ticketSearch.ts` | Ticket search query |
| `packages/frontend/src/atoms/sprintList.ts` | Sprint list wrapper, membership view, sprint mutations |
| `packages/frontend/src/atoms/sprintDetail.ts` | One sprint, including its description |
| `packages/frontend/src/atoms/sprintBoard.ts` | Group order plus ticket content composed into one region |
| `packages/frontend/src/lib/gitStateMerge.ts` | Stale git-state merge, extracted from `github.ts` |
| `packages/frontend/src/lib/orderKey.ts` | `compareByOrderKey`, moved out of the components layer |
| `packages/frontend/src/atoms/invitations.ts` | User-scoped invitations, replacing the browser's better-auth fan-out |
| `packages/backend/src/handlers/invitations.ts` | Handlers for the four invitation endpoints |
| `packages/backend/src/handlers/org.test.ts` | Role collapsing and better-auth error mapping |

**Backend and shared, Phase E:** `packages/shared/src/schemas/Org.ts` and
`packages/shared/src/api.ts` gain the member and invitation surface;
`packages/backend/src/Services/BetterAuth.ts`,
`packages/backend/src/Layers/BetterAuth.ts`,
`packages/backend/src/handlers/org.ts`,
`packages/backend/src/handlers/oauthApplications.ts` and
`packages/backend/src/main.ts` implement it.

**Rewritten in place:** `tags.ts`, `projectStatuses.ts`, `projects.ts`, `orgs.ts`, `auth.ts`, `comments.ts`, `attachments.ts`, `storage.ts`, `github.ts`, `everhour.ts`, `figma.ts`, `timeTracking.ts`, `oauthApplications.ts`, `oauthConsent.ts`.

**Deleted:** `services/ApiClient.ts`, `runtime.ts`, `atoms/tickets.ts`, `atoms/sprints.ts`, `atoms/orgAttachmentsKey.ts`, `lib/pendingTicketStatus.ts`, `lib/pendingSprintAssignment.ts`, `components/TagRenamesProvider.tsx`, and the superseded atom tests.

**Modified:** roughly 100 component and route files. `AGENTS.md` and `docs/data-fetching-policy.md`.

**Boundary rule:** the field controls (`PriorityField`, `TypeField`, `AssigneeField`, `StatusField`) become presentational, taking `onPatch` and `waiting` and owning no atoms. The row that renders them picks the mutation for its own surface: `updateBacklogTicket` on the backlog, `updateBoardTicket` on the board, `updateTicketDetail` on the detail page. That is what removes the four-level `sprintTicketsKey` prop drill.

**Module boundary rule:** an atom module never imports from `components/`. Two violations exist today and are fixed here: `projectStatuses.ts` imports `compareByOrderKey` from `components/sprints/board-utils`, and `projects.ts` imports `bannerSource` from `components/project-banner-presets`.

---

## Phase A: foundations

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
  it("builds project-scoped key strings", () => {
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
 * The strings match the ones the pre-migration modules used. They are already
 * descriptive and keeping them keeps this change about structure rather than
 * string churn.
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

### Task 2: Conventions (no extra foundation modules)

Phase A is **only** Task 1 (`Api` + `keys`). Do **not** add `ticketPatch.ts`,
`results.ts`, or other shared atom helpers in foundations.

**Composed views** (`backlog`, `sprintBoard`) assemble several `Api.query` atoms
inside an `Atom.readable`, gate on `AsyncResult.all(parts)`, then build their
value. Propagate `waiting` / `timestamp` from that combined result when
returning `AsyncResult.success`.

**Optimistic ticket updates** merge a partial `UpdateTicketInput` **inside each
`Atom.optimisticFn` reducer** with `AsyncResult.map` — the executor pattern.
Fields absent from the patch are kept with `patch.field ?? ticket.field`. List
rows omit `body`; detail includes it. No shared `applyTicketPatch` module; the
reducer owns the merge next to the mutation it serves.

---

## Phase B: ticket atoms

### Task 3: Ticket detail wrapper and update mutation

**Files:**
- Create: `packages/frontend/src/atoms/ticketDetail.ts`
- Test: `packages/frontend/src/atoms/ticketDetail.test.ts`

**Interfaces:**
- Consumes: `Api`, `Keys`, `projectScope` (Task 1); inline reducer conventions (Task 2).
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
      AsyncResult.map(current, (ticket) => ({
        ...ticket,
        title: patch.title ?? ticket.title,
        status: patch.status ?? ticket.status,
        type: patch.type ?? ticket.type,
        priority: patch.priority ?? ticket.priority,
        tags: patch.tags ?? ticket.tags,
        assignees: patch.assignees ?? ticket.assignees,
        body: patch.body ?? ticket.body
      })),
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
- Consumes: `Api`, `Keys`, `projectScope`, `AsyncResult.all` (Task 2).
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
      if (!AsyncResult.isSuccess(base)) return base
      const sections: Record<string, BacklogSection> = {}
      for (const [status, page] of Object.entries(base.value.sections)) {
        sections[status] = {
          items: page.items.map(toRow),
          nextCursor: page.nextCursor
        }
      }
      const gate = AsyncResult.all([base])
      if (!AsyncResult.isSuccess(gate)) return gate
      return AsyncResult.success<BacklogValue>(
        { counts: base.value.counts, sections },
        { waiting: gate.waiting, timestamp: gate.timestamp }
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
          ? {
              ...row,
              ticket: {
                ...row.ticket,
                title: patch.title ?? row.ticket.title,
                status: patch.status ?? row.ticket.status,
                type: patch.type ?? row.ticket.type,
                priority: patch.priority ?? row.ticket.priority,
                tags: patch.tags ?? row.ticket.tags,
                assignees: patch.assignees ?? row.ticket.assignees
              }
            }
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
      const next = {
        ...row,
        ticket: {
          ...row.ticket,
          title: patch.title ?? row.ticket.title,
          status: patch.status ?? row.ticket.status,
          type: patch.type ?? row.ticket.type,
          priority: patch.priority ?? row.ticket.priority,
          tags: patch.tags ?? row.ticket.tags,
          assignees: patch.assignees ?? row.ticket.assignees
        }
      }
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

      const gate = AsyncResult.all(parts)
      if (!AsyncResult.isSuccess(gate)) return gate
      return AsyncResult.success<BacklogValue>(
        { counts: base.value.counts, sections },
        { waiting: gate.waiting, timestamp: gate.timestamp }
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

## Phase C: sprint atoms

### Task 9: Sprint list module

**Files:**
- Create: `packages/frontend/src/atoms/sprintList.ts`
- Test: `packages/frontend/src/atoms/sprintList.test.ts`

**Interfaces:**
- Consumes: `Api`, `Keys`, `projectScope`.
- Produces: `SprintListRequest`, `sprintListRequest(orgSlug, slug)`, `sprintList(req)`, `sprintMembership(req)`, `createSprint(req)`, `updateSprint({ req, groupId })`, `deleteSprint({ req, groupId })`, `completeSprint({ req, groupId })`.

**Why this module exists in this shape.** Today `sprintsListBaseAtom` registers no
reactivity key at all, so sprint data only ever refreshes through explicit
`get.refresh` calls scattered across six mutations. Every read here declares its
keys, which removes those calls.

**Reads:**

| Export | Endpoint | Keys registered | TTL |
| --- | --- | --- | --- |
| `sprintList(req)` | `groups` / `list`, filtered client-side to `kind === "sprint"` | `Keys.sprints(scope)` | 1 minute |

**Mutations, all `Atom.optimisticFn` on `sprintList(req)`:**

| Export | Input | Endpoint | Publishes | Reducer |
| --- | --- | --- | --- | --- |
| `createSprint(req)` | `CreateGroupInput` | `groups` / `create` | `Keys.sprints(scope)` is this view's own key, so publish nothing | prepend a synthetic sprint; id from a module counter as today |
| `updateSprint({ req, groupId })` | `UpdateGroupInput` | `groups` / `update` | nothing | patch name, color, dates **and `body`** |
| `deleteSprint({ req, groupId })` | `void` | `groups` / `delete` | `Keys.sprintMembership(scope)` | filter the sprint out |
| `completeSprint({ req, groupId })` | `CompleteSprintInput` | `groups` / `complete` | `Keys.sprintMembership(scope)`, `Keys.ticketsIn(scope)` | mark complete, move carryover ids to the destination sprint |

- [ ] **Step 1: Add the sprint keys**

In `packages/frontend/src/api/keys.ts` add:

```ts
  /** Any query returning this project's sprints. */
  sprints: (scope: string): string => `sprints/${scope}`,
  /** Which sprint a ticket belongs to. */
  sprintMembership: (scope: string, groupId?: string): string =>
    groupId === undefined
      ? `sprint-membership/${scope}`
      : `sprint-membership/${scope}/${groupId}`,
```

- [ ] **Step 2: Write the failing test**

Create `packages/frontend/src/atoms/sprintList.test.ts` following the shape of
`backlog.test.ts`. Cover three cases:

1. Renaming a sprint paints instantly and holds until the list refetch lands.
2. `updateSprint` with `{ body }` shows the new description immediately. This is
   a live bug: the current reducer at `atoms/sprints.ts:152-174` ignores
   `patch.body`, so description edits stay invisible until the refresh.
3. A failed rename reverts the row.

```ts
it("applies a description edit optimistically", async () => {
  // …stub groups.list, hold the PATCH…
  registry.set(updateSprint({ req, groupId }), { body: "New description" })
  const optimistic = registry.get(sprintList(req))
  if (!AsyncResult.isSuccess(optimistic)) throw new Error("no optimistic value")
  expect(optimistic.value[0].body).toBe("New description")
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test src/atoms/sprintList.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the module**

Follow `ticketDetail.ts` exactly for structure: a private `*Query`, a public
`Atom.family(req => Atom.optimistic(query(req)))`, then one `Atom.optimisticFn`
per mutation whose `fn` calls the endpoint, pushes the confirmed value with
`set`, and publishes only the keys in the table above.

`GroupDetail` carries `body`; `Group` does not. `groups.list` returns `Group`.
Keep the module's value type as the list element type, and include `body` in the
reducer only when the list element type carries it. If it does not, promote the
list query to return `GroupDetail` is NOT an option (no such endpoint), so
instead store the optimistic body in the sprint detail module (Task 11) and have
`updateSprint` target both wrappers. Pick whichever the types allow and state the
choice in the commit message.

- [ ] **Step 5: Derive membership from the same wrapper**

Append:

```ts
/**
 * Which sprint each ticket belongs to.
 *
 * Derived from the optimistic wrapper with `Atom.mapResult`, so it inherits the
 * overlay and the hold for free. This is what retires
 * `pendingSprintAssignmentAtom`: that map existed only because the old
 * derivation read possibly-stale list data after the mutation settled.
 */
export const sprintMembership = Atom.family((req: SprintListRequest) =>
  Atom.mapResult(sprintList(req), (sprints) => {
    const map = new Map<TicketId, Group>()
    for (const sprint of sprints) {
      if (sprint.completedAt !== null) continue
      for (const id of sprint.tickets) if (!map.has(id)) map.set(id, sprint)
    }
    return map
  })
)
```

- [ ] **Step 6: Add ticket membership mutations**

`addTicketsToSprint({ req, groupId })` and `removeTicketsFromSprint({ req, groupId })`,
both `Atom.optimisticFn` on `sprintList(req)`, input
`{ ticketIds: ReadonlyArray<TicketId> }`, endpoint `groups` / `updateTickets`.
The reducer adds or removes ids on the target sprint and, for adds, evicts those
ids from every other non-completed sprint. Publish `Keys.sprintMembership(scope)`,
`Keys.sprintMembership(scope, groupId)`, one per evicted group id returned by the
server, and `Keys.ticketLists(scope)`.

Delete the `useAddTicketsToSprint` / `useRemoveTicketsFromSprint` hooks. They
existed only to write the pending map before React re-rendered; the wrapper now
paints synchronously, so components call the mutation directly.

- [ ] **Step 7: Run tests and commit**

```bash
bun run test src/atoms/sprintList.test.ts && bun run typecheck && vp fmt && vp lint
git add packages/frontend/src/atoms/sprintList.ts packages/frontend/src/atoms/sprintList.test.ts packages/frontend/src/api/keys.ts
git commit -m "feat(atoms): add the native sprint list wrapper and membership view"
```

---

### Task 10: Sprint detail module

**Files:**
- Create: `packages/frontend/src/atoms/sprintDetail.ts`
- Test: `packages/frontend/src/atoms/sprintDetail.test.ts`

**Interfaces:**
- Produces: `SprintRequest`, `sprintRequest(orgSlug, slug, groupId)`, `sprintDetail(req)`.

**Why.** `SprintDetail.tsx:145-159` currently reads both `sprintAtom` and
`sprintsListAtom` and hand-merges them field by field, preferring the list for
most fields because it is fresher. That merge exists because neither atom
declares reactivity keys. With keys declared, `groups.get` stays fresh on its
own and the merge is deleted.

- [ ] **Step 1: Write the failing test**

Assert that `sprintDetail` returns `GroupDetail` including `body`, and that
after `updateSprint` from Task 9 publishes its keys, this atom refetches.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/atoms/sprintDetail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```ts
export interface SprintRequest {
  readonly params: {
    readonly orgSlug: string
    readonly slug: string
    readonly id: GroupId
  }
}

const sprintQuery = (req: SprintRequest) =>
  Api.query("groups", "get", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.sprint(scopeOf(req), req.params.id)]
  })

export const sprintDetail = Atom.family((req: SprintRequest) =>
  Atom.optimistic(sprintQuery(req))
)
```

Add `Keys.sprint: (scope, id) => \`sprint/${scope}/${id}\`` to `keys.ts`, and add
it to the publish list of `updateSprint`, `completeSprint` and `deleteSprint` in
Task 9.

- [ ] **Step 4: Run test and commit**

```bash
bun run test src/atoms/sprintDetail.test.ts && bun run typecheck
vp fmt && vp lint
git add packages/frontend/src/atoms/sprintDetail.ts packages/frontend/src/atoms/sprintDetail.test.ts packages/frontend/src/api/keys.ts
git commit -m "feat(atoms): add the native sprint detail wrapper"
```

---

### Task 11: Sprint board composed view

This is the task that retires `pendingTicketStatusAtom`. That overlay exists
because the optimistic target (`sprintsListAtom`) stores ticket ids and order
while the thing being changed (status) lives in `ticketsInSprintAtom`, which is
not optimistic. One composed wrapper over both removes the split.

**Files:**
- Create: `packages/frontend/src/atoms/sprintBoard.ts`
- Test: `packages/frontend/src/atoms/sprintBoard.test.ts`

**Interfaces:**
- Consumes: `Results` (Task 2), `Keys`, `Api`, `sprintDetail` (Task 10).
- Produces: `BoardRequest`, `boardRequest(orgSlug, slug, groupId)`, `BoardValue`, `sprintBoard(req)`, `placeBoardTicket(req)`, `updateBoardTicket({ req, id })`.

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/atoms/sprintBoard.test.ts`. Stub both
`groups/:id` and `groups/:id/tickets`. Assert:

1. The composed value pairs each id from the group's order with its ticket.
2. Dragging a card to another column paints the new status instantly and holds
   until **both** endpoints have refetched. Assert the value never reverts.
3. Reordering within a column paints instantly.
4. A failed placement reverts both order and status.

```ts
it("holds until both the group and its tickets refetch", async () => {
  // …
  registry.set(placeBoardTicket(req), {
    ticketId: ticket.id,
    status: doing,
    after: null
  })
  const optimistic = registry.get(sprintBoard(req))
  if (!AsyncResult.isSuccess(optimistic)) throw new Error("no optimistic value")
  expect(optimistic.value.columns.in_progress[0].id).toBe(ticket.id)

  finishOrder(Response.json(encodeGroup(reordered)))
  // Only the group has refetched; the tickets list has not.
  expect(registry.get(sprintBoard(req))).toMatchObject({ waiting: true })
  finishTickets(Response.json([encodeTicket({ ...ticket, status: doing })]))
  await vi.waitFor(() =>
    expect(registry.get(sprintBoard(req))).toMatchObject({ waiting: false })
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/atoms/sprintBoard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composed view**

```ts
export interface BoardRequest {
  readonly params: {
    readonly orgSlug: string
    readonly slug: string
    readonly id: GroupId
  }
}

export interface BoardValue {
  /** Ticket order as the group defines it, resolved to full tickets. */
  readonly tickets: ReadonlyArray<Ticket>
  readonly completedAt: Date | null
}

const ticketsQuery = (req: BoardRequest) =>
  Api.query("groups", "listTickets", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.sprintMembership(scopeOf(req), req.params.id)
    ]
  })

/**
 * The board is one region fed by two endpoints: the group supplies order and
 * completion, the ticket list supplies content and status. Both are refreshed
 * together, and the composed result reports `waiting` until both settle, which
 * is what makes `Atom.optimistic` hold the drag preview for the whole round
 * trip.
 */
const boardView = (req: BoardRequest) =>
  Atom.readable(
    (get) => {
      const group = get(sprintQuery(req))
      const tickets = get(ticketsQuery(req))
      return AsyncResult.map(
        AsyncResult.all([group, tickets]),
        ([groupValue, ticketsValue]) => {
          const byId = new Map(ticketsValue.map((t) => [t.id, t]))
          const ordered: Array<Ticket> = []
          for (const id of groupValue.tickets) {
            const ticket = byId.get(id)
            if (ticket) ordered.push(ticket)
          }
          return {
            tickets: ordered,
            completedAt: groupValue.completedAt
          }
        }
      )
    },
    (refresh) => {
      refresh(sprintQuery(req))
      refresh(ticketsQuery(req))
    }
  )

export const sprintBoard = Atom.family((req: BoardRequest) =>
  Atom.optimistic(boardView(req))
)
```

`sprintQuery` must be exported from `sprintDetail.ts` for this, or duplicated
here with the identical request object so both resolve to the same atom. Export
it; a second identical `Api.query` call would work but exporting states the
sharing explicitly.

The board groups by status in the component, as it does today. Columns are not
part of the atom value because the status set comes from `projectStatuses`,
which is a different resource and is not mutated by board actions.

- [ ] **Step 4: Add the two board mutations**

```ts
/** Drag: reorder within a column, or move across columns (which changes status). */
export const placeBoardTicket = Atom.family((req: BoardRequest) =>
  Atom.optimisticFn(sprintBoard(req), {
    reducer: (current, input: UpdateTicketOrderInput) =>
      AsyncResult.map(current, (value) => placeTicket(value, input)),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: UpdateTicketOrderInput) {
          yield* Api.use((client) =>
            client.groups.updateTicketOrder({ params: req.params, payload: input })
          )
          yield* Reactivity.invalidate(
            input.status === undefined
              ? [Keys.sprint(scopeOf(req), req.params.id)]
              : [
                  Keys.sprint(scopeOf(req), req.params.id),
                  Keys.ticket(scopeOf(req), input.ticketId),
                  Keys.ticketLists(scopeOf(req)),
                  Keys.ticketPages(scopeOf(req))
                ]
          )
        })
      )
  })
)

/** Editing a card's fields from the board. */
export const updateBoardTicket = Atom.family(
  ({ req, id }: { readonly req: BoardRequest; readonly id: TicketId }) =>
    Atom.optimisticFn(sprintBoard(req), {
      reducer: (current, patch: UpdateTicketInput) =>
        AsyncResult.map(current, (value) => ({
          ...value,
          tickets: value.tickets.map((t) =>
            t.id === id
              ? {
                  ...t,
                  title: patch.title ?? t.title,
                  status: patch.status ?? t.status,
                  type: patch.type ?? t.type,
                  priority: patch.priority ?? t.priority,
                  tags: patch.tags ?? t.tags,
                  assignees: patch.assignees ?? t.assignees
                }
              : t
          )
        })),
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
              AsyncResult.map(get(sprintBoard(req)), (value) => ({
                ...value,
                tickets: value.tickets.map((t) => (t.id === id ? updated : t))
              }))
            )
            yield* Reactivity.invalidate([
              Keys.ticket(scopeOf(req), id),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req))
            ])
            return updated
          })
        )
    })
)
```

`placeTicket` is a pure helper in the same file: remove the id, reinsert after
`input.after`, and apply `input.status` to that ticket when present.

- [ ] **Step 5: Run tests and commit**

```bash
bun run test src/atoms/sprintBoard.test.ts && bun run typecheck && vp fmt && vp lint
git add packages/frontend/src/atoms/sprintBoard.ts packages/frontend/src/atoms/sprintBoard.test.ts packages/frontend/src/atoms/sprintDetail.ts
git commit -m "feat(atoms): compose the sprint board from its group and ticket queries"
```

---

### Task 12: Sprint carryover without a second fetch

**Files:**
- Modify: `packages/frontend/src/atoms/sprintList.ts`
- Test: `packages/frontend/src/atoms/sprintList.test.ts` (append)

**Why.** `SprintHeaderFields.useTicketStatusesInSprint` exists only to build the
`ticketStatuses` argument for `completeSprint`, and it issues a second
`groups.listTickets` fetch inside the header to do it. `sprintBoard(req)` already
holds those tickets.

- [ ] **Step 1: Write the failing test**

Assert that `completeSprint` called with only `{ destination }` splits carryover
correctly, reading statuses from the board wrapper rather than from its input.

- [ ] **Step 2: Change the input type**

Drop `ticketStatuses` from the mutation input. Inside `fn`, read
`get(sprintBoard(boardRequest(...)))` for the statuses. If that read is not a
Success, fall back to sending no carryover hint and let the server decide.

- [ ] **Step 3: Run tests and commit**

```bash
bun run test src/atoms/sprintList.test.ts && bun run typecheck && vp fmt && vp lint
git add packages/frontend/src/atoms/sprintList.ts packages/frontend/src/atoms/sprintList.test.ts
git commit -m "feat(atoms): read sprint carryover statuses from the board wrapper"
```

---

## Phase D: components and routes

### Task 13: Field components become presentational

Every ticket field control currently owns its own mutation atom and receives a
cache key by prop to reach it. `sprintTicketsKey` is drilled four levels from
`SprintBoard` to `PriorityButton`. After this task the controls own no atoms and
the owning row picks the right mutation for its surface.

**Files:**
- Modify: `packages/frontend/src/components/TicketList/{PriorityField,TypeField,AssigneeField,StatusField}.tsx`
- Modify: `packages/frontend/src/components/TicketList/Row.tsx`
- Modify: `packages/frontend/src/components/sprints/{SprintBoardCard,SprintBoardColumn,SprintBoard}.tsx`
- Modify: `packages/frontend/src/components/TicketPage/TicketPage.tsx`

**Interfaces:**
- Produces the contract every later task uses:
  ```ts
  interface TicketFieldProps {
    readonly onPatch: (patch: UpdateTicketInput) => void
    readonly waiting: boolean
  }
  ```
  `PriorityButton`, `PriorityBadgeTrigger`, `TypeButton`, `TypeBadgeTrigger`,
  `AssigneeField`, `StatusButton` and `StatusBadgeTrigger` take these two props
  plus their existing presentational props. They no longer take `orgSlug`,
  `slug`, `query`, `sprintTicketsKey`, `ticketSectionsKey`, `sourceSectionKey`,
  `destSectionKey` or `countKey`.

- [ ] **Step 1: Convert the four field modules**

Delete from each: the `useAtomSet` / `useAtomValue` calls, the
`updateTicketAtom` / `updateTicketStatusAtom` / `pendingTicketStatusChangesAtom`
imports, and the key props. Replace each dispatch with `onPatch`:

```tsx
// PriorityField
onClick={() => {
  if (p === ticket.priority) return
  onPatch({ priority: p })
}}

// TypeField
onClick={() => {
  if (t === ticket.type) return
  onPatch({ type: t })
}}

// AssigneeField
onSelect={(next) => onPatch({ assignees: next })}

// StatusField
onSelect={(status) => {
  if (status === ticket.status) return
  onPatch({ status })
}}
```

In `StatusField`, the displayed status is now `ticket.status`. Delete the
`pending.get(ticket.id)?.status ?? ticket.status` lookup and the `currentTicket`
local; the caller hands down an already-optimistic ticket. Keep the
`projectStatusesAtom` read, which is a different resource.

Apply `waiting && "animate-pulse"` to the element showing the current value, not
to the trigger.

- [ ] **Step 2: Wire `Row` to the backlog mutation**

```tsx
const update = useAtomSet(updateBacklogTicket({ req, id: ticket.id }))
const updateState = useAtomValue(updateBacklogTicket({ req, id: ticket.id }))
```

Pass `onPatch={update}` and `waiting={updateState.waiting}`. Delete the
`ticketUpdatePreviewAtom` read, the `applyOptimisticTicketPreview` call, the
`visibleTicket` local and the `ticketsSectionsKey` call; render `ticket`
directly. `Row` takes `req: BacklogRequest` instead of `query`.

- [ ] **Step 3: Wire `SprintBoardCard` to the board mutation**

```tsx
const update = useAtomSet(updateBoardTicket({ req, id: ticket.id }))
const updateState = useAtomValue(updateBoardTicket({ req, id: ticket.id }))
```

Delete the `sprintTicketsKey` prop from `SprintBoardCard`, `SprintBoardColumn`
(both the column and its `CardSlot`) and `SprintBoard`. Replace it with
`req: BoardRequest`, which the card also needs for its mutation.

- [ ] **Step 4: Wire `TicketPage` badges to the detail mutation**

`PriorityBadgeTrigger`, `TypeBadgeTrigger` and `StatusBadgeTrigger` on the detail
page take `onPatch` built from `updateTicketDetail(req)`.

- [ ] **Step 5: Verify**

Run: `bun run test && bun run typecheck`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
vp fmt && vp lint
git add packages/frontend/src/components
git commit -m "refactor(tickets): make the ticket field controls presentational"
```

---

### Task 14: Backlog components and routes

**Files:**
- Modify: `packages/frontend/src/components/TicketList/{index,SectionList,BacklogView,BacklogTicketCreator,SectionTicketCreator,SprintTicketCreator,SprintField,ArchiveControl}.tsx`
- Modify: `packages/frontend/src/components/TicketList/toolbar/{Filters,counts}.ts(x)`
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/{index,route}.tsx`

- [ ] **Step 1: Switch `TicketList` to the backlog wrapper**

```tsx
const req = useMemo(
  () => backlogRequest(orgSlug, slug, query),
  [orgSlug, slug, query]
)
const result = useAtomValue(backlog(req))
const refresh = useAtomRefresh(backlog(req))
```

`useMemo` is mandatory. A fresh request object each render is a fresh family
key, which would rebuild the atom and refetch on every render.

Keep the retained-previous-value logic, keyed on `req` rather than the old
string key.

- [ ] **Step 2: Switch `SectionList`**

Take `req: BacklogRequest`. Replace the load-more wiring with
`loadMoreBacklog({ req, status })`. Delete the `pendingTicketStatusChangesAtom`
read and the `pendingStatusChanges.has(ticket.id) && "animate-pulse"` wrapper;
each row owns its pulse now.

- [ ] **Step 3: Switch the creators and the sprint field**

`BacklogTicketCreator`, `SectionTicketCreator` and `SprintTicketCreator` call
`quickCreateBacklogTicket(req)`. `SprintField` calls `addTicketsToSprint` and
`removeTicketsFromSprint` from Task 9 directly, replacing the deleted hooks, and
reads `sprintMembership(sprintListRequest(orgSlug, slug))`.

`ArchiveControl` takes `onArchive` and `waiting` rather than a `tKey: string`.

- [ ] **Step 4: Switch the toolbar**

`toolbar/counts.ts` reads `ticketCounts(countsRequest(...))`. `toolbar/Filters.tsx`
reads `sprintList(sprintListRequest(...))` and `tagsFor(tagsRequest(...))` once
Task 19 lands; until then leave the tags read untouched.

- [ ] **Step 5: Switch the routes**

`projects/$slug/index.tsx` mounts `backlog(backlogRequest(orgSlug, slug, query))`
and `sprintList(sprintListRequest(orgSlug, slug))`. `projects/$slug/route.tsx`
replaces both `ticketsCountAtom(ticketsCountKey(...))` uses with
`ticketCounts(countsRequest(orgSlug, slug, {}))` and its `sprintsListAtom` use
with `sprintList(...)`.

- [ ] **Step 6: Verify**

Run: `bun run test && bun run typecheck`
Expected: pass. `components/routeReads.test.tsx` asserts on request URLs and
counts rather than atom names, so it should mostly hold. If a request count
changed, work out whether the new number is correct before editing the
assertion, and say so in the commit message.

- [ ] **Step 7: Manual check**

Change priority, type, assignee and status on one backlog row in quick
succession. Each paints instantly, pulses, and never reverts.

- [ ] **Step 8: Commit**

```bash
vp fmt && vp lint
git add packages/frontend/src/components/TicketList packages/frontend/src/routes
git commit -m "refactor(tickets): move the backlog onto the native atom layer"
```

---

### Task 15: Ticket detail surfaces

**Files:**
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/tickets/$id.tsx`
- Modify: `packages/frontend/src/components/TicketPage/TicketPage.tsx`
- Modify: `packages/frontend/src/components/TicketHoverCard.tsx`
- Modify: `packages/frontend/src/components/Breadcrumbs.tsx`

- [ ] **Step 1: Switch every read**

Replace `ticketAtom(ticketKey(orgSlug, slug, id))` with
`ticketDetail(ticketRequest(orgSlug, slug, id))` in the route loader mount, the
route component, the hover card and the breadcrumb. Memoise the request per
ticket.

- [ ] **Step 2: Switch every mutation**

`updateTicketAtom`, `updateTicketStatusAtom`, `archiveTicketAtom`,
`unarchiveTicketAtom` and `deleteTicketAtom` become `updateTicketDetail`,
`archiveTicket`, `unarchiveTicket` and `deleteTicket`. Status is
`updateTicketDetail(req)` called with `{ status }`.

- [ ] **Step 3: Switch the breadcrumb's sprint read**

`Breadcrumbs.tsx` reads `sprintDetail(sprintRequest(...))`.

- [ ] **Step 4: Verify and manual check**

Run: `bun run test && bun run typecheck`

Open a ticket from the backlog, change its status on the detail page, go back.
The row already shows the new status. Hover it and confirm the hover card agrees.

- [ ] **Step 5: Commit**

```bash
vp fmt && vp lint
git add packages/frontend/src/routes packages/frontend/src/components
git commit -m "refactor(tickets): move the ticket detail surfaces onto the native atom layer"
```

---

### Task 16: Sprint components and routes

**Files:**
- Modify: `packages/frontend/src/components/sprints/{SprintBoard,SprintBoardColumn,SprintBoardToolbar,SprintDetail,SprintDescription,SprintHeaderFields,SprintRail,ActiveSprintLine,useBoardTickets}.ts(x)`
- Modify: `packages/frontend/src/components/ProjectHeader.tsx`
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/sprints/{index,$groupId}.tsx`
- Delete: `packages/frontend/src/components/sprints/useBoardTickets.ts` if it becomes empty

- [ ] **Step 1: Collapse the four duplicate ticket subscriptions**

`ticketsInSprintAtom(sameKey)` is currently subscribed four times on one board
screen: `SprintBoard`, `useBoardTickets`, `SprintBoardToolbar` via a second
`useBoardTickets` call, and `SprintHeaderFields`. All four become one
`useAtomValue(sprintBoard(req))`. `useBoardTickets` keeps only the filtering and
counting logic and takes the board value as an argument instead of subscribing.

- [ ] **Step 2: Delete the status overlay**

`SprintBoard.tsx` drops `pendingTicketStatusAtom` and the `overlay` prop passed
to `SprintBoardColumn`. `effectiveStatus(ticket, overlay)` in
`useBoardTickets` becomes `ticket.status`, because the composed wrapper already
carries the optimistic status. `pending={overlay.has(ticket.id)}` on the card
becomes the board mutation's `waiting`.

- [ ] **Step 3: Switch placement**

`SprintBoard` uses `placeBoardTicket(req)`.

- [ ] **Step 4: Delete the hand-merge in `SprintDetail`**

Read `sprintDetail(sprintRequest(...))` alone. Delete the field-by-field merge
with `sprintsListAtom` at lines 145-159.

- [ ] **Step 5: Switch the header**

`SprintHeaderFields` uses `updateSprint`, `completeSprint` and `deleteSprint`
from Task 9, and drops `useTicketStatusesInSprint` entirely per Task 12.
`SprintDescription` uses `updateSprint` with `{ body }`, which now actually
previews.

- [ ] **Step 6: Switch the rail, line, header and routes**

`SprintRail`, `ActiveSprintLine`, `ProjectHeader` and both sprint routes read
`sprintList(sprintListRequest(...))` and `sprintDetail(sprintRequest(...))`. The
`sprints/index.tsx` loader keeps awaiting the list to pick a redirect target,
now via `Registry.getResult(registry, sprintList(req))`.

- [ ] **Step 7: Verify and manual check**

Run: `bun run test && bun run typecheck`

Drag a card between columns. It moves instantly, stays moved, and the column
counts update. Edit a card's priority. Rename the sprint and edit its
description.

- [ ] **Step 8: Commit**

```bash
vp fmt && vp lint
git add packages/frontend/src/components packages/frontend/src/routes
git commit -m "refactor(sprints): move the board and sprint surfaces onto the native atom layer"
```

---

## Phase E: move the organisation surface onto HttpApi

Today the frontend talks to better-auth directly from the browser for
organisation member management, while org reads, project member management and
OAuth consent already go through our API. That split is an accident, not a
design, and it is the only reason the orgs and auth atom modules need a
different transport from everything else.

These two tasks close the gap. After them, Task 22 is an ordinary recipe
application rather than a special case.

**What moves.** Ordinary authorization-gated CRUD: the member list, invite,
role change, remove, cancel invitation, transfer ownership, leave, rename, and
the four user-scoped invitation operations.

**What stays on `authClient`, deliberately.** Sign in, sign out, magic link,
social link and unlink, list accounts, `useSession`, `getSession` and
`setActive`. These set cookies, perform full-page redirects, and drive
`authClient.$store.atoms.$sessionSignal`, which `main.tsx` and
`lib/sessionCache.ts` use to rebuild the registry on identity change. Proxying
them would mean reimplementing cookie handling for no gain.

**Precedent in this repo.** `Services/BetterAuth.ts` already wraps server-side
better-auth calls behind an Effect service, including `listOrganizations`,
`getOrganization` and `submitConsent`. `handlers/oauthApplications.ts:53-59`
already shows how to forward the raw request so better-auth sees the caller's
session. These tasks extend that shape; they do not introduce it.

---

### Task 17: Organisation and invitation API surface

**Files:**
- Modify: `packages/shared/src/schemas/Org.ts`
- Modify: `packages/shared/src/api.ts`

**Interfaces:**
- Produces the schemas and endpoint identifiers Tasks 18 and 22 depend on.

- [ ] **Step 1: Add the member and invitation schemas**

In `packages/shared/src/schemas/Org.ts`, next to the existing `Org`, `OrgDetail`
and `OrgRole`:

```ts
export const AssignableRole = Schema.Literals(["admin", "member"])
export type AssignableRole = typeof AssignableRole.Type

export const OrgMember = Schema.Struct({
  userId: Schema.String,
  role: OrgRole,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String)
})
export type OrgMember = typeof OrgMember.Type

export const OrgInvitation = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  role: OrgRole
})
export type OrgInvitation = typeof OrgInvitation.Type

export const OrgMembers = Schema.Struct({
  members: Schema.Array(OrgMember),
  invitations: Schema.Array(OrgInvitation)
})
export type OrgMembers = typeof OrgMembers.Type

/** An invitation as the invited user sees it, before they belong to the org. */
export const UserInvitation = Schema.Struct({
  id: Schema.String,
  orgSlug: Slug,
  orgName: Schema.String,
  role: OrgRole,
  inviterEmail: Schema.NullOr(Schema.String),
  expiresAt: Schema.DateFromString
})
export type UserInvitation = typeof UserInvitation.Type

export const InviteMemberInput = Schema.Struct({
  email: Schema.String,
  role: AssignableRole
})
export type InviteMemberInput = typeof InviteMemberInput.Type

export const UpdateMemberRoleInput = Schema.Struct({ role: AssignableRole })
export type UpdateMemberRoleInput = typeof UpdateMemberRoleInput.Type

export const TransferOwnershipInput = Schema.Struct({ toUserId: Schema.String })
export type TransferOwnershipInput = typeof TransferOwnershipInput.Type

export const RenameOrgInput = Schema.Struct({ name: Schema.String })
export type RenameOrgInput = typeof RenameOrgInput.Type
```

`AssignableRole` already exists elsewhere; if it is defined outside
`schemas/Org.ts` today, move it here rather than declaring a second copy, and
update its importers.

These four types replace the locally declared `OrgMember`, `OrgInvitation` and
`OrgMembers` in `packages/frontend/src/atoms/orgs.ts:30-45`, which exist only
because the data never crossed our API before.

- [ ] **Step 2: Add the paths**

In `packages/shared/src/api.ts`, next to the existing path structs:

```ts
const OrgMemberPath = Schema.Struct({ orgSlug: Slug, userId: Schema.String })
const OrgInvitationPath = Schema.Struct({
  orgSlug: Slug,
  invitationId: Schema.String
})
const InvitationPath = Schema.Struct({ invitationId: Schema.String })
```

- [ ] **Step 3: Extend `OrgGroup`**

Add these eight endpoints to the existing `OrgGroup`, before `.middleware(Authentication)`:

| Endpoint | Method and path | Payload | Success | Errors |
| --- | --- | --- | --- | --- |
| `members` | GET `/orgs/:orgSlug/members` | — | `OrgMembers` | `Unauthorized`, `NotFound`, `Forbidden` |
| `rename` | PATCH `/orgs/:orgSlug` | `RenameOrgInput` | `OrgDetail` | `Unauthorized`, `NotFound`, `Forbidden` |
| `inviteMember` | POST `/orgs/:orgSlug/members` | `InviteMemberInput` | `OrgInvitation` | `Unauthorized`, `NotFound`, `Forbidden`, `Validation`, `Conflict` |
| `updateMemberRole` | PATCH `/orgs/:orgSlug/members/:userId` | `UpdateMemberRoleInput` | `OrgMember` | `Unauthorized`, `NotFound`, `Forbidden` |
| `removeMember` | DELETE `/orgs/:orgSlug/members/:userId` | — | `HttpApiSchema.NoContent` | `Unauthorized`, `NotFound`, `Forbidden` |
| `cancelInvitation` | DELETE `/orgs/:orgSlug/invitations/:invitationId` | — | `HttpApiSchema.NoContent` | `Unauthorized`, `NotFound`, `Forbidden` |
| `transferOwnership` | POST `/orgs/:orgSlug/transfer-ownership` | `TransferOwnershipInput` | `OrgMembers` | `Unauthorized`, `NotFound`, `Forbidden`, `Validation` |
| `leave` | POST `/orgs/:orgSlug/leave` | — | `HttpApiSchema.NoContent` | `Unauthorized`, `NotFound`, `Forbidden`, `Conflict` |

Written out, following the existing style in the group:

```ts
  .add(
    HttpApiEndpoint.get("members", "/orgs/:orgSlug/members", {
      params: OrgPath,
      success: OrgMembers,
      error: [Unauthorized, NotFound, Forbidden]
    })
  )
  .add(
    HttpApiEndpoint.patch("updateMemberRole", "/orgs/:orgSlug/members/:userId", {
      params: OrgMemberPath,
      payload: UpdateMemberRoleInput,
      success: OrgMember,
      error: [Unauthorized, NotFound, Forbidden]
    })
  )
```

`transferOwnership` returns the whole `OrgMembers` because it changes two rows
at once. Today the frontend does this as two sequential `updateMemberRole`
calls, which can half-fail and leave the org with two owners or none. One
endpoint makes it atomic.

`leave` returns `Conflict` when the caller is the sole owner.

- [ ] **Step 4: Add the `invitations` group**

Invitations are addressed by the invited user, who is not yet a member of the
organisation, so they cannot live under `/orgs/:orgSlug`.

```ts
const InvitationsGroup = HttpApiGroup.make("invitations")
  .add(
    HttpApiEndpoint.get("list", "/invitations", {
      success: Schema.Array(UserInvitation),
      error: Unauthorized
    })
  )
  .add(
    HttpApiEndpoint.get("get", "/invitations/:invitationId", {
      params: InvitationPath,
      success: UserInvitation,
      error: [Unauthorized, NotFound]
    })
  )
  .add(
    HttpApiEndpoint.post("accept", "/invitations/:invitationId/accept", {
      params: InvitationPath,
      success: Org,
      error: [Unauthorized, NotFound, Conflict]
    })
  )
  .add(
    HttpApiEndpoint.post("reject", "/invitations/:invitationId/reject", {
      params: InvitationPath,
      success: HttpApiSchema.NoContent,
      error: [Unauthorized, NotFound]
    })
  )
  .middleware(Authentication)
```

`accept` returns the `Org` so the frontend can route to it without a second
fetch. `list` replaces `pendingInvitesBaseAtom`, which currently makes one
`getSession` call, one `listUserInvitations` call and then one `getInvitation`
call per invitation, all from the browser.

- [ ] **Step 5: Add the public OAuth client endpoint**

`atoms/oauthConsent.ts` reaches `authClient.$fetch("/oauth2/public-client")`
directly. Add it to `OAuthApplicationsGroup` so the consent screen uses one
transport:

```ts
  .add(
    HttpApiEndpoint.get("publicClient", "/oauth-applications/public", {
      query: Schema.Struct({ client_id: Schema.String }),
      success: Schema.Struct({ name: Schema.NullOr(Schema.String) }),
      error: [NotFound]
    })
  )
```

This endpoint is unauthenticated by design: the consent screen renders the
application name before the user has consented.

- [ ] **Step 6: Register `InvitationsGroup` on `AppApi`**

Add `.add(InvitationsGroup)` to the `AppApi` composition at the bottom of
`packages/shared/src/api.ts`.

- [ ] **Step 7: Verify**

Run: `cd packages/shared && bun run typecheck`
Expected: clean. The backend will not compile yet, because `HttpApiBuilder.group`
requires every endpoint to be handled. That is Task 18.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add organisation member and invitation endpoints"
```

---

### Task 18: Organisation and invitation handlers

**Files:**
- Modify: `packages/backend/src/Services/BetterAuth.ts`
- Modify: `packages/backend/src/Layers/BetterAuth.ts`
- Modify: `packages/backend/src/handlers/org.ts`
- Create: `packages/backend/src/handlers/invitations.ts`
- Modify: `packages/backend/src/handlers/oauthApplications.ts`
- Modify: `packages/backend/src/main.ts`
- Create: `packages/backend/src/handlers/org.test.ts`

**Interfaces:**
- Consumes: the schemas and endpoints from Task 17.
- Produces: `OrgHandlerLive` extended, `InvitationsHandlerLive`, and twelve new methods on `BetterAuthShape`.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/handlers/org.test.ts`. Follow
`handlers/oauthApplications.test.ts`: test the pure error-mapping and role
-collapsing functions directly rather than standing up a server.

```ts
import { expect, it } from "vite-plus/test"
import { collapseRole } from "./org"

it("collapses better-auth's comma-separated roles to the highest one", () => {
  expect(collapseRole("member")).toBe("member")
  expect(collapseRole("admin,member")).toBe("admin")
  expect(collapseRole("owner,admin")).toBe("owner")
})
```

`collapseRole` is the server-side home of `toOrgRole` from
`packages/frontend/src/atoms/orgs.ts:47-52`. better-auth stores roles as a
comma-separated string; that detail should not reach the browser.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && bun run test src/handlers/org.test.ts`
Expected: FAIL — `collapseRole` is not exported.

- [ ] **Step 3: Extend `BetterAuthShape`**

In `packages/backend/src/Services/BetterAuth.ts`, add to the interface. Every
method that mutates takes the caller's `Request` so better-auth sees the
session, exactly as `submitConsent` already does:

```ts
  readonly getMembers: (
    request: Request,
    orgSlug: string
  ) => Effect.Effect<OrgMembers, BetterAuthError | NotFound>
  readonly renameOrg: (
    request: Request,
    orgSlug: string,
    name: string
  ) => Effect.Effect<OrgDetail, BetterAuthError | NotFound>
  readonly inviteMember: (
    request: Request,
    orgSlug: string,
    input: InviteMemberInput
  ) => Effect.Effect<OrgInvitation, BetterAuthError | NotFound>
  readonly updateMemberRole: (
    request: Request,
    orgSlug: string,
    userId: string,
    role: AssignableRole
  ) => Effect.Effect<OrgMember, BetterAuthError | NotFound>
  readonly removeMember: (
    request: Request,
    orgSlug: string,
    userId: string
  ) => Effect.Effect<void, BetterAuthError | NotFound>
  readonly cancelInvitation: (
    request: Request,
    orgSlug: string,
    invitationId: string
  ) => Effect.Effect<void, BetterAuthError | NotFound>
  readonly transferOwnership: (
    request: Request,
    orgSlug: string,
    toUserId: string,
    selfUserId: string
  ) => Effect.Effect<OrgMembers, BetterAuthError | NotFound>
  readonly leaveOrg: (
    request: Request,
    orgSlug: string
  ) => Effect.Effect<void, BetterAuthError | NotFound>
  readonly listInvitations: (
    request: Request
  ) => Effect.Effect<ReadonlyArray<UserInvitation>, BetterAuthError>
  readonly getInvitation: (
    request: Request,
    invitationId: string
  ) => Effect.Effect<UserInvitation, BetterAuthError | NotFound>
  readonly acceptInvitation: (
    request: Request,
    invitationId: string
  ) => Effect.Effect<Org, BetterAuthError | NotFound>
  readonly rejectInvitation: (
    request: Request,
    invitationId: string
  ) => Effect.Effect<void, BetterAuthError | NotFound>
  readonly getPublicClientName: (
    clientId: string
  ) => Effect.Effect<string | null, BetterAuthError>
```

- [ ] **Step 4: Implement them in `Layers/BetterAuth.ts`**

Each follows the existing `submitConsent` shape: `Effect.tryPromise` around
`auth.api.<method>({ body, headers: request.headers, request })`, with
`catch: (cause) => new BetterAuthError({ cause })`. The better-auth organisation
plugin methods are `getFullOrganization`, `updateOrganization`, `createInvitation`,
`updateMemberRole`, `removeMember`, `cancelInvitation`, `leaveOrganization`,
`listUserInvitations`, `getInvitation`, `acceptInvitation` and
`rejectInvitation`. Confirm each name against the installed version before
writing; do not trust this list blind.

`transferOwnership` is the one that is not a single better-auth call. Implement
it as the two role changes inside one `Effect.gen`, promoting the target before
demoting the caller, so a mid-way failure leaves an org with two owners rather
than none:

```ts
transferOwnership: (request, orgSlug, toUserId, selfUserId) =>
  Effect.gen(function* () {
    yield* setRole(request, orgSlug, toUserId, "owner")
    yield* setRole(request, orgSlug, selfUserId, "admin")
    return yield* getMembers(request, orgSlug)
  })
```

Map better-auth's comma-separated role string through `collapseRole` in every
method that returns a member.

- [ ] **Step 5: Extend the org handler**

In `packages/backend/src/handlers/org.ts`, export `collapseRole` and add the
eight handlers. Each obtains the web request the way
`handlers/oauthApplications.ts:54-55` does:

```ts
    .handle("updateMemberRole", ({ params, payload }) =>
      Effect.gen(function* () {
        const ba = yield* BetterAuth
        const req = yield* HttpServerRequest.HttpServerRequest
        const request = yield* HttpServerRequest.toWeb(req).pipe(Effect.orDie)
        return yield* ba.updateMemberRole(
          request,
          params.orgSlug,
          params.userId,
          payload.role
        )
      })
    )
```

Authorization is better-auth's: it rejects a non-admin caller, and the
`BetterAuthError` maps to `Forbidden`. Add a `memberErrorToFailure` helper
beside the existing `consentErrorToFailure` that inspects the `APIError` status
and produces `Forbidden`, `NotFound`, `Conflict` or `Validation`. Give it its
own unit test in `org.test.ts`.

- [ ] **Step 6: Create the invitations handler**

`packages/backend/src/handlers/invitations.ts`, same shape, four handlers.

- [ ] **Step 7: Add `publicClient` to the OAuth handler**

One handler calling `ba.getPublicClientName(query.client_id)`.

- [ ] **Step 8: Register the new group**

Add `InvitationsHandlerLive` to the layer composition in
`packages/backend/src/main.ts` alongside the other handler groups.

- [ ] **Step 9: Verify**

```bash
cd packages/backend && bun run test && bun run typecheck
```

Expected: pass. The typecheck is the real gate here: `HttpApiBuilder.group`
fails to compile until every endpoint added in Task 17 has a handler.

- [ ] **Step 10: Manual check**

Start the app per `docs/PROJECTPROJECT.md`. In organisation settings, invite a
member, change a role, cancel an invitation. Watch the network tab: every call
goes to `/api/orgs/...`, none to `/api/auth/...`.

- [ ] **Step 11: Commit**

```bash
git add packages/backend/src
git commit -m "feat(backend): serve organisation members and invitations over HttpApi"
```

---

## Phase F: aggregate modules

These thirteen modules are already close to the target shape: most have a
private base, a public `Atom.optimistic` wrapper and `Atom.optimisticFn`
mutations. The migration is mechanical except for `github`, which carries
machinery the recipe does not cover and gets its own task. `orgs` and `auth`
would also have been an exception, but Phase E removes the reason.

**The recipe, applied in every task below.** Task 19 is written out in full as
the worked example; later tasks give each module's specifics rather than
repeating the recipe.

1. Replace the private base atom with `Api.query(group, endpoint, { params, query, timeToLive, reactivityKeys })`.
2. Replace the concatenated string family key with a request object and a
   `xRequest(...)` builder. Delete the `splitXKey` parser.
3. Keep the public `Atom.family(req => Atom.optimistic(query(req)))`.
4. Rewrite each mutation as `Atom.optimisticFn` on that wrapper, input equal to
   the API payload, path params from the family key, `set(confirmed)` before
   returning, and `Reactivity.invalidate` with keys from `src/api/keys.ts` for
   other views only.
5. Replace every `get.refresh(xBaseAtom(...))` with nothing. The wrapper
   refreshes its own source.
6. Give every read that is currently unwrapped a wrapper.
7. Replace every no-op "waiting flag" reducer with a real one.

- [ ] Before starting Phase F, add the remaining key constructors to
  `src/api/keys.ts` in one commit: `tags`, `tagUsage`, `statuses`, `project`,
  `projects`, `org`, `orgs`, `orgMembers`, `invitations`, `me`, `comments`,
  `attachments`, `storage`, `gitStates`, `branches`, `githubIntegration`,
  `githubAuth`, `everhourProfile`, `everhourProject`, `figmaProfile`,
  `figmaProject`, `figmaTicketLinks`, `activeTimer`, `ticketTime`, `workTypes`,
  `oauthApplications`, `oauthClient`.

---

### Task 19: Tags and project statuses

**Files:**
- Modify: `packages/frontend/src/atoms/tags.ts`
- Modify: `packages/frontend/src/atoms/projectStatuses.ts`
- Create: `packages/frontend/src/atoms/tags.test.ts`
- Modify: `packages/frontend/src/components/TagEditor.tsx`
- Modify: `packages/frontend/src/components/{StatusCreateRow,StatusDeleteConfirm,StatusList,StatusRow}.tsx`
- Delete: `packages/frontend/src/components/TagRenamesProvider.tsx`

**tags.ts reads:**

| Export | Endpoint | Keys registered | TTL | Change |
| --- | --- | --- | --- | --- |
| `tagsFor(req)` | `tags` / `list` | `Keys.tags(scope)` | 2 minutes | request object replaces the `org/slug` string |
| `tagUsage(req)` | `tags` / `usageCounts` | `Keys.tags(scope)`, `Keys.ticketsIn(scope)`, `Keys.ticketLists(scope)` | 2 minutes | **newly wrapped in `Atom.optimistic`**; it is unwrapped today |

**tags.ts mutations, all on `tagsFor(req)`:**

| Export | Input | Endpoint | Publishes | Reducer |
| --- | --- | --- | --- | --- |
| `createTag(req)` | `CreateTagInput` | `tags` / `create` | `Keys.tagUsage(scope)` | append the synthetic tag, as today |
| `updateTag({ req, name })` | `UpdateTagInput` | `tags` / `update` | `Keys.ticketsIn(scope)`, `Keys.ticketLists(scope)`, `Keys.ticketPages(scope)` when the name changed | rename and recolour the matching tag |
| `deleteTag({ req, name })` | `void` | `tags` / `delete` | same as update | **remove the tag from the list.** Today's reducer is a no-op that leaves the deleted tag visible until the refetch |

`renameTagAtom`'s input `{ oldName, nextName?, color? }` becomes the API's
`UpdateTagInput`, with `name` moving from the input into the family key.

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/atoms/tags.test.ts` asserting: a rename paints
instantly and holds; a delete removes the row instantly; a failed rename
reverts. Follow `backlog.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/atoms/tags.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `tags.ts` with the recipe**

```ts
export interface TagsRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
}

export const tagsRequest = (orgSlug: string, slug: string): TagsRequest => ({
  params: { orgSlug, slug }
})

const tagsQuery = (req: TagsRequest) =>
  Api.query("tags", "list", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.tags(scopeOf(req))]
  })

export const tagsFor = Atom.family((req: TagsRequest) =>
  Atom.optimistic(tagsQuery(req))
)

export const updateTag = Atom.family(
  ({ req, name }: { readonly req: TagsRequest; readonly name: TagName }) =>
    Atom.optimisticFn(tagsFor(req), {
      reducer: (current, patch: UpdateTagInput) =>
        AsyncResult.map(current, (tags) =>
          tags.map((tag) =>
            tag.name === name
              ? { ...tag, name: patch.name ?? tag.name, color: patch.color ?? tag.color }
              : tag
          )
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (patch: UpdateTagInput, get) {
            const updated = yield* Api.use((client) =>
              client.tags.update({
                params: { ...req.params, name },
                payload: patch
              })
            )
            set(
              AsyncResult.map(get(tagsFor(req)), (tags) =>
                tags.map((tag) => (tag.name === name ? updated : tag))
              )
            )
            if (patch.name !== undefined && patch.name !== name) {
              yield* Reactivity.invalidate([
                Keys.ticketsIn(scopeOf(req)),
                Keys.ticketLists(scopeOf(req)),
                Keys.ticketPages(scopeOf(req)),
                Keys.tagUsage(scopeOf(req))
              ])
            }
            return updated
          })
        )
    })
)
```

`createTag` and `deleteTag` follow the same shape.

- [ ] **Step 4: Delete `TagRenamesProvider`**

Delete `packages/frontend/src/components/TagRenamesProvider.tsx`, its provider
in `routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx` (lines 76, 161, 193)
and its wrapper in `components/integrationDemand.test.tsx` (lines 17, 151-153).

In `TagEditor.tsx` delete `useTagRenames`, `mapName`, `removed`,
`registerRename`, `registerRemove` and `registryWaiting`. `displayed` becomes
`ticket.tags`, because the ticket wrapper already carries the rename. Move the
mutation into the per-tag `AppliedTagChip` so the pulse is per tag rather than
on every chip.

- [ ] **Step 5: Rewrite `projectStatuses.ts`**

Same recipe. `statusesFor(req)` reads `statuses` / `list` with
`Keys.statuses(scope)`, 5 minute TTL. Mutations `createStatus`,
`updateStatus({ req, statusSlug })`, `reorderStatus(req)` and
`deleteStatus({ req, statusSlug })` map to `statuses` / `create`, `update`,
`reorder`, `remove`. Note the client method is `remove`, not `delete`.
`updateStatus` publishes the ticket keys when the label changed.

Move `compareByOrderKey` from `@/components/sprints/board-utils` into
`packages/frontend/src/lib/orderKey.ts` and import it from there. An atom module
importing from a component module is a layering inversion.

Stop exporting `projectStatusesBaseAtom`. Its only external use is a refresh
button, which becomes `useAtomRefresh(statusesFor(req))`.

- [ ] **Step 6: Run tests and commit**

```bash
bun run test && bun run typecheck && vp fmt && vp lint
git add packages/frontend/src packages/frontend/src/lib
git commit -m "refactor(atoms): move tags and project statuses onto the native layer"
```

---

### Task 20: Projects and storage

**Files:**
- Modify: `packages/frontend/src/atoms/projects.ts`, `packages/frontend/src/atoms/storage.ts`
- Modify: their consumers, listed in the inventory

**projects.ts:**

| Export | Endpoint | Keys | TTL | Change |
| --- | --- | --- | --- | --- |
| `projectsFor(req)` | `projects` / `list` | `Keys.projects(orgSlug)` | 1 minute | **newly wrapped**; exported as a bare base today |
| `project(req)` | `projects` / `get` | `Keys.project(scope)` | 2 minutes | stop exporting the base |

Mutations `updateProject(req)` and `updateProjectSetup(req)` stay optimistic on
`project(req)`. The five member mutations (`addMember`, `updateMember`,
`removeMember`, `cancelPendingMember`, `createProject`) are plain `runtime.fn`
today with no preview; convert the four that edit the member list into
`Atom.optimisticFn` on `project(req)` with real reducers, since the member list
lives on `ProjectDetail`. `deleteProject` and `createProject` stay plain.

`updateProjectSetup` must publish `Keys.projects(orgSlug)`; today it refreshes
the detail but not the list, so the sidebar goes stale.

Keep `projectBannerPreviewAtom` as it is. It is UI state for an uncommitted
upload, not a cache.

`preloadProjectImages` currently side-effects inside the read atoms. Move it to
the component that renders the images.

`projects.ts` imports `bannerSource` from `@/components/project-banner-presets`,
an atom module reaching into the components layer. Move the pure part it needs
into `packages/frontend/src/lib/bannerSource.ts` alongside the `orderKey` move
in Task 19.

**storage.ts:** `orgStorage(req)` reads `storage` / `get`,
`Keys.storage(orgSlug)`, 30 second TTL. `connectStorage` gets a real reducer
instead of today's no-op; `disconnectStorage` keeps its cleared-status literal.
Stop exporting `orgStorageBaseAtom`; the one external refresh becomes
`useAtomRefresh(orgStorage(req))`.

- [ ] **Step 1: Write failing tests** for the member-list preview and for
  `connectStorage` painting immediately.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Apply the recipe to both modules.**
- [ ] **Step 4: Update consumers**, including `ProjectContext` / `useProject`,
  which publishes `ProjectDetail` to child routes and bypasses the atom graph.
  Have it read `project(req)` so it cannot diverge.
- [ ] **Step 5: Run the suite, typecheck, format, lint.**
- [ ] **Step 6: Commit** `refactor(atoms): move projects and storage onto the native layer`.

---

### Task 21: Comments and attachments

**Files:**
- Modify: `packages/frontend/src/atoms/comments.ts`, `packages/frontend/src/atoms/attachments.ts`
- Delete: `packages/frontend/src/atoms/orgAttachmentsKey.ts` and its test

**comments.ts:** `comments(req)` reads `ticketComments` / `list`,
`Keys.comments(scope, ticketId)`, 5 minute TTL. The two-key scheme goes away:
`editComment` and `deleteComment` are keyed `{ req, commentId }` and target
`comments(req)` directly, so there is no manual re-derivation of the list key.
`createComment` gets a real reducer inserting a placeholder comment instead of
today's no-op.

**attachments.ts:** the JSON-string family key is replaced by the request object,
which deletes `orgAttachmentsKey.ts` and its parser outright.
`orgAttachmentsSummary(req)` gains a wrapper so a delete updates the totals
header at the same moment as the list. Both reads keep
`Keys.attachments(orgSlug)`.

`uploadAttachment` and `uploadProjectImage` keep their raw `XMLHttpRequest`
transfer, because they need upload progress and abort, which
`Api.mutation` does not expose. They stay `Api.runtime.fn` and simply publish
`Keys.attachments(orgSlug)` on success. `uploadProjectImage` publishes it too;
today it publishes nothing, which is an inconsistency, not a deliberate choice.

- [ ] **Step 1: Write failing tests** for a comment insert painting immediately
  and for a delete updating the attachments summary in the same tick.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Apply the recipe.**
- [ ] **Step 4: Update consumers** and delete `orgAttachmentsKey.ts` plus
  `orgAttachmentsKey.test.ts`.
- [ ] **Step 5: Run the suite, typecheck, format, lint.**
- [ ] **Step 6: Commit** `refactor(atoms): move comments and attachments onto the native layer`.

---

### Task 22: Orgs and auth

**Depends on Phase E.** With the org surface served over HttpApi, most of this
module is now an ordinary recipe application. Only the session half still uses
`authClient`.

**orgs.ts, all via `Api.query`:**

| Export | Endpoint | Keys | TTL | Change |
| --- | --- | --- | --- | --- |
| `userOrgs()` | `org` / `myOrgs` | `Keys.orgs()` | 1 minute | **newly wrapped** |
| `orgDetail(req)` | `org` / `get` | `Keys.org(orgSlug)` | 2 minutes | stop exporting the base |
| `orgMembers(req)` | `org` / `members` | `Keys.orgMembers(orgSlug)` | 30 seconds | was a direct better-auth call |

**orgs.ts mutations, all `Atom.optimisticFn`:**

| Export | Target | Input | Endpoint | Reducer |
| --- | --- | --- | --- | --- |
| `renameOrg(req)` | `orgDetail(req)` | `RenameOrgInput` | `org` / `rename` | set `name`; publish `Keys.orgs()` |
| `inviteMember(req)` | `orgMembers(req)` | `InviteMemberInput` | `org` / `inviteMember` | **insert a pending invitation row.** Today's reducer is a no-op |
| `updateMemberRole({ req, userId })` | `orgMembers(req)` | `UpdateMemberRoleInput` | `org` / `updateMemberRole` | rewrite that member's role |
| `removeMember({ req, userId })` | `orgMembers(req)` | `void` | `org` / `removeMember` | filter the member out |
| `cancelInvitation({ req, invitationId })` | `orgMembers(req)` | `void` | `org` / `cancelInvitation` | filter the invitation out |
| `transferOwnership(req)` | `orgMembers(req)` | `TransferOwnershipInput` | `org` / `transferOwnership` | promote target to owner, demote caller to admin |
| `leaveOrg(req)` | — | `void` | `org` / `leave` | plain `Api.runtime.fn`; publish `Keys.orgs()` |
| `softDeleteOrg(req)` / `restoreOrg(req)` | `orgDetail(req)` | `void` | unchanged | give them real reducers |

Three things this deletes outright:

- The local `OrgMember`, `OrgInvitation` and `OrgMembers` types at
  `atoms/orgs.ts:30-45`, replaced by the shared schemas from Task 17.
- `toOrgRole`, the comma-separated-role collapse at `atoms/orgs.ts:47-52`. That
  is a better-auth storage detail and now lives in `collapseRole` on the server.
- The `orgDetailBaseAtom` read inside every member mutation's `fn`, which
  existed to find `organizationId` and called `Effect.die` when the org was not
  loaded yet. The server resolves the org from the slug in the path, so the
  dependency disappears rather than moving.

**invitations, a new module** `packages/frontend/src/atoms/invitations.ts`:
`invitations()` reads `invitations` / `list` with `Keys.invitations()`.
`acceptInvitation({ invitationId })` and `rejectInvitation({ invitationId })`
are `Atom.optimisticFn` on it, both removing the row optimistically; accept also
publishes `Keys.orgs()`. This replaces `pendingInvitesBaseAtom`, which fired one
`getSession`, one `listUserInvitations` and one `getInvitation` per invitation
from the browser.

**auth.ts keeps only the session half.** `meAtom` becomes `me()` on
`auth` / `me` with `Keys.me()` and a wrapper. `logout`,
`connectPersonalGithub`, `disconnectPersonalGithub`, `updateEditorPreference`
and `setActiveOrganization` stay as `Api.runtime.fn` wrapping `authClient`,
because they manage cookies, redirects and the session store. Give them
explicit key publication instead of `get.refresh(meAtom)`.

- [ ] **Step 1: Write failing tests** for the invitation insert preview, the
  member role change preview, and an accepted invitation disappearing from the
  list immediately.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Rewrite `orgs.ts` and `auth.ts`, and add `invitations.ts`.**
- [ ] **Step 4: Rewrite `routes/welcome.tsx`.** It currently hand-rolls
  `registry.mount` / `registry.set` /
  `Registry.getResult(..., { suspendOnWaiting: true })` / `unmount` inside a
  `Promise.all` to accept several invitations at once. Replace with
  `useAtomSet(acceptInvitation(...), { mode: "promiseExit" })` per invitation
  and a plain `Promise.all`, dropping the local `failedAccepts` and
  `acceptingAll` state.
- [ ] **Step 5: Update the org settings consumers**, `OrgMembersSection.tsx`,
  `MembersSection.tsx`, `settings/members.tsx`, `settings/general.tsx`,
  `settings/danger.tsx`, `OrgSwitcher.tsx`, `DeletedOrgPage.tsx`.
- [ ] **Step 6: Run the suite, typecheck, format, lint.**
- [ ] **Step 7: Commit** `refactor(atoms): move orgs, invitations and auth onto the native layer`.

---

### Task 23: GitHub

**This is the one aggregate module that is a redesign rather than a
conversion.** It carries four hand-rolled mechanisms that the native layer
replaces, and one that it does not.

What must go:

1. **Closure-mutable state per family key.** `projectGitStatesBaseAtom` holds
   `let lastRepoId` and `let previous` inside the family factory and mutates
   them from within the Effect. That is a cache outside the registry. The
   previous value is available as the wrapper's current value; read it there.
2. **A read atom that invalidates other atoms as a side effect.**
   `changedGitStateTicketIds` diffs inside the read and fires
   `Reactivity.invalidate([...])` from a read path. Move that to the polling
   hook, which is the thing that actually caused the change.
3. **`githubAuthEpochAtom` as a manual reactivity bus.** It is incremented from
   `auth.ts` to bust GitHub caches after an account link changes. Replace it
   with `Keys.githubAuth(orgSlug)`, published by the auth mutations and
   registered by the GitHub reads.
4. **`mergeStaleGitStateDetails`.** This preserves prior PR titles and checks
   when the server reports a stale or rate-limited response. This one **stays**.
   It is not optimistic-update machinery; it is a real merge of a degraded
   server response with a better earlier one. Keep it, and move it into
   `packages/frontend/src/lib/gitStateMerge.ts` with its own unit tests so its
   purpose is unambiguous.

**Reads:**

| Export | Endpoint | Keys | TTL |
| --- | --- | --- | --- |
| `projectGitStates(req)` | `projects` / `gitStates` | `Keys.gitStates(scope)`, `Keys.githubAuth(orgSlug)` | 30 seconds |
| `githubIntegration(req)` | `projects` / `githubIntegration` | `Keys.githubIntegration(orgSlug)`, `Keys.githubAuth(orgSlug)` | 1 minute |
| `githubRepos(req)` | `projects` / `listGithubInstallationRepos` | `Keys.githubIntegration(orgSlug)`, `Keys.githubAuth(orgSlug)` | 2 minutes |
| `branches(req)` | `projects` / `listBranches` | `Keys.branches(scope)` | 1 minute |

All four become wrappers; three are unwrapped today. The repo pagination loop in
`githubRepos` stays inside the query effect.

**Mutations:** `connectGithub(req)` and `disconnectGithub(req)` target
`project(req)` from Task 20. `createBranch({ req, id })`,
`attachBranch({ req, id })` and `clearBranch({ req, id })` target
`projectGitStates(req)`. Delete the fabricated full `GitStatesResponse` in the
reducers: use `AsyncResult.map`, which leaves a non-Success result untouched
rather than inventing `tokenStatus: "ok"` out of nothing.

**`useProjectGitStatePolling`** keeps its interval, visibility and focus
handling. Replace the `registry.get(atom).waiting` guard with a read of the
wrapper's `waiting`, and move the ticket-invalidation diff here from the read
atom.

- [ ] **Step 1: Write failing tests** for: a branch creation painting instantly
  and holding; a stale server response keeping the prior PR title via the
  extracted merge helper; an account unlink refreshing the GitHub reads through
  `Keys.githubAuth`.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Extract `lib/gitStateMerge.ts`** with unit tests.
- [ ] **Step 4: Rewrite `github.ts`** per the tables above.
- [ ] **Step 5: Rewrite the polling hook.**
- [ ] **Step 6: Run the suite, typecheck, format, lint.**
- [ ] **Step 7: Commit** `refactor(atoms): rebuild the github module on the native layer`.

---

### Task 24: Everhour, Figma and time tracking

**Files:**
- Modify: `packages/frontend/src/atoms/{everhour,figma,timeTracking}.ts`
- Modify: `packages/frontend/src/components/Lexical/figmaMetadata.tsx`
- Modify: `packages/frontend/src/components/time/*`

All three are straightforward recipe applications. Specifics:

**everhour.ts** — `everhourProfile()` reads `everhour` / `profile`,
`Keys.everhourProfile()`, 1 minute. `everhourProject(req)` reads
`everhour` / `projectStatus`, `Keys.everhourProject(scope)`, 30 seconds.
Four of the five mutations have no-op reducers today; give
`connectEverhourProfile`, `connectEverhourProject` and `disconnectEverhourProject`
real ones. `syncEverhourProject` legitimately has nothing to predict, so it keeps
a pulse-only reducer, which the conventions already allow.

**figma.ts** — `figmaProfile()`, `figmaProject(req)` and `figmaTicketLinks(req)`.
The last is unwrapped today; wrap it. Replace the empty-string sentinel family
key with an explicit `null` request and a component-level conditional read.

`components/Lexical/figmaMetadata.tsx` holds a React context for the ticket
target plus a bounded fifteen-second polling loop with no visibility guard.
Replace the context by passing the request down as a prop. Keep the polling, but
guard it on `document.visibilityState` as the GitHub poller does.

**timeTracking.ts** — `activeTimer(req)`, `ticketTime(req)`, `workTypes(req)`.
The third is unwrapped today. `stopTimer`'s reducer is a no-op named
`optimisticStopTimer`; make it actually clear the timer to `null`.
`startTicketTimer` and `startSprintTimer` snapshot the previous timer with a
non-`Effect.fn` form of `runtime.fn` so they can refresh the previous ticket's
time afterwards. Replace that with publishing `Keys.ticketTime(scope, previousId)`
read from the wrapper's current value inside the reducer's own scope.

The time panel reads four atoms for one region. Compose
`everhourProfile`, `workTypes`, `ticketTime` and `activeTimer` into a
`ticketTimePanel(req)` view model with `Atom.readable` and a forwarding refresh,
following Task 11.

- [ ] **Step 1: Write failing tests** for the stop-timer clear and the composed
  time panel holding until all four sources settle.
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Apply the recipe to all three modules.**
- [ ] **Step 4: Update the Figma and time consumers.**
- [ ] **Step 5: Run the suite, typecheck, format, lint.**
- [ ] **Step 6: Commit** `refactor(atoms): move everhour, figma and time tracking onto the native layer`.

---

### Task 25: OAuth modules and mention providers

**Files:**
- Modify: `packages/frontend/src/atoms/{oauthApplications,oauthConsent}.ts`
- Modify: `packages/frontend/src/mentions/{registry.ts,ticketProvider.tsx}`
- Modify: `packages/frontend/src/components/Lexical/MentionsPlugin.tsx`

**oauthApplications.ts** is the smallest module in the codebase and already has
a real reducer. Apply the recipe and move on.

**oauthConsent.ts** used to reach `authClient.$fetch("/oauth2/public-client")`
directly. Task 17 added `oauthApplications` / `publicClient`, so
`oauthClientName(req)` becomes an ordinary `Api.query` with a wrapper and the
second transport disappears from this screen. Drop the ignored `oauthQuery`
field from `SubmitConsentInput`; the family key already carries it.

**The mention providers are a deletion blocker for Phase G.**
`mentions/registry.ts` puts `ApiClient` in the provider signature's `R` channel,
`mentions/ticketProvider.tsx` yields `ApiClient` as a value, and
`MentionsPlugin.tsx` discharges both with `Effect.provide(AppLayer)` plus its own
`AbortController` and 200 millisecond debounce.

Replace the whole path with the search atom from Task 8:

```ts
// mentions/registry.ts
export interface MentionProvider {
  readonly search: (
    q: string
  ) => Effect.Effect<ReadonlyArray<MentionCandidate>, never, AtomRegistry>
}

// mentions/ticketProvider.tsx
export const ticketProvider = (scope: {
  readonly orgSlug: string
  readonly slug: string
}): MentionProvider => ({
  search: (q) =>
    Effect.gen(function* () {
      const results = yield* Atom.getResult(
        ticketSearch(searchRequest(scope.orgSlug, scope.slug, { q, limit: 8 }))
      )
      return results.map(toCandidate)
    }).pipe(Effect.orElseSucceed(() => []))
})
```

`ApiClient` leaves the signature, `AppLayer` leaves `MentionsPlugin`, and the
searches become cached and deduplicated instead of refiring per keystroke. Keep
the debounce and the abort controller.

- [ ] **Step 1: Write a failing test** in
  `packages/frontend/src/mentions/ticketProvider.test.ts` asserting that two
  identical searches issue one request.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Rewrite both OAuth modules and all three mention files.**
- [ ] **Step 4: Run the suite, typecheck, format, lint.**
- [ ] **Step 5: Commit** `refactor(atoms): move oauth and mention search onto the native layer`.

---

## Phase G: deletion and docs

### Task 26: Delete the old client, runtime and overlays

**Files deleted:**

| Path | Why |
| --- | --- |
| `packages/frontend/src/services/ApiClient.ts` | replaced by `src/api/Api.ts` |
| `packages/frontend/src/runtime.ts` | `AppLayer` had one entry; `Api.runtime` replaces it |
| `packages/frontend/src/atoms/tickets.ts` | split into `ticketDetail`, `backlog`, `ticketCounts`, `ticketSearch` |
| `packages/frontend/src/atoms/sprints.ts` | split into `sprintList`, `sprintDetail`, `sprintBoard` |
| `packages/frontend/src/lib/pendingTicketStatus.ts` + test | the overlay it reconciled is gone |
| `packages/frontend/src/lib/pendingSprintAssignment.ts` + test | same |
| `packages/frontend/src/atoms/tickets.test.ts`, `tickets.sections.test.ts` | superseded by the new module tests |
| `packages/frontend/src/atoms/sprints.test.ts` | superseded |
| `packages/frontend/src/atoms/orgAttachmentsKey.ts` + test | deleted in Task 21 |

- [ ] **Step 1: Delete the files above.**

- [ ] **Step 2: Fix the last two `AppLayer` references**

`components/Lexical/MentionsPlugin.tsx:28` imports `AppLayer`; Task 25 should
already have removed the need, so delete the import.
`mentions/userProvider.test.ts:5` imports `runtime`; point it at `Api.runtime`.

- [ ] **Step 3: Verify nothing references the deleted surface**

```bash
grep -rn "ApiClient\|AppLayer\|from \"@/runtime\"" packages/frontend/src
grep -rn "suspendOnWaiting\|sprintTicketsKey\|ticketSectionsKey" packages/frontend/src
grep -rn "applyOptimisticTicketPreview\|pendingTicketStatus\|pendingSprintAssignment\|TagRenames" packages/frontend/src
```

Expected: no hits. `services/AuthClient.ts` stays; it never depended on
`ApiClient` or the runtime.

- [ ] **Step 4: Full verification**

```bash
bun run test && bun run typecheck && vp fmt && vp lint
```

Expected: the whole suite passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(frontend): delete the legacy api client, runtime and optimistic overlays"
```

---

### Task 27: Rewrite the conventions

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/data-fetching-policy.md`

- [ ] **Step 1: Replace the AGENTS.md optimistic section**

Replace the whole "Mutations and optimistic updates" section (currently lines
114-199) with:

```markdown
## Mutations and optimistic updates

**Default to optimistic.** Reads are `Api.query(...)` wrapped in
`Atom.optimistic`. Mutations are `Atom.optimisticFn` against the wrapper of the
view they fire from. Rules and worked examples:
`.agents/skills/effect-atom-optimistic-updates/SKILL.md`. Rationale:
`docs/superpowers/specs/2026-09-11-native-atom-data-layer-design.md`.

1. **One client.** `packages/frontend/src/api/Api.ts`. Never hand-roll a fetch
   atom. Calls to better-auth stay `Effect.tryPromise`, but run through
   `Api.runtime` so there is one runtime.
2. **Reads are wrappers.** Every exported read is
   `Atom.family((req) => Atom.optimistic(query(req)))`. The query stays private.
   Family keys are request objects, never concatenated strings, so there is
   nothing to parse back apart.
3. **Optimism is per view.** A mutation targets the wrapper of the view it fires
   from. Other views catch up through reactivity keys. Never fan one transition
   into several wrappers; never normalise entities into a store.
4. **Mutation input equals the API payload.** Path params come from the family
   key. Never put cache keys, settle targets or view metadata in the input.
5. **Reactivity keys are array form, built in `src/api/keys.ts`,** and published
   inside the atom module. A mutation publishes only keys that OTHER views
   registered; publishing your own view's key costs a second refetch per edit.
6. **Never hold a transition open** with `get.result(x, { suspendOnWaiting: true })`,
   a pending map, a preview merge or a React context. The wrapper holds until its
   own source refetches.
7. **Reducers are pure,** use `AsyncResult.map(current, ...)` and derive from
   `current` so stacked edits compose. A reducer that returns `current` unchanged
   is a pulse-only reducer: allowed only when the result is genuinely
   unpredictable, such as a PR number the server assigns.
8. **Push the confirmed value** through `optimisticFn`'s `set` before returning,
   so the server's value shows before the refetch lands.
9. **Multi-query regions** compose in `Atom.readable(read, (refresh) => ...)`
   that forwards refresh to each source, with the wrapper around that. The
   composed result must report `waiting` if any source is waiting and carry the
   newest timestamp, or the hold breaks.
10. **Surface `waiting`** with `animate-pulse` on the data that changed, never on
    idle controls.

Reference: `packages/frontend/src/atoms/backlog.ts` (single query plus pages),
`packages/frontend/src/atoms/sprintBoard.ts` (two-query composed region),
`packages/frontend/src/atoms/tags.ts` (plain aggregate).
```

- [ ] **Step 2: Update the data-fetching policy**

In `docs/data-fetching-policy.md`, replace the sentence "Atoms own cached server
state and optimistic updates; components subscribe and render" with a pointer to
the spec, and add one paragraph to "Retention, freshness, and loader lifetime"
recording that idle TTL and reactivity keys are now declared at the query rather
than scattered across mutation bodies.

- [ ] **Step 3: Final verification**

```bash
bun run test && bun run typecheck && vp fmt && vp lint
git status --short
```

Expected: suite passes, tree clean after commit.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/data-fetching-policy.md
git commit -m "docs: rewrite the optimistic update conventions for the native atom layer"
```

---

## Self-Review

**Spec coverage.** Spec section 1 (one client) is Task 1 and Task 26. Section 2
(key vocabulary) is Task 1 plus the Phase F preamble. Section 3 (reads are
wrappers) is Tasks 3, 4, 8, 9, 10 and 19-25. Section 4 (composed view models) is
Tasks 6, 11 and 24. Section 5 (mutations) is every atom task. Section 6
(structural changes) is Tasks 5, 7 and 11. Sections 7 and 8 (waiting, failure,
component contract) are Tasks 13-16. "What is deleted" is Task 26. The
convention rewrite is Task 27.

Phase E is not in the original spec. It came out of the review question about
whether auth and orgs should reach better-auth through our API rather than from
the browser. The spec now carries it as an addendum, so the two documents agree.

**Placeholder scan.** One genuine open decision remains, in Task 9 Step 4:
whether `updateSprint` can preview `body` against the list wrapper depends on
whether `groups.list` returns `Group` (no `body`) or `GroupDetail`. The task
states both branches and requires the implementer to pick and record the choice.
Everything else carries its content.

**Density note.** Tasks 1-13 and 17-18 carry full code because the patterns are
new. Tasks 19-25 carry each module's exact reads, mutations, keys, TTLs and
specific defects instead of repeating the recipe, which is written once in the
Phase F preamble and demonstrated in full in Task 19. That is deliberate:
thirteen near-identical code listings would obscure the per-module differences,
which are the only part that matters there.

**Type consistency.** Request types are `TicketRequest`, `BacklogRequest`,
`CountsRequest`, `SearchRequest`, `SprintListRequest`, `SprintRequest`,
`BoardRequest`, `TagsRequest`, `OrgRequest`, each defined once. Value types are
`BacklogRow`, `BacklogSection`, `BacklogValue`, `BoardValue`. Helpers are
`placeTicket`, `collapseRole`. Ticket patches merge inline inside each
`Atom.optimisticFn` reducer; composed views gate on `AsyncResult.all`. `scopeOf` is local to each atom module;
`projectScope` is shared. The shared schemas added in Task 17 (`OrgMember`,
`OrgInvitation`, `OrgMembers`, `UserInvitation`, `InviteMemberInput`,
`UpdateMemberRoleInput`, `TransferOwnershipInput`, `RenameOrgInput`) are the
only names Tasks 18 and 22 use for that data; the frontend's local copies are
deleted rather than kept in parallel.

**Risks, in descending order.**

1. **Scale.** This is roughly 4,400 lines of atoms plus about 100 consumer
   files, and now a backend phase as well, on one branch. It cannot be reviewed
   as a single diff. Land it as a stack, one PR per task, or at minimum one per
   phase.
2. **Phase E changes the public API surface.** Thirteen new endpoints, and
   authorization for organisation membership moves from better-auth's own route
   handlers to ours. Get Task 17's endpoint shapes signed off before Task 18,
   and treat the `Forbidden` mapping in `memberErrorToFailure` as security
   -relevant code, not plumbing: a mis-mapped error is the difference between a
   rejected call and a silent success.
3. **`github` is a redesign, not a conversion** (Task 23). Closure-mutable
   per-key caches, a read atom that fires invalidation as a side effect, and a
   manual epoch bus used as a reactivity channel. Budget accordingly.
4. **Composed-region waiting.** Every composed view must gate on
   `AsyncResult.all(parts)` and propagate `waiting` from that combined result.
   Get this wrong and the optimistic hold silently breaks.
5. **`useMemo` on request objects.** A request object rebuilt each render is a
   new family key and refetches every render. This is the most likely mistake
   when rewiring components. Consider a lint rule.
6. **Unmounted page queries.** In Task 6, an unmounted cursor page reports
   Initial. If manual checking shows a flicker there, handle Initial explicitly
   in the composed readable and add a test.
