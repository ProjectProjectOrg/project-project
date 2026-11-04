# Inline form primitive + connect-branch flow

**Date:** 2026-05-05
**Status:** Approved (design)

## Problem

`TicketGitPanel` toggles between an idle "display + actions" row and one of two inline forms (create branch, open PR). The local `mode` state, conditional rendering, and per-form busy/error state are duplicated across rows and don't surface a clean reusable shape. Two concrete gaps motivate revisiting now:

1. **No connect-branch flow.** Users can only create a new branch; there is no way to associate a ticket with an existing remote branch.
2. **Pending state is invisible past the form.** While `createBranchAtom` does refresh `projectGitStatesAtom` after success, the form closes synchronously on the mutation resolving and the chip can flash empty until the GraphQL roundtrip lands. Outside the form there is no indication that work is in flight.

We will fix both by extracting a generic `InlineForm` compound component (display / actions / forms) and rebuilding `TicketGitPanel` on top of it. The connect-branch flow is the second consumer that validates the API.

## Goals

- A reusable `InlineForm` primitive in `components/ui/` that captures the "display → action → inline form" pattern with composition, not boolean props.
- A "connect branch" action on tickets with no branch yet, surfaced as a combobox (search above, results list below) styled to match the existing create-branch row.
- Pending state visible in the form itself: the form stays mounted while a mutation is in flight, with disabled triggers/cancel until it resolves.
- New backend endpoints to list branches (server-side filtered) and attach an existing branch to a ticket, with existence verification at attach-time.

## Non-goals

- Optimistic updates to `projectGitStatesAtom`. We rely on `get.refresh` after mutation success; if latency proves painful in practice we'll revisit.
- Pending markers in `TicketGitChip` (the collapsed list-row badge). The chip stays as-is.
- Promoting the primitive's submit handling. `InlineForm` will not own submit semantics — each form provides its own `<Button>` and calls into the context for `setBusy` / `close`.
- Other consumers of `InlineForm` outside `TicketGit` in this iteration.

## Composition primitive: `InlineForm`

Location: `packages/frontend/src/components/ui/inline-form.tsx`. Exports a namespace `InlineForm` and a `useInlineForm` hook.

### Mode model

```ts
type InlineFormMode<A extends string> = "idle" | A

interface InlineFormContextValue<A extends string = string> {
  mode: InlineFormMode<A>
  open: (action: A) => void
  close: () => void // returns mode to "idle" and resets busy to false
  busy: boolean
  setBusy: (b: boolean) => void
}
```

The action union `A` is generic on `Root`. Consumers can annotate explicitly (`<InlineForm.Root<"create" | "connect">>`) for type-narrowing on `Trigger` / `Form`. Default is `string` for ergonomics when narrowing isn't needed.

### Components

- **`<InlineForm.Root>`** — provides context. Props: `defaultMode?: InlineFormMode<A>` (default `"idle"`), optional controlled `mode` / `onModeChange`, `className?`, `children`. Renders a `<div>` whose default classes mirror the current `TicketGitPanel` shell (`rounded-lg border border-border bg-background px-3 py-2`); `className` overrides via `cn`.
- **`<InlineForm.Idle>`** — children only, renders only when `mode === "idle"`. Default layout: `flex items-center gap-2`.
- **`<InlineForm.Display>`** — semantic wrapper for the "what's there now" zone. Class hook only.
- **`<InlineForm.Actions>`** — semantic wrapper for trigger buttons. Default classes push it right (`ml-auto flex items-center gap-2`).
- **`<InlineForm.Trigger action={A}>`** — wraps `Button` from `@/components/ui/button`. Forwards all `Button` props except `onClick`; `onClick` is bound to `() => open(action)`. Disabled when `busy`.
- **`<InlineForm.Form action={A}>`** — children only, renders only when `mode === action`. Children call `useInlineForm()` to access `close` / `busy` / `setBusy`.
- **`<InlineForm.Cancel>`** — convenience: ghost `Button` with `X` icon, calls `close()`. Disabled when `busy`. Forwards children/className.

### Behavior

- `close()` resets `mode` to `"idle"` _and_ sets `busy` to `false`. This guards against forms that throw without resetting busy.
- `Trigger` and `Cancel` are disabled while `busy === true`. Form-author-supplied submit buttons are responsible for their own disabled state.
- Pending UX (option B): forms remain mounted while `busy === true`. On success, the form calls `close()`; on error, the form sets `busy = false` (or returns early before setting busy true) and displays its own inline error.
- React 19: use `use(InlineFormContext)` per `react19-no-forwardref`. No `forwardRef`.

