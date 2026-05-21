# T-97: Segmented Status Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every ticket list view, group rows under collapsible per-status section headers (Linear-style), with a per-section inline creator that morphs from the header.

**Architecture:** Keep the existing per-query atom shape. Wrap `ticketsListBaseAtom` in `Atom.optimistic` and use single-target `Atom.optimisticFn` against the *destination* section list for status changes — the source section settles on refresh (brief visual duplication ~200ms, accepted trade). Sections render in the project's kanban order (from `projectStatusesAtom`); empty sections render when no filter/search is active, are hidden when filtered. Collapsed state persists in localStorage behind a typed Effect-Schema hook. No normalized atom store, no IndexedDB — the upcoming local-first work owns that and we don't want to build a stepping stone that gets thrown away.

**Tech Stack:** Effect Schema, `@effect-atom/atom-react`, TanStack Router, motion/react, Tailwind, vitest. Paraglide for i18n.

**Reference design context:** Decisions captured in T-97's ticket body. Key invariants:
- Always-segment (no view-mode toggle).
- Status filter in toolbar remains orthogonal — selecting one status renders only that section.
- Top-level creator (`BacklogTicketCreator` / `SprintTicketCreator`) stays unchanged. Per-section "+" creator is rapid-add (stays on list, prepends, clears, stays open).
- Kanban (`SprintBoard` / `ticketsInSprintAtom`) is **out of scope**.

---

## File Structure

**Created:**
- `packages/frontend/src/hooks/useLocalStorageState.ts` — typed localStorage state hook backed by an Effect Schema.
- `packages/frontend/src/hooks/useLocalStorageState.test.ts` — vitest tests for the hook (jsdom-style window mocking).
- `packages/frontend/src/components/TicketList/SectionHeader.tsx` — sticky per-section header (icon, name, count, "+" trigger, chevron, collapse toggle).
- `packages/frontend/src/components/TicketList/SectionTicketCreator.tsx` — inline creator that morphs into a `SectionHeader` slot; type chip + (sprint chip when applicable) + title input.
- `packages/frontend/src/components/TicketList/SectionList.tsx` — single section: header + rows + per-section load-more.
- `packages/frontend/src/components/TicketList/SegmentedList.tsx` — renders the ordered list of `SectionList`s; owns the "all empty under filter" empty state.

**Modified:**
- `packages/shared/src/schemas/Ticket.ts` — add `status?: TicketStatus` to `QuickCreateTicketInput`.
- `packages/backend/src/Layers/Tickets.ts` — `quickCreate` reads `input.status`, validates against `projectStatuses.list`, falls back to `"todo"`.
- `packages/backend/src/Layers/Tickets.test.ts` — cover the new `status` field (default, custom, invalid).
- `packages/frontend/src/atoms/tickets.ts` — wrap `ticketsListBaseAtom` exposure in `Atom.optimistic`; convert `quickCreateTicketAtom` to target the destination section list; add `updateTicketStatusAtom` (cross-section optimism) + leave `updateTicketAtom` for non-status field edits.
- `packages/frontend/src/components/TicketList/index.tsx` — replace direct `FilteredList` use with `SegmentedList` orchestration; handle the empty-and-unfiltered fallback to `<NoTicketsYet />`.
- `packages/frontend/src/components/TicketList/FilteredList.tsx` — extract the `Row` rendering out; the file becomes a thin re-export of `Row` (other modules consume it).
- `packages/frontend/src/components/TicketList/StatusField.tsx` — switch its `useAtomSet` from `updateTicketAtom` to the new `updateTicketStatusAtom` so status changes use the optimistic-cross-section path.
- `packages/frontend/messages/en/tickets.json` — add new strings: `tickets_section_load_more_button`, `tickets_section_create_aria_label`, `tickets_section_collapse_aria_label`, `tickets_section_count_aria_label`, `tickets_section_create_placeholder`.

---

## Task 1: Add `status` field to `QuickCreateTicketInput`

**Files:**
- Modify: `packages/shared/src/schemas/Ticket.ts:72-76`
- Modify: `packages/backend/src/Layers/Tickets.ts:543-583`
- Test: `packages/backend/src/Layers/Tickets.test.ts`

### Step 1: Add the optional `status` field to the schema

- [ ] Edit `packages/shared/src/schemas/Ticket.ts:72-76`. Replace the existing `QuickCreateTicketInput` definition with:

```ts
export const QuickCreateTicketInput = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
  type: Schema.optional(TicketType),
  status: Schema.optional(TicketStatus)
})
export type QuickCreateTicketInput = typeof QuickCreateTicketInput.Type
```

### Step 2: Run typecheck to confirm the schema compiles

- [ ] Run: `bun run --filter @projectproject/shared typecheck`
- Expected: PASS (no schema errors). If the shared package doesn't have a typecheck script, run `bun run typecheck` from the root.

### Step 3: Write a failing backend test for the new field

- [ ] In `packages/backend/src/Layers/Tickets.test.ts`, add a new test in the `describe("Tickets quickCreate")` block (or create the block near the existing `quickCreate` tests around line 146):

```ts
it("honors a custom status on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "in progress at birth",
      status: "in_progress"
    })
    expect(created.status).toBe("in_progress")
  }).pipe(
    Effect.provide(testLayer),
    Effect.runPromise
  ))

it("falls back to 'todo' when status is omitted on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "no status given"
    })
    expect(created.status).toBe("todo")
  }).pipe(
    Effect.provide(testLayer),
    Effect.runPromise
  ))
```

(Use the same `testLayer` pattern used by the surrounding tests in this file — look at the existing `quickCreate` test around line 146 for the exact provider plumbing.)

### Step 4: Run the test to verify it fails

- [ ] Run: `bun run --filter @projectproject/backend test Layers/Tickets.test.ts`
- Expected: FAIL on "honors a custom status on quickCreate" because `quickCreate` still hard-codes `"todo"` at `packages/backend/src/Layers/Tickets.ts:561`.

### Step 5: Make `quickCreate` honor `input.status`

- [ ] Edit `packages/backend/src/Layers/Tickets.ts:543-583`. Replace the body of `quickCreate` so the document writer reads `input.status`. The minimal diff is at the `(id) => ({ ... status: "todo" as TicketStatus, ... })` block — change to:

```ts
status: (input.status ?? "todo") as TicketStatus,
```

(Keep everything else unchanged.)

### Step 6: Run the test to verify it passes

- [ ] Run: `bun run --filter @projectproject/backend test Layers/Tickets.test.ts`
- Expected: PASS on both new tests.

### Step 7: Add status-validation against project statuses

