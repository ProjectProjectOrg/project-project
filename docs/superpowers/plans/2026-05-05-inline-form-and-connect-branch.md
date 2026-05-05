# Inline form primitive + connect-branch flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a generic `InlineForm` compound-component primitive and rebuild `TicketGitPanel` on top of it, adding a "connect existing branch" action with a combobox plus a backend `listBranches` + `attachBranch` slice.

**Architecture:** Vertical-slice build, contract-first. Shared error and HTTP API endpoints come first so the typed seam between backend and frontend remains green at every checkpoint. Service layer next, then handlers, then frontend atoms, then UI: the `InlineForm` primitive in `components/ui/`, then existing forms refit onto it, then the new `ConnectBranchFields` combobox, then the `TicketGitPanel` rewrite. Compound components share a context (`useInlineForm`) with `mode`/`open`/`close`/`busy`/`setBusy`. Forms own their own submit semantics; the primitive owns mode + busy plumbing.

**Tech stack:** Effect v3, `@effect/platform` HttpApi, Octokit + GraphQL, Drizzle, Postgres, TanStack Start + Router, `@effect-atom/atom-react`, shadcn/Radix UI, Tailwind, Lucide icons. No new runtime deps.

**Testing convention.** This codebase currently has only one backend test file (`packages/backend/src/main.test.ts`) and no frontend test setup. Per CLAUDE.md, UI changes are verified by running the dev server and exercising the feature in a browser. The plan therefore relies on:

1. `bun typecheck` after every task that changes the typed seam (shared → backend → frontend).
2. Manual verification of the UI flows in Task 10 against a dev server.

If you want unit tests for `GitHub.listBranches`, `GitHub.branchExists`, or `Tickets.attachBranch`, add them as a follow-up — there is no existing harness to mirror.

---

## File map

**Created:**

- `packages/frontend/src/components/ui/inline-form.tsx` — the compound-component primitive.
- `packages/frontend/src/components/TicketGit/CreateBranchFields.tsx` — extracted from current `TicketGit.tsx`, refit onto `useInlineForm`.
- `packages/frontend/src/components/TicketGit/OpenPrFields.tsx` — extracted, refit.
- `packages/frontend/src/components/TicketGit/ConnectBranchFields.tsx` — new combobox form.
- `packages/frontend/src/components/TicketGit/ClearBranchFields.tsx` — small inline confirm form.

**Modified:**

- `packages/shared/src/errors.ts` — add `BranchNotFound`.
- `packages/shared/src/schemas/GitState.ts` — add `AttachBranchInput`, `BranchListItem`, `BranchListResponse`.
- `packages/shared/src/api.ts` — add `listBranches` (projects group) and `attachBranch` (tickets group).
- `packages/backend/src/services/GitHub.ts` — add `listBranches` and `branchExists` methods to the service.
- `packages/backend/src/services/Tickets.ts` — add `attachBranch` method.
- `packages/backend/src/handlers/projects.ts` — wire `listBranches`.
- `packages/backend/src/handlers/tickets.ts` — wire `attachBranch`.
- `packages/frontend/src/atoms/github.ts` — add `branchesAtom`, `attachBranchAtom`.
- `packages/frontend/src/components/TicketGit.tsx` — rewrite `TicketGitPanel` on top of `InlineForm`. `TicketGitChip` is unchanged.

---

## Task 1: Shared error — `BranchNotFound`

**Files:**
- Modify: `packages/shared/src/errors.ts`

- [ ] **Step 1: Add the new tagged error**

Append at the end of `packages/shared/src/errors.ts`:

```ts
// 404 — caller asked us to attach an existing branch but it isn't on the
// remote (deleted between list and submit, or typo). The UI should refresh
// the branch list and keep the form open.
export class BranchNotFound extends Schema.TaggedError<BranchNotFound>()(
  "BranchNotFound",
  { name: Schema.String },
  HttpApiSchema.annotations({ status: 404 })
) {}
```

- [ ] **Step 2: Type-check**

Run: `bun typecheck`
Expected: PASS (the export is unused so far; barrel re-exports it via `export * from "./errors"`).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/errors.ts
git commit -m "feat(shared): add BranchNotFound tagged error"
```

---

## Task 2: Shared HTTP API — `listBranches` + `attachBranch`

**Files:**
- Modify: `packages/shared/src/schemas/GitState.ts`
- Modify: `packages/shared/src/api.ts`

- [ ] **Step 1: Add input/output schemas to `GitState.ts`**

Append to the end of `packages/shared/src/schemas/GitState.ts`:

```ts
// Inputs/outputs for the connect-branch flow.
export const AttachBranchInput = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255))
})
export type AttachBranchInput = typeof AttachBranchInput.Type

export const BranchListItem = Schema.Struct({
  name: Schema.String,
  isProtected: Schema.Boolean
})
export type BranchListItem = typeof BranchListItem.Type

export const BranchListResponse = Schema.Struct({
  items: Schema.Array(BranchListItem),
  hasMore: Schema.Boolean
})
export type BranchListResponse = typeof BranchListResponse.Type
```

- [ ] **Step 2: Wire the `listBranches` endpoint into `ProjectsGroup`**

In `packages/shared/src/api.ts`:

a) Update the import block from `./schemas/GitState` to include the new exports:

```ts
import {
  AttachBranchInput,
  BranchListResponse,
  CreateBranchInput,
  GitStatesResponse,
  OpenPrInput,
  OpenPrResult
} from "./schemas/GitState"
```

b) Update the import block from `./errors` to include `BranchNotFound`:

```ts
import {
  BranchExists,
  BranchNotFound,
  BranchProtected,
  Conflict,
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  NotFound,
  RateLimited,
  RepoGone,
  Unauthorized
} from "./errors"
```

c) Add `listBranches` immediately after the existing `gitStates` endpoint inside `ProjectsGroup` (before `.middleware(Authentication)`):

```ts
  // Lists branches on the connected repo. q is a free-text filter passed to
  // GitHub's `refs(query:...)` GraphQL — server-side fuzzy match. first caps
  // the page size; default 30 keeps the combobox snappy.
  .add(
    HttpApiEndpoint.get("listBranches", "/projects/:slug/github/branches")
      .setPath(Schema.Struct({ slug: Slug }))
      .setUrlParams(
        Schema.Struct({
          q: Schema.optional(Schema.String),
          first: Schema.optional(Schema.NumberFromString)
        })
      )
      .addSuccess(BranchListResponse)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(GitHubTokenExpired)
      .addError(GitHubScopeInsufficient)
      .addError(RepoGone)
      .addError(GitHubError)
  )