### Why no `<InlineForm.Submit>`

Submit semantics differ across forms: different mutation atoms, payloads, error taxonomies. A generic `Submit` would be a thin wrapper around `Button` that adds nothing. Per `architecture-avoid-boolean-props` we let consumers compose their own submit `<Button>` and call `setBusy` / `close` themselves. The primitive owns mode + busy plumbing; it does not own form lifecycles.

## Backend additions

### `listBranches`

- Group: `projects`.
- `GET /projects/:slug/github/branches`.
- urlParams: `{ q?: Schema.String, first?: Schema.NumberFromString }` (default `first = 30`).
- Success: `Schema.Struct({ items: Schema.Array(Schema.Struct({ name: Schema.String, isProtected: Schema.Boolean })), hasMore: Schema.Boolean })`.
- Errors: `Unauthorized | NotFound | GitHubTokenExpired | GitHubScopeInsufficient | GitHubError`.
- Implementation: a new method `GitHub.listBranches({ owner, repo, q, first })` that issues a GraphQL query against `repository.refs(refPrefix:"refs/heads/", query:$q, first:$first)`. `hasMore = pageInfo.hasNextPage`.

### `attachBranch`

- Group: `tickets`.
- `POST /projects/:slug/tickets/:id/attach-branch`.
- Payload: `Schema.Struct({ name: Schema.String })`.
- Success: `TicketDetail`.
- Errors: `Unauthorized | NotFound | Forbidden | GitHubTokenExpired | GitHubScopeInsufficient | RepoGone | GitHubError | BranchNotFound`.
- Behavior: verify the branch via `GitHub.branchExists({ owner, repo, name })` — a GraphQL `repository.ref(qualifiedName:"refs/heads/<name>")` check. If null, fail with `BranchNotFound({ name })`. Otherwise persist `branchName = name` on the ticket through the existing `Tickets` service and return `TicketDetail` (same shape `createBranch` returns).

### `BranchNotFound` error

New tagged error in `packages/shared/src/errors.ts` (next to `BranchExists`, `BranchProtected`):

```ts
export class BranchNotFound extends Schema.TaggedError<BranchNotFound>()(
  "BranchNotFound",
  { name: Schema.String }
) {}
```

## Frontend additions

### Atoms (`packages/frontend/src/atoms/github.ts`)