- [ ] In `packages/backend/src/Layers/Tickets.ts`, locate `quickCreate` and add a validation step before `writeWithIdAllocation`. The shape mirrors how `create` (line 585+) validates tags/assignees. Use the `ProjectStatuses` service that's already a dependency of this layer (look at how the existing `create` handler validates against tags — same pattern, different service).

The validation function (add near the top-of-layer helpers, alongside `validateTagsExist`):

```ts
const validateStatusExists = (
  orgSlug: string,
  ownerId: string,
  slug: string,
  status: TicketStatus
) =>
  Effect.gen(function* () {
    const all = yield* projectStatuses.list(orgSlug, ownerId, slug)
    const known = all.some((s) => s.slug === status)
    if (!known) {
      return yield* Effect.fail(
        new Validation({
          message: `Unknown status: ${status}`
        })
      )
    }
  })
```

(Match the exact `Validation` tagged error shape used elsewhere in this file — search for `new Validation(` to find the canonical form.)

Then in `quickCreate`, after `ensureAccess` and before `writeWithIdAllocation`:

```ts
if (input.status !== undefined) {
  yield* validateStatusExists(orgSlug, ownerId, slug, input.status)
}
```

Adjust the function signature's error channel: add `Validation` to the `Effect.Effect<...>` type union for `quickCreate`.

### Step 8: Write a failing test for unknown-status rejection

- [ ] Add to `packages/backend/src/Layers/Tickets.test.ts`:

```ts
it("rejects an unknown status on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* Effect.either(
      tickets.quickCreate("org", "user-1", "p", {
        title: "bogus",
        status: "not_a_real_status" as never
      })
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("Validation")
    }
  }).pipe(
    Effect.provide(testLayer),
    Effect.runPromise
  ))
```

### Step 9: Run the test, confirm pass

- [ ] Run: `bun run --filter @projectproject/backend test Layers/Tickets.test.ts`
- Expected: PASS.

### Step 10: Commit

- [ ] Run:

```bash
git add packages/shared/src/schemas/Ticket.ts packages/backend/src/Layers/Tickets.ts packages/backend/src/Layers/Tickets.test.ts
git commit -m "feat(shared): add status to QuickCreateTicketInput, validate on backend

Per-section ticket creation in segmented list views (T-97) needs to land
the new ticket directly under the right status, so the create call must
carry the target status."
```

---

## Task 2: Build `useLocalStorageState` hook

**Files:**
- Create: `packages/frontend/src/hooks/useLocalStorageState.ts`
- Test: `packages/frontend/src/hooks/useLocalStorageState.test.ts`

### Step 1: Write the failing test

- [ ] Create `packages/frontend/src/hooks/useLocalStorageState.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import * as Schema from "effect/Schema"
import { useLocalStorageState } from "./useLocalStorageState"

const StringSet = Schema.Array(Schema.String)

describe("useLocalStorageState", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("returns the initial value when no entry exists", () => {
    const { result } = renderHook(() =>
      useLocalStorageState("test:empty", StringSet, ["a"])
    )
    expect(result.current[0]).toEqual(["a"])
  })

  it("returns the decoded value when a valid entry exists", () => {
    window.localStorage.setItem("test:exists", JSON.stringify(["x", "y"]))
    const { result } = renderHook(() =>
      useLocalStorageState("test:exists", StringSet, [])
    )
    expect(result.current[0]).toEqual(["x", "y"])
  })

  it("falls back to initial when the stored entry is malformed", () => {
    window.localStorage.setItem("test:bad", "not-json")
    const { result } = renderHook(() =>
      useLocalStorageState("test:bad", StringSet, ["fallback"])
    )
    expect(result.current[0]).toEqual(["fallback"])
  })

  it("falls back to initial when the stored entry fails schema decode", () => {
    window.localStorage.setItem("test:wrong", JSON.stringify({ not: "array" }))
    const { result } = renderHook(() =>
      useLocalStorageState("test:wrong", StringSet, ["fallback"])
    )
    expect(result.current[0]).toEqual(["fallback"])
  })

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() =>
      useLocalStorageState("test:write", StringSet, [])
    )
    act(() => result.current[1](["new", "value"]))
    expect(JSON.parse(window.localStorage.getItem("test:write")!)).toEqual([
      "new",
      "value"
    ])
    expect(result.current[0]).toEqual(["new", "value"])
  })
})
```

### Step 2: Verify dependencies — @testing-library/react

- [ ] Run: `grep "@testing-library/react" packages/frontend/package.json`
- If present: continue. If absent (likely the case — current frontend tests are pure-logic), the hook still ships but its tests get skipped from CI until that dep is added. Either add it (`bun add -D @testing-library/react @testing-library/dom` in `packages/frontend`) or write the tests without `renderHook` by exercising the underlying helpers directly. **Default**: add the dep.

### Step 3: Run the test to verify it fails

- [ ] Run: `bun run --filter @projectproject/frontend test useLocalStorageState`
- Expected: FAIL with "module not found" — the hook file doesn't exist yet.

### Step 4: Write the hook

- [ ] Create `packages/frontend/src/hooks/useLocalStorageState.ts`:

```ts
import { Either, Schema } from "effect"
import { useCallback, useState } from "react"

export function useLocalStorageState<A, I>(
  key: string,
  schema: Schema.Schema<A, I>,
  initial: A
): readonly [A, (next: A) => void] {
  const decode = Schema.decodeUnknownEither(schema)
  const encode = Schema.encodeSync(schema)

  const read = (): A => {
    if (typeof window === "undefined") return initial
    const raw = window.localStorage.getItem(key)
    if (raw === null) return initial
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return initial
    }
    const decoded = decode(parsed)
    return Either.isRight(decoded) ? decoded.right : initial
  }

  const [value, setValue] = useState<A>(read)

  const write = useCallback(
    (next: A) => {
      setValue(next)
      if (typeof window === "undefined") return
      try {
        const encoded = encode(next)
        window.localStorage.setItem(key, JSON.stringify(encoded))
      } catch {
        // Encoding failure is a developer error; swallow at runtime.
      }
    },
    [key, encode]
  )

  return [value, write] as const
}
```

### Step 5: Run the test to verify it passes

- [ ] Run: `bun run --filter @projectproject/frontend test useLocalStorageState`
- Expected: PASS on all 5 tests.

### Step 6: Commit

- [ ] Run:

```bash
git add packages/frontend/src/hooks/useLocalStorageState.ts packages/frontend/src/hooks/useLocalStorageState.test.ts packages/frontend/package.json
git commit -m "feat(frontend): typed useLocalStorageState hook backed by Effect Schema"
```

---