```

- [ ] **Step 3: Wire the `attachBranch` endpoint into `TicketsGroup`**

In `packages/shared/src/api.ts`, immediately after the `clearBranch` endpoint and before `.middleware(Authentication)` of `TicketsGroup`:

```ts
  // Attach an existing remote branch to a ticket. Verifies the branch exists
  // on remote before persisting, so a successful response means the branch
  // is live. BranchNotFound surfaces when the branch was deleted between
  // listing and submitting (the UI refreshes the list and keeps the form open).
  .add(
    HttpApiEndpoint.post(
      "attachBranch",
      "/projects/:slug/tickets/:id/attach-branch"
    )
      .setPath(Schema.Struct({ slug: Slug, id: TicketId }))
      .setPayload(AttachBranchInput)
      .addSuccess(TicketDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(Conflict)
      .addError(BranchNotFound)
      .addError(GitHubTokenExpired)
      .addError(GitHubScopeInsufficient)
      .addError(RepoGone)
      .addError(GitHubError)
  )
```

- [ ] **Step 4: Type-check**

Run: `bun typecheck`
Expected: shared package passes. Backend will fail with "no handler for `listBranches` / `attachBranch`" (`HttpApiBuilder.group` complains about unhandled endpoints) — that is expected and fixed in Task 5. Backend type errors are OK at this checkpoint as long as they're confined to "missing handler" complaints.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/GitState.ts packages/shared/src/api.ts
git commit -m "feat(shared): add listBranches and attachBranch endpoints"
```

---

## Task 3: GitHub service — `listBranches` + `branchExists`

**Files:**
- Modify: `packages/backend/src/services/GitHub.ts`

- [ ] **Step 1: Update imports**

Update the import block at the top of `packages/backend/src/services/GitHub.ts` to add `BranchListResponse`:

```ts
import {
  BranchExists,
  BranchListResponse,
  BranchProtected,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  GithubRepo,
  GithubRepoPage,
  RateLimited,
  RepoGone
} from "@projectproject/shared"
```

- [ ] **Step 2: Add the two new methods inside the `Effect.gen` body**

Insert before the final `return { ... } as const` block, alongside `fetchProjectStates`:

```ts
    // List branches via GraphQL refs(query:). Server-side fuzzy match means
    // a typing user gets results without us paging through hundreds of refs.
    // Caller passes `first` to cap page size.
    const listBranches = (
      owner: string,
      name: string,
      query: string | undefined,
      first: number,
      userId: string
    ): Effect.Effect<
      BranchListResponse,
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | RateLimited
      | GitHubError
    > =>
      Effect.gen(function* () {
        const token = yield* tokenFor(userId)
        const gql = graphqlFor(token)

        interface QResult {
          repository: {
            refs: {
              nodes: ReadonlyArray<{
                name: string
                branchProtectionRule: { id: string } | null
              }>
              pageInfo: { hasNextPage: boolean }
            }
          } | null
        }

        const data = yield* Effect.tryPromise({
          try: () =>
            gql<QResult>(
              /* GraphQL */ `
                query Q(
                  $owner: String!
                  $name: String!
                  $q: String
                  $first: Int!
                ) {
                  repository(owner: $owner, name: $name) {
                    refs(
                      refPrefix: "refs/heads/"
                      query: $q
                      first: $first
                      orderBy: { field: TAG_COMMIT_DATE, direction: DESC }
                    ) {
                      nodes {
                        name
                        branchProtectionRule {
                          id
                        }
                      }
                      pageInfo {
                        hasNextPage
                      }
                    }
                  }
                }
              `,
              { owner, name, q: query ?? null, first }
            ),
          catch: (
            cause
          ):
            | GitHubTokenExpired
            | GitHubScopeInsufficient
            | RepoGone
            | RateLimited
            | GitHubError => {
            const err = mapHttpError(cause)
            if (
              err._tag === "BranchExists" ||
              err._tag === "BranchProtected"
            ) {
              return new GitHubError({ message: "unexpected GitHub response" })
            }
            return err
          }
        })

        if (!data.repository) return yield* Effect.fail(new RepoGone())

        return {
          items: data.repository.refs.nodes.map((n) => ({
            name: n.name,
            isProtected: n.branchProtectionRule !== null
          })),
          hasMore: data.repository.refs.pageInfo.hasNextPage
        }
      })

    // Single GraphQL ref lookup. Returns true when the branch exists on
    // remote, false when it doesn't. RepoGone bubbles for unknown repos.
    const branchExists = (
      owner: string,
      name: string,
      branch: string,
      userId: string
    ): Effect.Effect<
      boolean,
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | RateLimited
      | GitHubError
    > =>
      Effect.gen(function* () {
        const token = yield* tokenFor(userId)
        const gql = graphqlFor(token)

        interface QResult {
          repository: {
            ref: { name: string } | null
          } | null
        }

        const data = yield* Effect.tryPromise({
          try: () =>
            gql<QResult>(
              /* GraphQL */ `
                query Q($owner: String!, $name: String!, $ref: String!) {
                  repository(owner: $owner, name: $name) {
                    ref(qualifiedName: $ref) {
                      name
                    }
                  }
                }
              `,
              { owner, name, ref: `refs/heads/${branch}` }
            ),
          catch: (
            cause
          ):
            | GitHubTokenExpired
            | GitHubScopeInsufficient
            | RepoGone
            | RateLimited
            | GitHubError => {
            const err = mapHttpError(cause)
            if (
              err._tag === "BranchExists" ||
              err._tag === "BranchProtected"
            ) {
              return new GitHubError({ message: "unexpected GitHub response" })
            }
            return err
          }
        })

        if (!data.repository) return yield* Effect.fail(new RepoGone())
        return data.repository.ref !== null
      })
```

- [ ] **Step 3: Export the new methods**

Update the final `return { ... } as const` to include them:

```ts
    return {
      listUserRepos,
      verifyAccess,
      createBranch,
      openPullRequest,
      fetchProjectStates,
      listBranches,
      branchExists
    } as const
```

- [ ] **Step 4: Type-check**

Run: `bun typecheck`
Expected: GitHub.ts compiles. Backend still fails on the missing handlers from Task 2 — that's fine.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/GitHub.ts
git commit -m "feat(backend): add GitHub.listBranches and GitHub.branchExists"
```

---

## Task 4: Tickets service — `attachBranch`

**Files:**
- Modify: `packages/backend/src/services/Tickets.ts`

- [ ] **Step 1: Update imports**

Add `AttachBranchInput` and `BranchNotFound` to the existing `@projectproject/shared` import block at the top of `packages/backend/src/services/Tickets.ts`. (The exact spelling of nearby items varies — keep the alphabetical order the file already uses.)

```ts
// (within the existing import { ... } from "@projectproject/shared" block)
//   AttachBranchInput,
//   ...
//   BranchNotFound,
```

- [ ] **Step 2: Add the `attachBranch` method**

Insert immediately after `createBranch` (around line 374, before `openPr`):

```ts
    const attachBranch = (
      userId: string,
      slug: string,
      id: string,
      input: AttachBranchInput
    ): Effect.Effect<
      TicketDetail,
      | NotFound
      | Conflict
      | BranchNotFound
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | RateLimited
      | GitHubError
      | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* ensureAccess(userId, slug)
        const project = yield* projects
          .get(userId, slug)
          .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
        if (!project.github) {
          return yield* Effect.fail(
            new Conflict({ reason: "no_github_connection" })
          )
        }
        const ticket = yield* readTicket(slug, id)

        const exists = yield* github.branchExists(
          project.github.repoOwner,
          project.github.repoName,
          input.name,
          userId
        )
        if (!exists) {
          return yield* Effect.fail(new BranchNotFound({ name: input.name }))
        }

        const next = yield* writeGitFields(slug, id, ticket, {
          branch: input.name,
          pr: null,
          lastTransitionedPr: null
        })
        return { ...frontmatterToWire(next), body: ticket.body }
      })