- `branchesAtom = Atom.family((args: { slug: string; q: string }) => runtime.atom(...).pipe(Atom.setIdleTTL("1 minute")))` — keyed on `slug + q`. Empty string is its own key (the "no filter" view, ranked by GitHub's default ordering).
- `attachBranchAtom = runtime.fn(({ slug, id, name }, get) => ...)` — calls `client.tickets.attachBranch`, then `get.refresh` of `ticketAtom(ticketKey(slug, id))`, `ticketsListAtom(slug)`, `projectGitStatesAtom(slug)` (mirrors `createBranchAtom`).

### File reorganization

`TicketGit.tsx` becomes a thin orchestrator. The three forms move into co-located files:

- `packages/frontend/src/components/TicketGit/CreateBranchFields.tsx`
- `packages/frontend/src/components/TicketGit/ConnectBranchFields.tsx` (new)
- `packages/frontend/src/components/TicketGit/OpenPrFields.tsx`

`TicketGitChip` is unchanged and stays in `TicketGit.tsx` (or is split into `TicketGit/Chip.tsx`; decided at impl).

### `TicketGitPanel` shape

Per `state.tag === "no_branch"`:

```tsx
<InlineForm.Root<"create" | "connect">>
  <InlineForm.Idle>
    <InlineForm.Display>
      <span className="text-xs text-muted-foreground">No branch yet.</span>
    </InlineForm.Display>
    <InlineForm.Actions>
      <InlineForm.Trigger action="create" size="sm" leadingIcon={Plus}>
        Create branch
      </InlineForm.Trigger>
      <InlineForm.Trigger
        action="connect"
        size="sm"
        variant="tertiary"
        leadingIcon={GitBranch}
      >
        Connect branch
      </InlineForm.Trigger>
    </InlineForm.Actions>
  </InlineForm.Idle>
  <InlineForm.Form action="create">
    <CreateBranchFields
      slug={slug}
      ticket={ticket}
      branchTemplate={branchTemplate}
      github={github}
    />
  </InlineForm.Form>
  <InlineForm.Form action="connect">
    <ConnectBranchFields slug={slug} ticket={ticket} />
  </InlineForm.Form>
</InlineForm.Root>
```

The `branch_no_pr`, `pr_closed`, and `stale_branch` states each get their own `<InlineForm.Root>` with the appropriate trigger set (`open_pr`, `clear`). The current `ClearBranchButton` two-step confirm becomes a small `<InlineForm.Form action="clear">` containing just the confirm/cancel buttons — staying consistent with the "everything inline, no dialogs" rule.

### `ConnectBranchFields` (combobox)

Layout mirrors `CreateBranchFields`:

- Top: `Input autoFocus`, debounced 200ms via local state, drives `q` in `branchesAtom({ slug, q })`.
- Below: scrollable list (`max-h-48 overflow-y-auto`), each row a `<button>` with the branch name (font-mono), keyboard navigable (arrow keys + Enter), with a muted "protected" tag when `isProtected`.
- States: `Result.isInitial` → skeleton rows; success with empty `items` → muted "No branches found"; failure → inline destructive text.
- Footer: `<InlineForm.Cancel>` + primary `Button` "Connect", disabled until a branch is selected. Submit calls `attachBranchAtom` wrapped in `useInlineForm().setBusy(true)` / `setBusy(false)`. On success → `close()`. On `BranchNotFound` → keep the form open with an inline error and refresh `branchesAtom` (the branch was deleted between list and submit). Other tagged errors map to the same strings used by `CreateBranchFields`.

### Combobox base

If `cmdk` (the shadcn `Command` primitive's dependency) is already installed, build the combobox on top of it. If not — confirm with Wouter before adding. Hand-roll fallback is fine and small (search input + filtered button list with arrow-key handling).

## Pending UX

Decided: option B (form stays mounted while busy). Concretely:

- The form sets `setBusy(true)` immediately before `await mutation(...)` and either calls `close()` on success (which also resets busy) or `setBusy(false)` on a caught error.
- `<InlineForm.Trigger>` and `<InlineForm.Cancel>` are disabled while `busy`.
- Submit `<Button>` inside the form is the form's responsibility to disable.
- `TicketGitChip` does not surface pending state in this iteration.

## Files touched

**New:**

- `packages/frontend/src/components/ui/inline-form.tsx`
- `packages/frontend/src/components/TicketGit/ConnectBranchFields.tsx`
- `packages/frontend/src/components/TicketGit/CreateBranchFields.tsx` (extracted)
- `packages/frontend/src/components/TicketGit/OpenPrFields.tsx` (extracted)

**Edited:**

- `packages/frontend/src/components/TicketGit.tsx` — orchestrator + chip
- `packages/frontend/src/atoms/github.ts` — add `branchesAtom`, `attachBranchAtom`
- `packages/shared/src/api.ts` — add `listBranches`, `attachBranch`
- `packages/shared/src/errors.ts` — add `BranchNotFound`
- `packages/backend/src/services/GitHub.ts` — add `listBranches`, `branchExists`
- `packages/backend/src/services/Tickets.ts` — add `attachBranch`
- `packages/backend/src/handlers/projects.ts` — wire `listBranches`
- `packages/backend/src/handlers/tickets.ts` — wire `attachBranch`

## Open items confirmed at implementation time

- `cmdk` availability for the combobox. Hand-roll if absent (no new deps without confirmation).
- Exact existing-error filename in `packages/shared` (verified: `packages/shared/src/errors.ts`).
- Whether `branchesAtom` should accept an `enabled` flag so we don't fetch until the connect form opens. Likely yes via a separate atom-family argument; decide at impl based on Atom.family ergonomics.

## Testing

- Backend: unit-level tests for `GitHub.listBranches` and `branchExists` using the existing mocked Octokit harness. Integration test for `attachBranch` covering the `BranchNotFound` path and the happy path (mirrors existing `createBranch` test shape).
- Frontend: smoke-test the `InlineForm` primitive's mode transitions and `busy` gating with a small Vitest + Testing Library suite. The forms themselves are exercised manually in the dev server (per CLAUDE.md UI policy).