## Task 3: Wrap `ticketsListBaseAtom` in `Atom.optimistic` and reshape mutations

**Files:**
- Modify: `packages/frontend/src/atoms/tickets.ts`
- Test: `packages/frontend/src/atoms/tickets.test.ts` (create if missing)

### Step 1: Read the current shape

- [ ] Read `packages/frontend/src/atoms/tickets.ts` lines 83-170 to remind yourself of the layout. The `ticketsListAtom` is currently an `Atom.readable` that merges `ticketsListBaseAtom` (Initial/Success/Failure) with the local-only `ticketsListAppendedAtom`. We keep this *merging* behavior but route through an optimistic wrapper so the merged Result can carry waiting-state and so mutation atoms can apply reducers.

### Step 2: Introduce an optimistic-wrapped readable

- [ ] In `packages/frontend/src/atoms/tickets.ts`, **above** the existing `ticketsListAtom` declaration (around line 121), introduce a private merged-readable, then wrap it:

```ts
const ticketsListMergedAtom = Atom.family((key: string) =>
  Atom.readable((get): Result.Result<TicketsListValue, unknown> => {
    const base = get(ticketsListBaseAtom(key))
    const appended = get(ticketsListAppendedAtom(key))
    if (!Result.isSuccess(base)) return base
    const fresh = appended.baseTimestamp === base.timestamp
    if (!fresh || appended.items.length === 0) return base
    const merged: TicketsListValue = {
      items: [...base.value.items, ...appended.items],
      nextCursor: appended.nextCursor
    }
    return Result.success(merged, {
      waiting: base.waiting,
      timestamp: base.timestamp
    })
  })
)

export const ticketsListAtom = Atom.family((key: string) =>
  Atom.optimistic(ticketsListMergedAtom(key))
)
```

- [ ] Delete the previous `Atom.family` block that defined `ticketsListAtom` as the inline readable. The new export above replaces it. Consumers don't change their call signature.

### Step 3: Add a section-key helper

- [ ] Still in `packages/frontend/src/atoms/tickets.ts`, near the existing `ticketsListKey` export, add a helper to derive a section's list key from a base list query + status:

```ts
import type { TicketStatus } from "@projectproject/shared"

export const ticketsListKeyForStatus = (
  orgSlug: string,
  slug: string,
  baseQuery: TicketListQuery,
  status: TicketStatus
): string =>
  ticketsListKey(orgSlug, slug, {
    ...baseQuery,
    filter: { ...(baseQuery.filter ?? {}), status: [status] },
    cursor: undefined
  })
```

### Step 4: Rewrite `quickCreateTicketAtom` to target the destination section list

- [ ] Find the existing `quickCreateTicketAtom` (around line 279). Currently it targets `ticketsCountAtom(countKey)` — counts only. Replace it so it targets the destination section list, prepending the optimistic ticket.

Replace the entire `quickCreateTicketAtom` family export with:

```ts
export interface QuickCreateTicketArg {
  readonly ticket: QuickCreateTicketInput
  readonly viewerId: string
}

export const quickCreateTicketAtom = Atom.family((sectionKey: string) => {
  const { orgSlug, slug, queryJson } = splitFamilyKey(sectionKey)
  return Atom.optimisticFn(ticketsListAtom(sectionKey), {
    reducer: (current, input: QuickCreateTicketArg) => {
      if (!Result.isSuccess(current)) return current
      const status = input.ticket.status ?? ("todo" as TicketStatus)
      const predicted: Ticket = {
        id: "" as TicketId,
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
        createdBy: input.viewerId,
        createdAt: DateTime.toDate(DateTime.unsafeNow()),
        updatedAt: DateTime.toDate(DateTime.unsafeNow())
      }
      return Result.success(
        {
          items: [predicted, ...current.value.items],
          nextCursor: current.value.nextCursor
        },
        { waiting: true }
      )
    },
    fn: runtime.fn(
      Effect.fn(function* (input: QuickCreateTicketArg, get) {
        const client = yield* ApiClient
        const created = yield* client.tickets.quickCreate({
          path: { orgSlug, slug },
          payload: input.ticket
        })
        get.refresh(ticketsListBaseAtom(sectionKey))
        yield* Reactivity.invalidate(["tickets", orgSlug, slug])
        return created
      })
    )
  })
})
```

The caller convention changes: instead of passing a `countKey`, pass a **section key** — the ticketsListKey for the destination section. The top-level creators (BacklogTicketCreator, SprintTicketCreator) compute the section key matching `status: "todo"`. Per-section creators compute the section key matching their own status.

### Step 5: Add `updateTicketStatusAtom` for cross-section moves

- [ ] In `packages/frontend/src/atoms/tickets.ts`, add a new mutation atom alongside `updateTicketAtom`:

```ts
export interface UpdateTicketStatusArg {
  readonly id: TicketId
  readonly status: TicketStatus
  readonly destSectionKey: string
  readonly sourceSectionKey: string
}

export const updateTicketStatusAtom = Atom.family((projectKey: string) => {
  const { orgSlug, slug } = splitProjectKey(projectKey)
  return runtime.fn(
    Effect.fn(function* (input: UpdateTicketStatusArg, get) {
      const ticket = get(ticketBaseAtom(ticketKey(orgSlug, slug, input.id)))
      if (Result.isSuccess(ticket)) {
        const optimisticTicket: Ticket = {
          ...ticket.value,
          status: input.status,
          updatedAt: DateTime.toDate(DateTime.unsafeNow())
        }
        const destCurrent = get(ticketsListAtom(input.destSectionKey))
        if (Result.isSuccess(destCurrent)) {
          get.setSelf(
            ticketsListAtom(input.destSectionKey) as never,
            Result.success(
              {
                items: [optimisticTicket, ...destCurrent.value.items],
                nextCursor: destCurrent.value.nextCursor
              },
              { waiting: true }
            )
          )
        }
      }

      const client = yield* ApiClient
      const updated = yield* client.tickets.update({
        path: { orgSlug, slug, id: input.id },
        payload: { status: input.status }
      })
      get.refresh(ticketBaseAtom(ticketKey(orgSlug, slug, input.id)))
      get.refresh(ticketsListBaseAtom(input.sourceSectionKey))
      get.refresh(ticketsListBaseAtom(input.destSectionKey))
      yield* Reactivity.invalidate(["tickets", orgSlug, slug])
      return updated
    })
  )
})

const splitProjectKey = (key: string): { orgSlug: string; slug: string } => {
  const sep = key.indexOf("/")
  return { orgSlug: key.slice(0, sep), slug: key.slice(sep + 1) }
}

export const projectKeyFor = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`
```

> **Note:** `Atom.optimisticFn` targets a single atom — that's the canonical pattern when the prepend is the *only* optimistic write. Cross-section moves involve writing *and* removing, which is two atoms. We do the destination prepend via a direct `get.setSelf` (consult the `@effect-atom/atom-react` API — if `setSelf` is not the right name, use whatever exposes the optimistic override; cross-reference `Atom.optimistic`'s implementation). The source section refresh handles the removal eventually-consistently. If the direct-override API is unsuitable, fall back to plain `runtime.fn` with no optimism on the source side — destination still shows the row because base refresh fires synchronously after the API succeeds.

### Step 6: Update existing callers of `quickCreateTicketAtom`

The caller convention changed from `countKey` to `sectionKey`. Update the two existing callers:

- [ ] `packages/frontend/src/components/TicketList/BacklogTicketCreator.tsx` (around line 56-58):

Replace:

```tsx
const countQuery: TicketCountQuery = { filter: query.filter, q: query.q }
const countKey = ticketsCountKey(orgSlug, slug, countQuery)
const create = useAtomSet(quickCreateTicketAtom(countKey), { mode: "promiseExit" })
const createState = useAtomValue(quickCreateTicketAtom(countKey))
```

With:

```tsx
const sectionKey = ticketsListKeyForStatus(orgSlug, slug, query, "todo")
const create = useAtomSet(quickCreateTicketAtom(sectionKey), { mode: "promiseExit" })
const createState = useAtomValue(quickCreateTicketAtom(sectionKey))
```

Update the import line accordingly: drop `ticketsCountKey` from the import (if unused after this change), add `ticketsListKeyForStatus`.

- [ ] `packages/frontend/src/components/TicketList/SprintTicketCreator.tsx` (around line 67-74):

Replace:

```tsx
const countKey = ticketsCountKey(orgSlug, slug, {
  filter: { groupId: [groupId] }
})