```

- [ ] **Step 3: Export the method**

Update the final `return { ... } as const` of the Tickets service (around line 646) to include `attachBranch`:

```ts
    return {
      list,
      get,
      create,
      update,
      remove,
      createBranch,
      attachBranch,
      openPr,
      clearBranch,
      listGitStates
    } as const
```

- [ ] **Step 4: Type-check**

Run: `bun typecheck`
Expected: Tickets.ts compiles. Handlers still flag the unbuilt endpoints — fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/Tickets.ts
git commit -m "feat(backend): add Tickets.attachBranch service method"
```

---

## Task 5: Wire the new handlers

**Files:**
- Modify: `packages/backend/src/handlers/projects.ts`
- Modify: `packages/backend/src/handlers/tickets.ts`

- [ ] **Step 1: Wire `listBranches` in `projects.ts`**

In `packages/backend/src/handlers/projects.ts`, locate the existing `gitStates` handler entry inside the `handlers` chain. Append a new `.handle("listBranches", ...)` right after it:

```ts
      .handle("listBranches", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          const github = yield* GitHub
          const project = yield* projects
            .get(user.id, path.slug)
            .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
          if (!project.github) {
            // No connected repo → empty result (avoids inventing a Conflict
            // here; the UI shouldn't be able to open this form anyway).
            return { items: [], hasMore: false }
          }
          return yield* github.listBranches(
            project.github.repoOwner,
            project.github.repoName,
            urlParams.q,
            urlParams.first ?? 30,
            user.id
          )
        })
      )
```

- [ ] **Step 2: Wire `attachBranch` in `tickets.ts`**

In `packages/backend/src/handlers/tickets.ts`, append after the existing `clearBranch` handler:

```ts
      .handle("attachBranch", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const tickets = yield* Tickets
          return yield* tickets.attachBranch(
            user.id,
            path.slug,
            path.id,
            payload
          )
        }).pipe(dieOnMarkdown)
      )
```

- [ ] **Step 3: Type-check**

Run: `bun typecheck`
Expected: PASS across the workspace. The typed seam is now whole.

- [ ] **Step 4: Sanity-run the backend**