const create = useAtomSet(quickCreateTicketAtom(countKey), {
  mode: "promiseExit"
})
const createState = useAtomValue(quickCreateTicketAtom(countKey))
```

With:

```tsx
const sectionKey = ticketsListKeyForStatus(
  orgSlug,
  slug,
  { sort: { key: "updated", dir: "desc" }, filter: { groupId: [groupId] } },
  "todo"
)

const create = useAtomSet(quickCreateTicketAtom(sectionKey), {
  mode: "promiseExit"
})
const createState = useAtomValue(quickCreateTicketAtom(sectionKey))
```

Drop the `ticketsCountKey` import if unused after this change; add `ticketsListKeyForStatus`.

### Step 7: Run typecheck

- [ ] Run: `bun run --filter @projectproject/frontend typecheck`
- Expected: PASS. If `Atom.optimisticFn`'s reducer signature complains, narrow the input type or adjust shape. Resolve before moving on.

### Step 8: Commit

- [ ] Run:

```bash
git add packages/frontend/src/atoms/tickets.ts
git commit -m "feat(frontend): optimistic-wrap ticketsListAtom, reshape mutations for sections

quickCreateTicketAtom now targets a destination section list and prepends
optimistically; updateTicketStatusAtom orchestrates cross-section moves
with destination prepend + eventual source refresh. Required by the
segmented-list rendering coming next."
```

---

## Task 4: Build `SectionHeader` component

**Files:**
- Create: `packages/frontend/src/components/TicketList/SectionHeader.tsx`

### Step 1: Add the i18n strings

- [ ] Edit `packages/frontend/messages/en/tickets.json`. Add under the existing `tickets_*` keys (preserving alphabetical order within the prefix group):

```json
"tickets_section_collapse_aria_label": "Toggle section {label}",
"tickets_section_count_aria_label": "{count} tickets",
"tickets_section_create_aria_label": "Create ticket in {label}",
"tickets_section_create_placeholder": "Ticket title…",
"tickets_section_load_more_button": "Load more ({remaining})"
```

- [ ] Run: `bun run --filter @projectproject/frontend paraglide:compile`
- Expected: success, paraglide generates updated message bindings.

### Step 2: Write the component

- [ ] Create `packages/frontend/src/components/TicketList/SectionHeader.tsx`:

```tsx
import { ChevronDown, Plus } from "lucide-react"
import type { ReactNode } from "react"
import { Hitbox } from "@/components/ui/hitbox"
import { statusLabelFor, statusMetaFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { ProjectStatus, TicketStatus } from "@projectproject/shared"

export function SectionHeader({
  status,
  statuses,
  count,
  collapsed,
  onToggleCollapsed,
  onStartCreate
}: {
  status: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
  count: number
  collapsed: boolean
  onToggleCollapsed: () => void
  onStartCreate: () => void
}): ReactNode {
  const meta = statusMetaFor(status, statuses)
  const Icon = meta.icon
  const label = statusLabelFor(status, statuses)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggleCollapsed}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggleCollapsed()
        }
      }}
      aria-expanded={!collapsed}
      aria-label={m.tickets_section_collapse_aria_label({ label })}
      className={cn(
        "sticky top-0 z-10 flex cursor-pointer items-center gap-2 rounded-t-xl border-b border-border bg-background/95 px-3 py-2 backdrop-blur",
        "transition-colors hover:bg-accent/30 active:scale-[0.997]",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <ChevronDown
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
          collapsed && "-rotate-90"
        )}
        strokeWidth={1.75}
      />
      <Icon
        className={cn("size-4 shrink-0", meta.className)}
        style={meta.color ? { color: meta.color } : undefined}
        strokeWidth={1.75}
      />
      <span className="truncate text-sm font-medium">{label}</span>
      <span
        className="rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground"
        aria-label={m.tickets_section_count_aria_label({ count })}
      >
        {count}
      </span>
      <span className="ml-auto inline-flex items-center">
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => {
            e.stopPropagation()
            onStartCreate()
          }}
          aria-label={m.tickets_section_create_aria_label({ label })}
          title={m.tickets_section_create_aria_label({ label })}
        >
          <span className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]">
            <Plus className="size-4" strokeWidth={1.75} />
          </span>
        </Hitbox>
      </span>
    </div>
  )
}
```

### Step 3: Verify typecheck

- [ ] Run: `bun run --filter @projectproject/frontend typecheck`
- Expected: PASS.

### Step 4: Commit

- [ ] Run:

```bash
git add packages/frontend/src/components/TicketList/SectionHeader.tsx packages/frontend/messages/en/tickets.json packages/frontend/src/paraglide
git commit -m "feat(frontend): SectionHeader component (sticky, collapse, create trigger)"
```

---

## Task 5: Build `SectionTicketCreator` component

**Files:**
- Create: `packages/frontend/src/components/TicketList/SectionTicketCreator.tsx`

### Step 1: Write the component

- [ ] Create `packages/frontend/src/components/TicketList/SectionTicketCreator.tsx`:

```tsx
import {
  Result,
  useAtomSet,
  useAtomValue
} from "@effect-atom/atom-react"
import * as Exit from "effect/Exit"
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent
} from "react"
import { CollapsingLabel } from "@/components/SegmentedTabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { BADGE_TONES } from "@/components/ui/badge"
import { meAtom } from "@/atoms/auth"
import {
  quickCreateTicketAtom,
  ticketsListKey,
  ticketsListKeyForStatus
} from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import { TYPE_LABELS, TYPE_META } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"
import type {
  TicketListQuery,
  TicketStatus,
  TicketType
} from "@projectproject/shared"
import { TicketCreatorShell } from "./TicketCreatorShell"