Run: `bun dev:backend`
Expected: server boots without errors. Hit `Ctrl+C` to stop. (Endpoints aren't tested via curl here — type-safe client coverage from the frontend is the verification path.)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/handlers/projects.ts packages/backend/src/handlers/tickets.ts
git commit -m "feat(backend): wire listBranches and attachBranch handlers"
```

---

## Task 6: Frontend atoms — `branchesAtom`, `attachBranchAtom`

**Files:**
- Modify: `packages/frontend/src/atoms/github.ts`

- [ ] **Step 1: Update imports**

Update the type-only import block at the top:

```ts
import type {
  AttachBranchInput,
  ConnectGithubInput,
  CreateBranchInput,
  OpenPrInput,
  TicketId
} from "@projectproject/shared"
```

- [ ] **Step 2: Add `branchesAtom`**

Append after the existing `githubReposAtom` (around line 48):

```ts
// Branch picker for the connect-branch form. Keyed on slug + query so each
// search produces its own cache cell (mirrors githubReposAtom). Empty query
// is its own key — ranks the recently updated branches.
export const branchesAtom = Atom.family((args: { slug: string; q: string }) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.projects.listBranches({
          path: { slug: args.slug },
          urlParams: { q: args.q.trim() ? args.q.trim() : undefined }
        })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
)
```

- [ ] **Step 3: Add `attachBranchAtom`**

Append after the existing `createBranchAtom` (around line 92):

```ts
export const attachBranchAtom = runtime.fn(
  Effect.fn(function* (
    input: { slug: string; id: TicketId } & AttachBranchInput,
    get
  ) {
    const client = yield* ApiClient
    const { slug, id, ...payload } = input
    const updated = yield* client.tickets.attachBranch({
      path: { slug, id },
      payload
    })
    get.refresh(ticketAtom(ticketKey(slug, id)))
    get.refresh(ticketsListAtom(slug))
    get.refresh(projectGitStatesAtom(slug))
    return updated
  })
)
```

- [ ] **Step 4: Type-check**

Run: `bun typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/atoms/github.ts
git commit -m "feat(frontend): add branchesAtom and attachBranchAtom"
```

---

## Task 7: `InlineForm` primitive

**Files:**
- Create: `packages/frontend/src/components/ui/inline-form.tsx`

- [ ] **Step 1: Create the file**

Write `packages/frontend/src/components/ui/inline-form.tsx`:

```tsx
// InlineForm — compound-component primitive for "display + actions + forms"
// surfaces. The Root holds a small mode/busy context. Idle and Form children
// render conditionally based on `mode`. Triggers wire themselves to open(action).
//
// Forms own their submit semantics (the primitive does NOT provide a Submit
// component) but call into useInlineForm() for setBusy / close. While busy,
// triggers and the convenience Cancel button are disabled — the form's own
// submit button is responsible for its own disabled state.

import { createContext, useCallback, useMemo, useState, use } from "react"
import { X } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface InlineFormContextValue<A extends string = string> {
  mode: "idle" | A
  open: (action: A) => void
  close: () => void
  busy: boolean
  setBusy: (b: boolean) => void
}

// Generic-erased shape lives in the runtime context. Components annotate the
// generic at the call site for type-narrowing; the runtime is permissive.
const InlineFormContext = createContext<InlineFormContextValue | null>(null)

export function useInlineForm<A extends string = string>() {
  const ctx = use(InlineFormContext)
  if (!ctx) {
    throw new Error("useInlineForm must be used inside <InlineForm.Root>")
  }
  return ctx as InlineFormContextValue<A>
}

interface RootProps<A extends string> {
  defaultMode?: "idle" | A
  mode?: "idle" | A
  onModeChange?: (mode: "idle" | A) => void
  className?: string
  children: React.ReactNode
}

function Root<A extends string = string>({
  defaultMode = "idle",
  mode: controlledMode,
  onModeChange,
  className,
  children
}: RootProps<A>) {
  const [uncontrolled, setUncontrolled] = useState<"idle" | A>(defaultMode)
  const [busy, setBusy] = useState(false)
  const isControlled = controlledMode !== undefined
  const mode = isControlled ? controlledMode : uncontrolled

  const setMode = useCallback(
    (next: "idle" | A) => {
      if (!isControlled) setUncontrolled(next)
      onModeChange?.(next)
    },
    [isControlled, onModeChange]
  )

  const open = useCallback((action: A) => setMode(action), [setMode])
  const close = useCallback(() => {
    setBusy(false)
    setMode("idle")
  }, [setMode])

  const value = useMemo<InlineFormContextValue<A>>(
    () => ({ mode, open, close, busy, setBusy }),
    [mode, open, close, busy]
  )

  return (
    <InlineFormContext value={value as InlineFormContextValue}>
      <div
        className={cn(
          "rounded-lg border border-border bg-background px-3 py-2",
          className
        )}
      >
        {children}
      </div>
    </InlineFormContext>
  )
}

function Idle({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  const { mode } = useInlineForm()
  if (mode !== "idle") return null
  return (
    <div className={cn("flex items-center gap-2", className)}>{children}</div>
  )
}

function Display({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn("min-w-0", className)}>{children}</div>
}

function Actions({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("ml-auto flex items-center gap-2", className)}>
      {children}
    </div>
  )
}

interface TriggerProps<A extends string>
  extends Omit<ButtonProps, "onClick"> {
  action: A
}

function Trigger<A extends string>({
  action,
  disabled,
  children,
  ...rest
}: TriggerProps<A>) {
  const { open, busy } = useInlineForm<A>()
  return (
    <Button
      {...rest}
      disabled={disabled || busy}
      onClick={() => open(action)}
    >
      {children}
    </Button>
  )
}

function Form<A extends string>({
  action,
  className,
  children
}: {
  action: A
  className?: string
  children: React.ReactNode
}) {
  const { mode } = useInlineForm<A>()
  if (mode !== action) return null
  return <div className={cn("space-y-2", className)}>{children}</div>
}

function Cancel({
  children = "Cancel",
  ...rest
}: Omit<ButtonProps, "onClick">) {
  const { close, busy } = useInlineForm()
  return (
    <Button
      size="sm"
      variant="ghost"
      leadingIcon={X}
      {...rest}
      disabled={rest.disabled || busy}
      onClick={close}
    >
      {children}
    </Button>
  )
}

export const InlineForm = {
  Root,
  Idle,
  Display,
  Actions,
  Trigger,
  Form,
  Cancel
}
```

- [ ] **Step 2: Type-check**

Run: `bun typecheck`
Expected: PASS. If the project's TypeScript is below 5.0 the `use(...)` call may not compile — confirm by checking `packages/frontend/tsconfig.json` / root TS version (root devDep is `^5.7.3`, so `use` is available).

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/ui/inline-form.tsx
git commit -m "feat(frontend): add InlineForm compound-component primitive"
```

---

## Task 8: Extract `CreateBranchFields` and `OpenPrFields` onto `useInlineForm`

This task **moves** the two existing form bodies (`CreateBranchRow`, `OpenPrRow` from `TicketGit.tsx`) into the new `TicketGit/` subfolder and refits them onto `useInlineForm` — replacing local `busy` state and `onClose` props. Behavior is otherwise unchanged. The legacy components in `TicketGit.tsx` stay temporarily so the file compiles; Task 10 deletes them along with the panel rewrite.

**Files:**
- Create: `packages/frontend/src/components/TicketGit/CreateBranchFields.tsx`
- Create: `packages/frontend/src/components/TicketGit/OpenPrFields.tsx`

- [ ] **Step 1: Write `CreateBranchFields.tsx`**

Create `packages/frontend/src/components/TicketGit/CreateBranchFields.tsx`:

```tsx
// Inline form body for "create branch". Mounted by InlineForm.Form action="create".
// Owns its own submit/error state; uses useInlineForm() for busy/close.

import { useAtomSet } from "@effect-atom/atom-react"
import { CheckCircle2 } from "lucide-react"
import { useState } from "react"
import { createBranchAtom } from "@/atoms/github"
import { Button } from "@/components/ui/button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { Input } from "@/components/ui/input"
import type { GithubConnection, TicketDetail } from "@projectproject/shared"

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
}

function defaultBranchName(
  template: string | null,
  type: string,
  id: string,
  title: string
): string {
  const tpl = template ?? "{type}/{id}-{slug}"
  return tpl
    .replace("{type}", type)
    .replace("{id}", id)
    .replace("{slug}", slugify(title))
}

export function CreateBranchFields({
  slug,
  ticket,
  github,
  branchTemplate
}: {
  slug: string
  ticket: TicketDetail
  github: GithubConnection
  branchTemplate: string | null
}) {
  const { busy, setBusy, close } = useInlineForm()
  const [name, setName] = useState(() =>
    defaultBranchName(branchTemplate, ticket.type, ticket.id, ticket.title)
  )
  const [base, setBase] = useState(github.defaultBaseBranch ?? "")
  const [error, setError] = useState<string | null>(null)
  const create = useAtomSet(createBranchAtom)

  async function submit() {
    if (!name.trim()) return
    setError(null)
    setBusy(true)
    try {
      await create({
        slug,
        id: ticket.id,
        name: name.trim(),
        baseBranch: base.trim() || undefined
      })
      close()
    } catch (e) {
      const tag =
        typeof e === "object" && e && "_tag" in e ? String(e._tag) : ""
      setError(
        tag === "BranchExists"
          ? `Branch "${name.trim()}" already exists.`
          : tag === "BranchProtected"
            ? "Branch name is protected."
            : tag === "GitHubTokenExpired"
              ? "GitHub token expired."
              : tag === "GitHubScopeInsufficient"
                ? "GitHub scope insufficient."
                : tag === "RepoGone"
                  ? "Repo not accessible."
                  : "Couldn't create branch."
      )
      setBusy(false)
    }
  }

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
        <label className="block text-xs">
          <span className="text-muted-foreground">Branch name</span>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-0.5 h-8 font-mono"
            placeholder="feat/T-12-add-button"
            disabled={busy}
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">Base branch</span>
          <Input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="mt-0.5 h-8 font-mono"
            placeholder={github.defaultBaseBranch ?? "main"}
            disabled={busy}
          />
        </label>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <InlineForm.Cancel />
        <Button
          size="sm"
          leadingIcon={CheckCircle2}
          onClick={() => void submit()}
          disabled={busy || !name.trim()}
        >
          {busy ? "Creating…" : "Create branch"}
        </Button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Write `OpenPrFields.tsx`**

Create `packages/frontend/src/components/TicketGit/OpenPrFields.tsx`:

```tsx
// Inline form body for "open PR". Mounted by InlineForm.Form action="open_pr".

import { useAtomSet } from "@effect-atom/atom-react"
import { GitPullRequest } from "lucide-react"
import { useState } from "react"
import { openPrAtom } from "@/atoms/github"
import { Button } from "@/components/ui/button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { Input } from "@/components/ui/input"
import type { TicketDetail } from "@projectproject/shared"

export function OpenPrFields({
  slug,
  ticket,
  branch
}: {
  slug: string
  ticket: TicketDetail
  branch: string
}) {
  const { busy, setBusy, close } = useInlineForm()
  const [title, setTitle] = useState(ticket.title)
  const [draft, setDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = useAtomSet(openPrAtom)

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      await open({
        slug,
        id: ticket.id,
        title: title.trim() || undefined,
        draft
      })
      close()
    } catch (e) {
      const tag =
        typeof e === "object" && e && "_tag" in e ? String(e._tag) : ""
      setError(
        tag === "BranchProtected"
          ? "Target branch is protected."
          : tag === "GitHubTokenExpired"
            ? "GitHub token expired."
            : tag === "GitHubScopeInsufficient"
              ? "GitHub scope insufficient."
              : tag === "RepoGone"
                ? "Repo not accessible."
                : "Couldn't open PR — make sure the branch has commits."
      )
      setBusy(false)
    }
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Open PR from <span className="font-mono text-foreground">{branch}</span>
      </p>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8"
        placeholder="PR title"
        disabled={busy}
      />
      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={draft}
          onChange={(e) => setDraft(e.target.checked)}
          disabled={busy}
        />
        Open as draft
      </label>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <InlineForm.Cancel />
        <Button
          size="sm"
          leadingIcon={GitPullRequest}
          onClick={() => void submit()}
          disabled={busy}
        >
          {busy ? "Opening…" : "Open PR"}
        </Button>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `bun typecheck`
Expected: PASS. Both files compile in isolation; the legacy `CreateBranchRow`/`OpenPrRow` in `TicketGit.tsx` still exist and continue to work as before.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/TicketGit/CreateBranchFields.tsx packages/frontend/src/components/TicketGit/OpenPrFields.tsx
git commit -m "feat(frontend): extract CreateBranchFields and OpenPrFields onto useInlineForm"
```

---

## Task 9: `ConnectBranchFields` (combobox)

**Files:**
- Create: `packages/frontend/src/components/TicketGit/ConnectBranchFields.tsx`

- [ ] **Step 1: Write the combobox**

Create `packages/frontend/src/components/TicketGit/ConnectBranchFields.tsx`:

```tsx
// Inline form body for "connect existing branch". Search input on top,
// scrollable result list below, footer with cancel + connect. Hand-rolled
// (no cmdk in this workspace) but keyboard-navigable.
//
// branchesAtom is keyed on slug + q so each query has its own cache cell;
// we debounce input by 200ms before the q changes (avoids a fetch per
// keystroke).

import { Result, useAtomRefresh, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { GitBranch } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { attachBranchAtom, branchesAtom } from "@/atoms/github"
import { Button } from "@/components/ui/button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { TicketDetail } from "@projectproject/shared"

export function ConnectBranchFields({
  slug,
  ticket
}: {
  slug: string
  ticket: TicketDetail
}) {
  const { busy, setBusy, close } = useInlineForm()
  const [input, setInput] = useState("")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Debounce the input → q transition. 200ms is short enough to feel live,
  // long enough to skip per-keystroke fetches.
  useEffect(() => {
    const t = setTimeout(() => setQ(input), 200)
    return () => clearTimeout(t)
  }, [input])

  const result = useAtomValue(branchesAtom({ slug, q }))
  const refreshBranches = useAtomRefresh(branchesAtom({ slug, q }))
  const attach = useAtomSet(attachBranchAtom)

  const items = Result.isSuccess(result) ? result.value.items : []
  const listRef = useRef<HTMLDivElement>(null)

  // Keep activeIdx in range when the result list shrinks.
  useEffect(() => {
    if (activeIdx >= items.length) setActiveIdx(0)
  }, [items.length, activeIdx])

  async function submit(branchName: string) {
    setError(null)
    setBusy(true)
    try {
      await attach({ slug, id: ticket.id, name: branchName })
      close()
    } catch (e) {
      const tag =
        typeof e === "object" && e && "_tag" in e ? String(e._tag) : ""
      if (tag === "BranchNotFound") {
        setError(`Branch "${branchName}" was just deleted upstream.`)
        setSelected(null)
        refreshBranches()
      } else {
        setError(
          tag === "GitHubTokenExpired"
            ? "GitHub token expired."
            : tag === "GitHubScopeInsufficient"
              ? "GitHub scope insufficient."
              : tag === "RepoGone"
                ? "Repo not accessible."
                : "Couldn't attach branch."
        )
      }
      setBusy(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, Math.max(items.length - 1, 0)))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = items[activeIdx]
      if (item) {
        setSelected(item.name)
        void submit(item.name)
      }
    }
  }

  return (
    <>
      <Input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-8 font-mono"
        placeholder="Search branches…"
        disabled={busy}
      />
      <div
        ref={listRef}
        className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/30"
      >
        {Result.isInitial(result) || Result.isWaiting(result) ? (
          <div className="space-y-1 p-1">
            <div className="h-6 animate-pulse rounded bg-muted/60" />
            <div className="h-6 animate-pulse rounded bg-muted/60" />
            <div className="h-6 animate-pulse rounded bg-muted/60" />
          </div>
        ) : Result.isFailure(result) ? (
          <p className="p-2 text-xs text-destructive">
            Couldn't load branches.
          </p>
        ) : items.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">
            No branches found.
          </p>
        ) : (
          <ul role="listbox" className="py-1">
            {items.map((b, i) => (
              <li key={b.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected === b.name}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => setSelected(b.name)}
                  className={cn(
                    "flex w-full items-center justify-between px-2 py-1 text-left font-mono text-xs",
                    activeIdx === i && "bg-muted",
                    selected === b.name && "bg-emerald-500/10"
                  )}
                  disabled={busy}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <GitBranch className="size-3" strokeWidth={1.75} />
                    {b.name}
                  </span>
                  {b.isProtected && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      protected
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <InlineForm.Cancel />
        <Button
          size="sm"
          leadingIcon={GitBranch}
          onClick={() => selected && void submit(selected)}
          disabled={busy || !selected}
        >
          {busy ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `bun typecheck`
Expected: PASS. If `useAtomRefresh` is named differently in this version of `@effect-atom/atom-react`, `grep` for `useAtomRefresh\|refresh` in existing files (`atoms/github.ts` doesn't use it from a hook, but it should be available). If it isn't, fall back to calling `branchesAtom({slug, q})` again via `useAtomSet` reset semantics — confirm the actual export at impl time.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/TicketGit/ConnectBranchFields.tsx
git commit -m "feat(frontend): add ConnectBranchFields combobox form"
```

---

## Task 10: `ClearBranchFields` + rewrite `TicketGitPanel`

This task replaces the `mode` state, the legacy `CreateBranchRow` / `OpenPrRow` / `ClearBranchButton` definitions in `TicketGit.tsx`, and the dispatch logic in `StateBody` with a fresh `TicketGitPanel` built on `<InlineForm>`. Also extracts the two-step clear-branch confirm into a tiny `ClearBranchFields` form so it follows the same pattern as the others.

**Files:**
- Create: `packages/frontend/src/components/TicketGit/ClearBranchFields.tsx`
- Modify: `packages/frontend/src/components/TicketGit.tsx`

- [ ] **Step 1: Write `ClearBranchFields.tsx`**

Create `packages/frontend/src/components/TicketGit/ClearBranchFields.tsx`:

```tsx
// Inline confirm form for "clear branch". Two buttons; no body.

import { useAtomSet } from "@effect-atom/atom-react"
import { clearBranchAtom } from "@/atoms/github"
import { Button } from "@/components/ui/button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import type { TicketId } from "@projectproject/shared"

export function ClearBranchFields({
  slug,
  id
}: {
  slug: string
  id: TicketId
}) {
  const { busy, setBusy, close } = useInlineForm()
  const clear = useAtomSet(clearBranchAtom)

  async function submit() {
    setBusy(true)
    try {
      await clear({ slug, id })
      close()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      <span className="mr-auto text-muted-foreground">
        Clear branch from this ticket?
      </span>
      <InlineForm.Cancel />
      <Button
        size="sm"
        variant="destructive"
        onClick={() => void submit()}
        disabled={busy}
      >
        {busy ? "Clearing…" : "Clear"}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `TicketGit.tsx`**

Replace the entire contents of `packages/frontend/src/components/TicketGit.tsx` with:

```tsx
// TicketGit — UI surfaces for a ticket's GitHub state.
//
// Two exports:
//   TicketGitChip  — tiny badge for collapsed list rows (unchanged)
//   TicketGitPanel — full inline panel for the expanded ticket view, built
//                    on top of <InlineForm> with three to four actions per
//                    state (create / connect / open_pr / clear).

import { Result, useAtomValue } from "@effect-atom/atom-react"
import {
  AlertTriangle,
  ArrowUpRight,
  Circle,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Plus
} from "lucide-react"
import { projectGitStatesAtom } from "@/atoms/github"
import { ClearBranchFields } from "@/components/TicketGit/ClearBranchFields"
import { ConnectBranchFields } from "@/components/TicketGit/ConnectBranchFields"
import { CreateBranchFields } from "@/components/TicketGit/CreateBranchFields"
import { OpenPrFields } from "@/components/TicketGit/OpenPrFields"
import { InlineForm } from "@/components/ui/inline-form"
import { cn } from "@/lib/utils"
import type {
  GitState,
  GithubConnection,
  TicketDetail,
  TicketId
} from "@projectproject/shared"

// --- Helpers --------------------------------------------------------------

function useGitState(slug: string, ticketId: string): GitState | null {
  const states = useAtomValue(projectGitStatesAtom(slug))
  if (!Result.isSuccess(states)) return null
  return states.value.states[ticketId] ?? null
}

function truncate(name: string, max = 18) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

function checksColor(s: string): string {
  if (s === "passing") return "text-emerald-500"
  if (s === "failing") return "text-red-500"
  if (s === "pending") return "text-amber-500"
  return "text-muted-foreground"
}

// --- TicketGitChip --------------------------------------------------------

export function TicketGitChip({
  slug,
  ticketId
}: {
  slug: string
  ticketId: TicketId
}) {
  const state = useGitState(slug, ticketId)
  if (!state || state.tag === "no_branch") return null

  if (state.tag === "stale_branch") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
        title={`Branch "${state.name}" not on remote`}
      >
        <AlertTriangle className="size-3" strokeWidth={1.75} />
        stale
      </span>
    )
  }

  if (state.tag === "branch_no_pr") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
        title={state.name}
      >
        <GitBranch className="size-3" strokeWidth={1.75} />
        {truncate(state.name)}
      </span>
    )
  }

  if (state.tag === "pr_open") {
    const checkColor = checksColor(state.checks)
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
          state.draft
            ? "bg-muted text-muted-foreground"
            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        )}
        title={state.title}
      >
        <GitPullRequest className="size-3" strokeWidth={1.75} />#{state.number}
        {state.checks !== "none" && (
          <Circle
            className={cn("size-2 fill-current", checkColor)}
            strokeWidth={0}
          />
        )}
        {state.draft && <span>draft</span>}
      </span>
    )
  }

  if (state.tag === "pr_merged") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-400"
        title={state.title}
      >
        <GitMerge className="size-3" strokeWidth={1.75} />#{state.number}
      </span>
    )
  }

  if (state.tag === "pr_closed") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
        title={state.title}
      >
        <GitPullRequestClosed className="size-3" strokeWidth={1.75} />#
        {state.number}
      </span>
    )
  }

  return null
}

// --- TicketGitPanel -------------------------------------------------------

export function TicketGitPanel({
  slug,
  ticket,
  github,
  branchTemplate
}: {
  slug: string
  ticket: TicketDetail
  github: GithubConnection | null
  branchTemplate: string | null
}) {
  const state = useGitState(slug, ticket.id)
  if (!github) return null
  if (state === null) {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div className="h-7 w-44 animate-pulse rounded bg-muted/60" />
      </div>
    )
  }
  return (
    <PanelForState
      slug={slug}
      ticket={ticket}
      state={state}
      github={github}
      branchTemplate={branchTemplate}
    />
  )
}

function PanelForState({
  slug,
  ticket,
  state,
  github,
  branchTemplate
}: {
  slug: string
  ticket: TicketDetail
  state: GitState
  github: GithubConnection
  branchTemplate: string | null
}) {
  const repoSlug = `${github.repoOwner}/${github.repoName}`

  if (state.tag === "no_branch") {
    return (
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
            github={github}
            branchTemplate={branchTemplate}
          />
        </InlineForm.Form>
        <InlineForm.Form action="connect">
          <ConnectBranchFields slug={slug} ticket={ticket} />
        </InlineForm.Form>
      </InlineForm.Root>
    )
  }

  if (state.tag === "branch_no_pr") {
    return (
      <InlineForm.Root<"open_pr" | "clear">>
        <InlineForm.Idle>
          <InlineForm.Display>
            <BranchChip slug={repoSlug} name={state.name} />
          </InlineForm.Display>
          <InlineForm.Actions>
            <InlineForm.Trigger
              action="open_pr"
              size="sm"
              leadingIcon={GitPullRequest}
            >
              Open PR
            </InlineForm.Trigger>
            <InlineForm.Trigger
              action="clear"
              size="sm"
              variant="ghost"
            >
              Clear
            </InlineForm.Trigger>
          </InlineForm.Actions>
        </InlineForm.Idle>
        <InlineForm.Form action="open_pr">
          <OpenPrFields slug={slug} ticket={ticket} branch={state.name} />
        </InlineForm.Form>
        <InlineForm.Form action="clear">
          <ClearBranchFields slug={slug} id={ticket.id} />
        </InlineForm.Form>
      </InlineForm.Root>
    )
  }

  if (state.tag === "pr_open") {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <BranchChip slug={repoSlug} name={state.branch} />
          <PrLink
            number={state.number}
            url={state.url}
            tone={state.draft ? "draft" : "open"}
            checks={state.checks}
          />
          <span className="text-xs text-muted-foreground truncate">
            {state.title}
          </span>
        </div>
      </div>
    )
  }

  if (state.tag === "pr_merged") {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <BranchChip slug={repoSlug} name={state.branch} />
          <PrLink number={state.number} url={state.url} tone="merged" />
          <span className="text-xs text-muted-foreground">
            merged · ticket auto-set to done
          </span>
        </div>
      </div>
    )
  }

  if (state.tag === "pr_closed") {
    return (
      <InlineForm.Root<"open_pr">>
        <InlineForm.Idle>
          <InlineForm.Display>
            <div className="flex items-center gap-2">
              <BranchChip slug={repoSlug} name={state.branch} />
              <PrLink number={state.number} url={state.url} tone="closed" />
            </div>
          </InlineForm.Display>
          <InlineForm.Actions>
            <InlineForm.Trigger
              action="open_pr"
              size="sm"
              variant="tertiary"
              leadingIcon={GitPullRequest}
            >
              Open new PR
            </InlineForm.Trigger>
          </InlineForm.Actions>
        </InlineForm.Idle>
        <InlineForm.Form action="open_pr">
          <OpenPrFields slug={slug} ticket={ticket} branch={state.branch} />
        </InlineForm.Form>
      </InlineForm.Root>
    )
  }

  if (state.tag === "stale_branch") {
    return (
      <InlineForm.Root<"clear">>
        <InlineForm.Idle>
          <InlineForm.Display>
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5" strokeWidth={1.75} />
              Branch <span className="font-mono">{state.name}</span> not on remote.
            </span>
          </InlineForm.Display>
          <InlineForm.Actions>
            <InlineForm.Trigger action="clear" size="sm" variant="ghost">
              Clear
            </InlineForm.Trigger>
          </InlineForm.Actions>
        </InlineForm.Idle>
        <InlineForm.Form action="clear">
          <ClearBranchFields slug={slug} id={ticket.id} />
        </InlineForm.Form>
      </InlineForm.Root>
    )
  }

  return null
}

function BranchChip({ slug, name }: { slug: string; name: string }) {
  return (
    <a
      href={`https://github.com/${slug}/tree/${name}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground"
    >
      <GitBranch className="size-3" strokeWidth={1.75} />
      {name}
      <ArrowUpRight className="size-3" strokeWidth={1.75} />
    </a>
  )
}

function PrLink({
  number,
  url,
  tone,
  checks
}: {
  number: number
  url: string
  tone: "open" | "draft" | "merged" | "closed"
  checks?: string
}) {
  const tint =
    tone === "merged"
      ? "bg-violet-500/10 text-violet-700 dark:text-violet-400"
      : tone === "closed"
        ? "bg-muted text-muted-foreground"
        : tone === "draft"
          ? "bg-muted text-muted-foreground"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
  const Icon =
    tone === "merged"
      ? GitMerge
      : tone === "closed"
        ? GitPullRequestClosed
        : GitPullRequest
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        tint
      )}
    >
      <Icon className="size-3" strokeWidth={1.75} />#{number}
      {checks && checks !== "none" && (
        <Circle
          className={cn("size-2 fill-current", checksColor(checks))}
          strokeWidth={0}
        />
      )}
      {tone === "draft" && <span>draft</span>}
    </a>
  )
}
```

- [ ] **Step 3: Type-check + lint**

Run:
```
bun typecheck
bun lint
```
Expected: PASS. The legacy `CreateBranchRow`, `OpenPrRow`, and `ClearBranchButton` symbols are now gone from `TicketGit.tsx`; their imports (`Input`, `Button`, `useState`, `X`, `useAtomSet`, `clearBranchAtom`, `createBranchAtom`, `openPrAtom`, `CheckCircle2`) drop with them.

- [ ] **Step 4: Manual verification**

Run: `bun dev`
Open the project in a browser and exercise each flow on a project with a connected GitHub repo:

  - **No branch → Create branch:** click "Create branch", confirm fields populate from the template, confirm the submit button shows "Creating…" while busy and triggers/cancel disable, confirm the panel transitions to the `branch_no_pr` row after success.
  - **No branch → Connect branch:** click "Connect branch", type to search (verify debounced fetch — should not fetch on every keystroke), select a branch with mouse and Enter, confirm the panel transitions to `branch_no_pr` after success. Trigger the `BranchNotFound` path by entering a name that doesn't exist (force by deleting a branch on GitHub between steps) and confirm the form stays open with the inline error and the list refreshes.
  - **branch_no_pr → Open PR:** open the PR form, submit, confirm `pr_open` state.
  - **branch_no_pr → Clear:** click "Clear", confirm the inline confirm appears, click "Clear" again, confirm the panel returns to `no_branch`.
  - **stale_branch → Clear:** same as above starting from stale.
  - **pr_closed → Open new PR:** confirm flow.

If any flow misbehaves, fix and stay on this task. Don't claim completion before all six flows work.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/TicketGit/ClearBranchFields.tsx packages/frontend/src/components/TicketGit.tsx
git commit -m "feat(frontend): rewrite TicketGitPanel on InlineForm + connect-branch flow"
```

---

## Self-review checklist

Run this once you finish all tasks:

- [ ] **Spec coverage.** Every section of `docs/superpowers/specs/2026-05-05-inline-form-and-connect-branch-design.md` maps to at least one task: primitive (Task 7), backend `listBranches` (Tasks 2–3, 5), backend `attachBranch` (Tasks 1–2, 4, 5), frontend atoms (Task 6), file reorganization (Tasks 8, 10), `ConnectBranchFields` (Task 9), `TicketGitPanel` rewrite (Task 10), pending UX (built into Tasks 7–10), clear-branch as inline form (Task 10).
- [ ] **`bun typecheck` passes from clean checkout.**
- [ ] **`bun lint` passes.**
- [ ] **All six manual UI flows verified (Task 10 step 4).**
- [ ] **No new runtime deps added.** Confirm `git diff main -- "packages/*/package.json"` shows no additions.