export function SectionTicketCreator({
  orgSlug,
  slug,
  status,
  query,
  onDone
}: {
  orgSlug: string
  slug: string
  status: TicketStatus
  query: TicketListQuery
  onDone: () => void
}) {
  const sectionKey = ticketsListKeyForStatus(orgSlug, slug, query, status)
  const create = useAtomSet(quickCreateTicketAtom(sectionKey), {
    mode: "promiseExit"
  })
  const createState = useAtomValue(quickCreateTicketAtom(sectionKey))
  const submitting = createState.waiting
  const error = Result.isFailure(createState)
    ? m.tickets_create_error_fallback()
    : null

  const me = useAtomValue(meAtom)
  const viewerId = Result.isSuccess(me) ? me.value.id : ""

  const [title, setTitle] = useState("")
  const [type, setType] = useState<TicketType>("other")
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const [closingMenu, setClosingMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const trimmed = title.trim()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    const exit = await create({
      ticket: { title: trimmed, type, status },
      viewerId
    })
    if (Exit.isSuccess(exit)) {
      setTitle("")
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault()
      onDone()
    }
  }

  const TypeIcon = TYPE_META[type].icon
  const typeAddon = (
    <DropdownMenu
      open={typeMenuOpen}
      onOpenChange={(open) => {
        setTypeMenuOpen(open)
        if (!open) {
          setClosingMenu(true)
          // @effect-diagnostics-next-line globalTimers:off
          setTimeout(() => {
            inputRef.current?.focus()
            setClosingMenu(false)
          }, 0)
        }
      }}
    >
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.tickets_create_type_aria_label({
              type: TYPE_LABELS[type]()
            })}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-md px-2 transition-expand",
              BADGE_TONES[TYPE_META[type].tone]
            )}
          >
            <TypeIcon className="size-4 shrink-0" strokeWidth={1.75} />
            <CollapsingLabel show contentKey={type}>
              <span className="text-xs">{TYPE_LABELS[type]()}</span>
            </CollapsingLabel>
          </button>
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-40"
        finalFocus={() => {
          setClosingMenu(false)
          return inputRef.current
        }}
      >
        {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
          const TIcon = TYPE_META[t].icon
          return (
            <DropdownMenuItem
              key={t}
              onClick={() => setType(t)}
              className="cursor-pointer"
            >
              <TIcon className="size-4" strokeWidth={1.75} />
              {TYPE_LABELS[t]()}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const trailing = error ? (
    <span className="shrink-0 text-xs text-destructive">{error}</span>
  ) : null

  return (
    <TicketCreatorShell
      formProps={{
        "data-active": true,
        onBlur: (e: React.FocusEvent<HTMLFormElement>) => {
          if (typeMenuOpen || closingMenu) return
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          onDone()
        }
      }}
      inputRef={inputRef}
      value={title}
      onValueChange={setTitle}
      onKeyDown={onKeyDown}
      onSubmit={onSubmit}
      expanded
      placeholder={m.tickets_section_create_placeholder()}
      ariaLabel={m.tickets_section_create_placeholder()}
      disabled={submitting}
      maxLength={200}
      leadingAddons={[typeAddon]}
      trailing={trailing}
    />
  )
}
```

### Step 2: Verify typecheck

- [ ] Run: `bun run --filter @projectproject/frontend typecheck`
- Expected: PASS. Inspect `TicketCreatorShell`'s public API — if it doesn't expose `onBlur` via `formProps`, drop into the file at `packages/frontend/src/components/TicketList/TicketCreatorShell.tsx` and confirm the prop shape, adjusting this component to match.

### Step 3: Commit

- [ ] Run:

```bash
git add packages/frontend/src/components/TicketList/SectionTicketCreator.tsx
git commit -m "feat(frontend): SectionTicketCreator — inline morph creator for sections"
```

---

## Task 6: Build `SectionList` component

**Files:**
- Create: `packages/frontend/src/components/TicketList/SectionList.tsx`
- Modify: `packages/frontend/src/components/TicketList/FilteredList.tsx` (extract `Row`)

### Step 1: Extract `Row` from `FilteredList.tsx`

- [ ] Open `packages/frontend/src/components/TicketList/FilteredList.tsx`. Move the `RowImpl` component (lines 143-251) and the `isInteractiveTarget` helper (lines 255-264) into a new file `packages/frontend/src/components/TicketList/Row.tsx`. Export `Row` (the memoized version) from there.

`packages/frontend/src/components/TicketList/Row.tsx`:

```tsx
import { memo, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { TicketGitChip } from "@/components/TicketGit"
import { cn } from "@/lib/utils"
import type { Group, Member, Ticket } from "@projectproject/shared"
import { AssigneeRowTrigger } from "./AssigneeField"
import { PriorityButton } from "./PriorityField"
import { SprintField } from "./SprintField"
import { StatusButton } from "./StatusField"
import { TypeButton } from "./TypeField"

function RowImpl({
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
  const navigate = useNavigate()
  const open = () => {
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id: ticket.id }
    })
  }
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(e.target, e.currentTarget)) return
    open()
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return
    if (isInteractiveTarget(e.target, e.currentTarget)) return
    e.preventDefault()
    open()
  }

  return (
    <div className="group/list-row col-span-full grid grid-cols-subgrid">
      <div
        role="link"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "col-span-full grid cursor-pointer grid-cols-subgrid items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/30 focus-visible:ring-1 focus-visible:ring-ring"
        )}
      >
        <StatusButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          stopPropagation
        />
        <PriorityButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          stopPropagation
        />
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {ticket.id}
        </span>
        <div className="flex min-w-0 items-center">
          <span className="min-w-0 truncate text-sm font-medium">
            {ticket.title}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2 pl-3">
            <TicketGitChip orgSlug={orgSlug} slug={slug} ticket={ticket} />
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
      </div>
    </div>
  )
}

function isInteractiveTarget(
  target: EventTarget,
  row: HTMLDivElement
): boolean {
  if (!(target instanceof Element)) return false
  const interactive = target.closest(
    "a,button,input,select,textarea,[role='button'],[role='menuitem']"
  )
  return interactive !== null && row.contains(interactive)
}

export const Row = memo(RowImpl)
```

Update `FilteredList.tsx` to import `Row` from `./Row` instead of defining it locally. Delete the inlined `RowImpl`, `Row`, and `isInteractiveTarget` from `FilteredList.tsx`.

### Step 2: Write `SectionList`

- [ ] Create `packages/frontend/src/components/TicketList/SectionList.tsx`:

```tsx
import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { motion, AnimatePresence } from "motion/react"
import { Loader2 } from "lucide-react"
import { useDeferredValue, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  loadMoreTicketsAtom,
  ticketsListAtom,
  ticketsListKeyForStatus,
  type TicketsListValue
} from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type {
  Group,
  Member,
  Ticket,
  TicketId,
  TicketListQuery,
  TicketStatus,
  ProjectStatus
} from "@projectproject/shared"
import { Row } from "./Row"
import { SectionHeader } from "./SectionHeader"
import { SectionTicketCreator } from "./SectionTicketCreator"

const EMPTY_ITEMS: ReadonlyArray<Ticket> = []

export function SectionList({
  orgSlug,
  slug,
  status,
  statuses,
  query,
  count,
  collapsed,
  onToggleCollapsed,
  members,
  sprintMembership,
  extraRowActions,
  showSprintCol,
  showExtraActionsCol
}: {
  orgSlug: string
  slug: string
  status: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
  query: TicketListQuery
  count: number
  collapsed: boolean
  onToggleCollapsed: () => void
  members: ReadonlyArray<Member>
  sprintMembership?: ReadonlyMap<TicketId, Group>
  extraRowActions?: (ticket: Ticket) => ReactNode
  showSprintCol: boolean
  showExtraActionsCol: boolean
}) {
  const sectionKey = ticketsListKeyForStatus(orgSlug, slug, query, status)
  const deferredKey = useDeferredValue(sectionKey)
  const list = useAtomValue(ticketsListAtom(deferredKey))
  const isStaleKey = sectionKey !== deferredKey

  const previousRef = useRef<TicketsListValue | null>(null)
  if (Result.isSuccess(list)) previousRef.current = list.value

  const loadMore = useAtomSet(loadMoreTicketsAtom(deferredKey))
  const loadMoreState = useAtomValue(loadMoreTicketsAtom(deferredKey))
  const loadingMore = loadMoreState.waiting

  const [creating, setCreating] = useState(false)

  const items: ReadonlyArray<Ticket> = Result.isSuccess(list)
    ? list.value.items
    : (previousRef.current?.items ?? EMPTY_ITEMS)
  const nextCursor: string | null = Result.isSuccess(list)
    ? list.value.nextCursor
    : (previousRef.current?.nextCursor ?? null)
  const waiting =
    (Result.isSuccess(list) && list.waiting === true) || isStaleKey

  const remaining = Math.max(0, count - items.length)

  const gridCols = cn(
    "grid divide-y divide-border border-x border-b border-border bg-background",
    showExtraActionsCol
      ? "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto]"
      : "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]",
    waiting && "animate-pulse",
    "rounded-b-xl"
  )

  return (
    <div className="flex flex-col">
      {creating ? (
        <div className="sticky top-0 z-10 rounded-t-xl border border-border bg-background/95 px-2 py-2 backdrop-blur">
          <SectionTicketCreator
            orgSlug={orgSlug}
            slug={slug}
            status={status}
            query={query}
            onDone={() => setCreating(false)}
          />
        </div>
      ) : (
        <SectionHeader
          status={status}
          statuses={statuses}
          count={count}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
          onStartCreate={() => setCreating(true)}
        />
      )}

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {items.length === 0 ? (
              <div className="rounded-b-xl border-x border-b border-border bg-background px-3 py-4 text-center text-xs text-muted-foreground">
                —
              </div>
            ) : (
              <ul className={gridCols}>
                {items.map((t) => {
                  const membership = sprintMembership?.get(t.id) ?? null
                  return (
                    <li
                      key={t.id}
                      className="col-span-full grid grid-cols-subgrid"
                    >
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
            )}

            {nextCursor !== null && (
              <div className="flex justify-center border-x border-b border-border bg-background py-2">
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  onClick={() => loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        strokeWidth={1.75}
                      />
                      {m.tickets_load_more_loading()}
                    </>
                  ) : (
                    m.tickets_section_load_more_button({ remaining })
                  )}
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

### Step 3: Verify typecheck

- [ ] Run: `bun run --filter @projectproject/frontend typecheck`
- Expected: PASS.

### Step 4: Commit

- [ ] Run:

```bash
git add packages/frontend/src/components/TicketList/Row.tsx packages/frontend/src/components/TicketList/SectionList.tsx packages/frontend/src/components/TicketList/FilteredList.tsx
git commit -m "feat(frontend): SectionList + extract Row from FilteredList"
```

---

## Task 7: Build `SegmentedList` orchestration component

**Files:**
- Create: `packages/frontend/src/components/TicketList/SegmentedList.tsx`

### Step 1: Write the orchestrator

- [ ] Create `packages/frontend/src/components/TicketList/SegmentedList.tsx`:

```tsx
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { useMemo, type ReactNode } from "react"
import { FilterX, ListChecks } from "lucide-react"
import * as Schema from "effect/Schema"
import { useLocalStorageState } from "@/hooks/useLocalStorageState"
import { boardStatusesFor } from "@/components/sprints/board-utils"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import {
  projectKey as projectStatusKey,
  projectStatusesAtom
} from "@/atoms/projectStatuses"
import { ticketsCountAtom, ticketsCountKey } from "@/atoms/tickets"
import { m } from "@/paraglide/messages"
import type {
  Group,
  Member,
  ProjectStatus,
  Ticket,
  TicketCountQuery,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@projectproject/shared"
import { useResetTicketSearch } from "./url"
import { SectionList } from "./SectionList"

const CollapsedSchema = Schema.Array(Schema.String)
const EMPTY_STATUSES: ReadonlyArray<ProjectStatus> = []
const EMPTY_COLLAPSED: ReadonlyArray<string> = []

export function SegmentedList({
  orgSlug,
  slug,
  query,
  members,
  extraRowActions,
  sprintMembership,
  hasActiveFilter
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
  hasActiveFilter: boolean
}) {
  const resetFilters = useResetTicketSearch()

  const statusesResult = useAtomValue(
    projectStatusesAtom(projectStatusKey(orgSlug, slug))
  )
  const statuses: ReadonlyArray<ProjectStatus> = Result.isSuccess(statusesResult)
    ? statusesResult.value
    : EMPTY_STATUSES

  const countQuery: TicketCountQuery = { filter: query.filter, q: query.q }
  const countsResult = useAtomValue(
    ticketsCountAtom(ticketsCountKey(orgSlug, slug, countQuery))
  )
  const counts = Result.isSuccess(countsResult)
    ? countsResult.value
    : { total: 0, byStatus: {} as Record<string, number> }

  const filteredStatuses: ReadonlyArray<TicketStatus> = useMemo(() => {
    const requested = query.filter?.status
    const allOrdered = boardStatusesFor(statuses) as ReadonlyArray<TicketStatus>
    if (requested !== undefined && requested.length > 0) {
      return allOrdered.filter((s) => requested.includes(s))
    }
    if (!hasActiveFilter) return allOrdered
    return allOrdered.filter((s) => (counts.byStatus[s] ?? 0) > 0)
  }, [statuses, query.filter, hasActiveFilter, counts.byStatus])

  const [collapsedRaw, setCollapsedRaw] = useLocalStorageState(
    `projectproject:ticket-list-collapsed:${orgSlug}/${slug}`,
    CollapsedSchema,
    EMPTY_COLLAPSED
  )
  const collapsedSet = useMemo(() => new Set(collapsedRaw), [collapsedRaw])
  const toggleCollapsed = (status: TicketStatus) => {
    if (collapsedSet.has(status)) {
      setCollapsedRaw(collapsedRaw.filter((s) => s !== status))
    } else {
      setCollapsedRaw([...collapsedRaw, status])
    }
  }

  const showSprintCol =
    sprintMembership !== undefined && sprintMembership.size > 0
  const showExtraActionsCol = extraRowActions !== undefined

  if (counts.total === 0 && !hasActiveFilter) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecks strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle>{m.tickets_empty_title()}</EmptyTitle>
          <EmptyDescription>
            {m.tickets_empty_hint_prefix()}{" "}
            <span className="font-mono">{m.tickets_empty_hint_folder()}</span>.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (filteredStatuses.length === 0 && hasActiveFilter) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FilterX strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle>{m.tickets_no_filter_matches_title()}</EmptyTitle>
          <EmptyDescription>{m.tickets_no_filter_matches()}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            leadingIcon={FilterX}
            onClick={resetFilters}
          >
            {m.tickets_filters_clear_all()}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {filteredStatuses.map((status) => (
        <SectionList
          key={status}
          orgSlug={orgSlug}
          slug={slug}
          status={status}
          statuses={statuses}
          query={query}
          count={counts.byStatus[status] ?? 0}
          collapsed={collapsedSet.has(status)}
          onToggleCollapsed={() => toggleCollapsed(status)}
          members={members}
          sprintMembership={sprintMembership}
          extraRowActions={extraRowActions}
          showSprintCol={showSprintCol}
          showExtraActionsCol={showExtraActionsCol}
        />
      ))}
    </div>
  )
}
```

### Step 2: Verify typecheck

- [ ] Run: `bun run --filter @projectproject/frontend typecheck`
- Expected: PASS.

### Step 3: Commit

- [ ] Run:

```bash
git add packages/frontend/src/components/TicketList/SegmentedList.tsx
git commit -m "feat(frontend): SegmentedList orchestrator (sections + empty states + collapse state)"
```

---

## Task 8: Wire `SegmentedList` into `TicketList`

**Files:**
- Modify: `packages/frontend/src/components/TicketList/index.tsx`

### Step 1: Replace the FilteredList render path

- [ ] Open `packages/frontend/src/components/TicketList/index.tsx`. Replace the entire file with:

```tsx
import type { ReactNode } from "react"
import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { SegmentedList } from "./SegmentedList"
import { Toolbar } from "./Toolbar"
import type {
  Group,
  Member,
  Ticket,
  TicketId,
  TicketListQuery
} from "@projectproject/shared"

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
  const hasActiveFilter =
    (query.filter !== undefined && Object.keys(query.filter).length > 0) ||
    (query.q !== undefined && query.q.length > 0)

  return (
    <div className="group/list flex flex-col gap-3">
      {creator ?? (
        <BacklogTicketCreator orgSlug={orgSlug} slug={slug} query={query} />
      )}

      <div className="flex flex-col gap-3 transition-opacity duration-200 ease-out group-has-[form[data-active]]/list:opacity-35">
        <Toolbar
          orgSlug={orgSlug}
          slug={slug}
          query={query}
          members={members}
          showSprintFilter={showSprintFilter}
        />

        <SegmentedList
          orgSlug={orgSlug}
          slug={slug}
          query={query}
          members={members}
          extraRowActions={extraRowActions}
          sprintMembership={sprintMembership}
          hasActiveFilter={hasActiveFilter}
        />
      </div>
    </div>
  )
}
```

### Step 2: Verify typecheck

- [ ] Run: `bun run --filter @projectproject/frontend typecheck`
- Expected: PASS.

### Step 3: Commit

- [ ] Run:

```bash
git add packages/frontend/src/components/TicketList/index.tsx
git commit -m "feat(frontend): wire SegmentedList into TicketList; drop FilteredList render path"
```

---

## Task 9: Switch `StatusField` to the cross-section optimistic atom

**Files:**
- Modify: `packages/frontend/src/components/TicketList/StatusField.tsx`

### Step 1: Replace the mutation set

- [ ] In `StatusField.tsx`, both `StatusBadgeTrigger` (line 92) and `StatusButton` (line 154) currently call `updateTicketAtom`. Replace them with `updateTicketStatusAtom`, computing source/dest section keys from the current and target status. The caller passes the active `query` so we can derive keys.

Update the component signatures to take `query: TicketListQuery`:

```tsx
import {
  ticketKey,
  ticketsListKeyForStatus,
  updateTicketStatusAtom,
  projectKeyFor
} from "@/atoms/tickets"
import type { TicketListQuery } from "@projectproject/shared"
```

In `StatusButton`:

```tsx
export function StatusButton({
  orgSlug,
  slug,
  ticket,
  query,
  stopPropagation,
  size = "sm"
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; status: TicketStatus }
  query: TicketListQuery
  stopPropagation?: boolean
  size?: "sm" | "lg"
}) {
  const update = useAtomSet(updateTicketStatusAtom(projectKeyFor(orgSlug, slug)))
  // ...
  // when calling:
  onSelect={(status) =>
    update({
      id: ticket.id,
      status,
      sourceSectionKey: ticketsListKeyForStatus(orgSlug, slug, query, ticket.status),
      destSectionKey: ticketsListKeyForStatus(orgSlug, slug, query, status)
    })
  }
```

Apply the same change to `StatusBadgeTrigger`. The `TicketPage` callers of `StatusBadgeTrigger` aren't list-bound — pass a placeholder query `{ sort: { key: "updated", dir: "desc" } }` (defaultQuery). On the ticket detail page the cross-section refresh is harmless even though the user isn't currently looking at a list.

### Step 2: Update callers

- [ ] Update `Row.tsx` to pass `query` through to `<StatusButton>`. The `Row` component receives a new optional `query: TicketListQuery` prop and forwards it.
- [ ] Update `SectionList.tsx` (it already has `query`) to forward `query` to `<Row>`.
- [ ] Update `TicketPage.tsx` (the place that renders `StatusBadgeTrigger`) — pass the default `TicketListQuery`.
- [ ] Run a grep for any other callsite that renders `<StatusButton>` or `<StatusBadgeTrigger>` and confirm each has the query in scope. Search: `grep -r "StatusButton\|StatusBadgeTrigger" packages/frontend/src --include="*.tsx"`.

### Step 3: Verify typecheck

- [ ] Run: `bun run --filter @projectproject/frontend typecheck`
- Expected: PASS.

### Step 4: Commit

- [ ] Run:

```bash
git add packages/frontend/src/components/TicketList packages/frontend/src/components/TicketPage
git commit -m "feat(frontend): route status changes through updateTicketStatusAtom"
```

---

## Task 10: Manual verification pass

**Goal:** Wouter exercises the feature in the running dev server and we resolve regressions. We do not drive the browser ourselves (see memory: feedback_no_playwright).

### Step 1: Start the dev server (Wouter does this)

- [ ] Tell Wouter: "Start the dev server (`bun run dev` from `packages/frontend`) if it isn't already running."

### Step 2: Run through the manual checklist (Wouter does this)

- [ ] Hand Wouter this checklist verbatim:

> **T-97 manual checklist** (please run through these and flag anything that feels wrong):
>
> 1. Open a project with multiple tickets across statuses → confirm sections render, in kanban order, with counts.
> 2. Empty sections under no filter → render (header visible, body collapsed-feeling).
> 3. Apply a filter (e.g. assignee=me) that wipes out one status → that section disappears.
> 4. Apply a search that matches nothing → see the "no filter matches" empty state with the clear button.
> 5. Open a brand-new project with no tickets → see the `<NoTicketsYet />` fallback (not a list of empty sections).
> 6. Click a section header → collapses; chevron rotates; rows hide.
> 7. Refresh the page → collapsed state persists for this project. Switch projects → collapsed state of the first is not applied to the second.
> 8. Scroll deep inside an expanded section → the header sticks to the top of the scroll container, status icon + name + count visible.
> 9. Click the "+" on a section header → the header chrome morphs to an inline creator with the type chip; input is focused.
> 10. Press Escape → reverts to header chrome.
> 11. Click outside the form → reverts.
> 12. Type a title + press Enter → new ticket prepends in the section, input clears, stays focused for the next title.
> 13. Change a ticket's status from its row dropdown → row appears at the top of the destination section *immediately*; old row stays in the source for ~200ms then disappears. Acceptable.
> 14. Use the toolbar's StatusSelect to filter to a single status → only that section renders (with its header).
> 15. Visit a sprint detail page (list view) → segmentation also applies; the sprint chip should be present on per-section creators only if `SprintTicketCreator` is in scope — for T-97 v1, section creators do NOT get the sprint chip even on sprint pages. Confirm sprint assignment of newly-created section tickets is **NOT expected to land on the active sprint** automatically (that's a known gap; out of scope for T-97).
> 16. Confirm hover behavior on rows still snaps in / eases out (CLAUDE.md rule).
> 17. Confirm every button still has `active:scale-[0.97]` press feel.

### Step 3: Address feedback

- [ ] For each regression Wouter reports, open a focused fix commit. Repeat until the checklist is clean.

### Step 4: Final commit / push / PR

- [ ] Once the checklist is green, run:

```bash
git push -u origin feat/T-97-status-section-headers
gh pr create --base feat/T-65-custom-ticket-columns --title "feat: segmented status headers on list views (T-97)" --body "$(cat <<'EOF'
## Summary
- Segmented `TicketList` by status — sticky per-section headers, counts, per-section load-more.
- Per-section "+" rapid creator that morphs from the header in place.
- Cross-section optimism on status changes via `updateTicketStatusAtom`.
- localStorage-persisted per-project collapsed state behind a new typed `useLocalStorageState` hook.
- Added optional `status` to `QuickCreateTicketInput` (validated against project statuses).

Builds on T-65. Local-first / IndexedDB direction noted as a separate effort — no normalized store introduced here.

## Test plan
- [ ] backend: `bun run --filter @projectproject/backend test Layers/Tickets.test.ts`
- [ ] frontend: `bun run --filter @projectproject/frontend test`
- [ ] manual checklist from `docs/superpowers/plans/2026-05-21-T-97-segmented-status-headers.md` task 10

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> **Note:** the PR base is `feat/T-65-custom-ticket-columns` (where this branch was cut from), not `main`. If T-65 has landed by the time T-97 ships, rebase onto `main` first and change the base.

---

## Notes for the implementing engineer

- **`Atom.optimisticFn` is single-target.** That's why the cross-section update uses a custom `runtime.fn` with a direct optimistic write (`get.setSelf` or equivalent) on the destination list instead of `Atom.optimisticFn`. If the `@effect-atom/atom-react` API has changed and `setSelf` isn't the right primitive, look at how `Atom.optimistic` internally exposes the override, or fall back to plain non-optimistic for the destination (the source refresh will still pull the new state — UX is worse but functional). Test in browser before committing.
- **Don't introduce a normalized atom store.** That's explicitly out of scope (see ticket body). Local-first work owns that surface; we don't want a stepping stone.
- **Don't add comments.** CLAUDE.md is firm on this. The structure should carry the meaning.
- **i18n.** Every user-visible string goes through paraglide. Don't inline literals.
- **Hover transition utility.** Any new hover-affected element must have `transition-colors` (or appropriate transition) per CLAUDE.md so the global hover-asymmetry rule applies.
- **Press feel.** Every interactive button needs `active:scale-[0.97]` paired with `transition-transform duration-100`.
