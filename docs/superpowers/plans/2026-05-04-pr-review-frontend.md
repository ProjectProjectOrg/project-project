# PR Review Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "view PR on GitHub" button on tickets with a navigation to an internal review page that renders the PR's unified diff + a file tree, backed by the existing `GET /projects/:slug/tickets/:id/review` endpoint.

**Architecture:** New TanStack Router file at `_authed/projects/$slug/tickets/$id/review.tsx` (nests inside the project layout). Uses a new `ticketReviewAtom` family in `atoms/reviews.ts` to fetch a `PullRequestReviewBundle`. Page composes `<ReviewHeader>` + a 2-column body of `<FileTree>` (`@pierre/trees`) and `<Diff>` (`@pierre/diffs`). Existing `PrLink` in `TicketGit.tsx` swaps its `<a href="...github.com">` for a TanStack `<Link>` to the new route.

**Tech Stack:** TanStack Router, `@effect-atom/atom-react`, `@pierre/diffs` (new), `@pierre/trees` (new), Tailwind, Effect HttpApi client.

**Spec:** `docs/superpowers/specs/2026-05-04-pr-review-frontend-design.md`

---

## File Map

**Create:**
- `packages/frontend/src/atoms/reviews.ts` — atom family for fetching review bundles, mirrors `atoms/tickets.ts`.
- `packages/frontend/src/routes/_authed/projects/$slug/tickets/$id/review.tsx` — the route component, plus colocated `ReviewHeader`, `FileTree`, `Diff`, `pathsToTree`, error/skeleton renderers.

**Modify:**
- `packages/frontend/package.json` — add `@pierre/diffs` and `@pierre/trees` dependencies.
- `packages/frontend/src/components/TicketGit.tsx` — `PrLink` (lines 361–406) accepts `slug`/`id`, renders `<Link>` instead of `<a>`. Three call sites at lines 283, 300, 312 forward the new props.

**Generated (don't edit by hand):**
- `packages/frontend/src/routeTree.gen.ts` — TanStack Router plugin regenerates this on dev/build.

---

## Verification approach

This codebase has no frontend test runner. Each task verifies via `bun typecheck` (in `packages/frontend`) and, where relevant, a manual browser check against a project that has a ticket with an open GitHub PR. Tasks call out exactly what to look for in the browser.

If the test environment lacks a PR-bearing ticket, set one up manually via the existing UI before Task 6 (the first task that needs real diff content).

---

## Task 1: Add `@pierre/diffs` and `@pierre/trees` dependencies

**Files:**
- Modify: `packages/frontend/package.json`

The user has already approved these libraries in the design spec, so this task installs them.

- [ ] **Step 1: Add the dependencies**

Edit `packages/frontend/package.json`. In the `dependencies` block, alphabetically insert:

```json
"@pierre/diffs": "^1.0.0",
"@pierre/trees": "^1.0.0",
```

(Keep alphabetical order; `@pierre/diffs` lands after `@phosphor-icons/react`, `@pierre/trees` after `@pierre/diffs`.)

The leading-`^` major-zero range pulls the latest published `1.x`. If the published versions when this runs use a different major (e.g. `0.x`), update the range to match — check with `bun pm view @pierre/diffs version` and `bun pm view @pierre/trees version` first.

- [ ] **Step 2: Install**

Run from the repo root:

```bash
bun install
```

Expected: `bun.lockb` updates, both packages appear in `packages/frontend/node_modules/@pierre/`.

- [ ] **Step 3: Sanity-check the imports**

Run from the repo root:

```bash
cd packages/frontend && bun -e "import('@pierre/diffs').then(m => console.log(Object.keys(m).slice(0,8))); import('@pierre/trees/react').then(m => console.log(Object.keys(m).slice(0,8)))"
```

Expected: each `import()` resolves and prints a list of named exports including `MultiFileDiff` (for diffs) and `useFileTree` (for trees). If either errors, the published package layout differs from the spec and we must reconfirm names before continuing.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/package.json bun.lockb
git commit -m "feat(frontend): add @pierre/diffs and @pierre/trees deps"
```

---

## Task 2: Create the review atom family

**Files:**
- Create: `packages/frontend/src/atoms/reviews.ts`

Mirrors `ticketAtom` from `atoms/tickets.ts:25-37` exactly: family keyed by `${slug}/${id}`, splits on the first `/`, calls `client.reviews.getForTicket`, 30-second TTL.

- [ ] **Step 1: Write the file**

Create `packages/frontend/src/atoms/reviews.ts`:

```ts
import { Atom } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import type { TicketId } from "@projectproject/shared"

// One review-bundle atom per (slug, id). Keys are primitive strings
// `${slug}/${id}` to match `ticketAtom` in atoms/tickets.ts. Short TTL
// because PR state moves upstream; matches `projectGitStatesAtom`.
export const ticketReviewAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const slug = key.slice(0, idx)
  const id = key.slice(idx + 1) as TicketId
  return runtime
    .atom(
      Effect.gen(function*() {
        const client = yield* ApiClient
        return yield* client.reviews.getForTicket({ path: { slug, id } })
      })
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
})

export const reviewKey = (slug: string, id: TicketId) => `${slug}/${id}`
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/frontend && bun run typecheck
```

Expected: no new errors. The `client.reviews.getForTicket` call must compile — that's the auto-derived signature from `AppApi`.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/atoms/reviews.ts
git commit -m "feat(frontend): add ticketReviewAtom family"
```

---

## Task 3: Scaffold the review route with raw bundle rendering

**Files:**
- Create: `packages/frontend/src/routes/_authed/projects/$slug/tickets/$id/review.tsx`

Goal: minimal route that loads the atom and dumps the bundle as JSON. Confirms wiring (route registration, params, atom resolution) end-to-end before we layer UI on top.

- [ ] **Step 1: Write the scaffold**

Create the file (TanStack Router will create `routeTree.gen.ts` entries automatically):

```tsx
// PR review page — renders the unified diff + file tree for the PR
// linked to a ticket. Backed by /projects/:slug/tickets/:id/review.

import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { ticketReviewAtom, reviewKey } from "@/atoms/reviews"
import type { TicketId } from "@projectproject/shared"

export const Route = createFileRoute(
  "/_authed/projects/$slug/tickets/$id/review"
)({
  component: ReviewPage,
  loader: () => ({
    crumb: { type: "static" as const, label: "Review" }
  })
})

function ReviewPage() {
  const { slug, id } = Route.useParams()
  const result = useAtomValue(
    ticketReviewAtom(reviewKey(slug, id as TicketId))
  )

  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">
        Review for {slug}/{id}
      </h1>
      <pre className="overflow-auto rounded bg-muted p-3 text-xs">
        {Result.matchWithError(result, {
          onInitial: () => "loading…",
          onError: (e) => `error: ${e._tag}`,
          onDefect: (d) => `defect: ${String(d)}`,
          onSuccess: ({ value }) => JSON.stringify(value, null, 2)
        })}
      </pre>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/frontend && bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Browser check**

Start the dev server:

```bash
cd packages/frontend && bun run dev
```

In the browser, navigate to `/projects/<a-slug>/tickets/<a-ticket-with-PR>/review`. Use a project + ticket that already has a connected PR. Expected: the project layout (header + tabs) shows above; below it, the page dumps the `PullRequestReviewBundle` JSON. If the ticket has no PR, the page shows `error: NotFound` — also a valid pass for this task.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/routes/_authed/projects/\$slug/tickets/\$id/review.tsx packages/frontend/src/routeTree.gen.ts
git commit -m "feat(frontend): scaffold PR review route"
```

(`routeTree.gen.ts` updates automatically when the dev server compiles. If it didn't, run `bun run build` once to regenerate.)

---

## Task 4: Update `PrLink` to navigate internally

**Files:**
- Modify: `packages/frontend/src/components/TicketGit.tsx` (lines 283–315 call sites and 361–406 component definition)

Replace the `<a href={...github.com}>` with a TanStack `<Link>` to the new route. Add `slug` and `id` props to the component. Update the three call sites in `StateBody` to forward them.

- [ ] **Step 1: Update the `PrLink` definition**

In `packages/frontend/src/components/TicketGit.tsx`, replace the `PrLink` function (currently lines 361–406) with:

```tsx
function PrLink({
  slug,
  id,
  number,
  tone,
  checks
}: {
  slug: string
  id: TicketId
  number: number
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
    <Link
      to="/projects/$slug/tickets/$id/review"
      params={{ slug, id }}
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
    </Link>
  )
}
```

Notes:
- `url` prop is removed (the GitHub URL stays in the bundle and gets surfaced as a header link in Task 5).
- `Link` import comes from `@tanstack/react-router` — add it to the existing import block at the top of the file.

- [ ] **Step 2: Add the `Link` import**

In the same file's import section near the top, change:

```tsx
import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
```

to add a router import below it:

```tsx
import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Link } from "@tanstack/react-router"
```

- [ ] **Step 3: Update the three call sites**

In `StateBody` (same file), update lines roughly 283, 300, 312:

```tsx
// pr_open branch
<PrLink
  slug={slug}
  id={ticket.id}
  number={state.number}
  tone={state.draft ? "draft" : "open"}
  checks={state.checks}
/>
```

```tsx
// pr_merged branch
<PrLink
  slug={slug}
  id={ticket.id}
  number={state.number}
  tone="merged"
/>
```

```tsx
// pr_closed branch
<PrLink
  slug={slug}
  id={ticket.id}
  number={state.number}
  tone="closed"
/>
```

`slug` and `ticket` are already in `StateBody`'s scope (params lines 217, 218).

- [ ] **Step 4: Typecheck**

```bash
cd packages/frontend && bun run typecheck
```

Expected: no errors. The `Link` `to`/`params` types are validated against the generated route tree, so a typo in the route path will fail here.

- [ ] **Step 5: Browser check**

Start the dev server (if not already running). Open a project with a ticket that has an open PR; expand the ticket's inline panel. Click the PR badge. Expected: navigates to `/projects/<slug>/tickets/<id>/review`, no full-page reload, the JSON dump from Task 3 appears.

Verify the same for a merged PR and a closed PR if those states exist on any ticket.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/TicketGit.tsx
git commit -m "feat(frontend): swap PrLink to internal review route"
```

---

## Task 5: Build `ReviewHeader`

**Files:**
- Modify: `packages/frontend/src/routes/_authed/projects/$slug/tickets/$id/review.tsx`

Replace the JSON dump with a real header: title, status chip, branches, stats, author, "Open in GitHub", back-to-ticket link.

- [ ] **Step 1: Add the header component**

Replace the existing route file with the version below. (The whole file is given because the previous content was minimal scaffolding.)

```tsx
// PR review page — renders the unified diff + file tree for the PR
// linked to a ticket. Backed by /projects/:slug/tickets/:id/review.

import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  ArrowUpRight,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed
} from "lucide-react"
import { ticketReviewAtom, reviewKey } from "@/atoms/reviews"
import {
  Card,
  CardContent,
  CardHeader
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type {
  PullRequestReviewBundle,
  TicketId
} from "@projectproject/shared"

export const Route = createFileRoute(
  "/_authed/projects/$slug/tickets/$id/review"
)({
  component: ReviewPage,
  loader: () => ({
    crumb: { type: "static" as const, label: "Review" }
  })
})

function ReviewPage() {
  const { slug, id } = Route.useParams()
  const result = useAtomValue(
    ticketReviewAtom(reviewKey(slug, id as TicketId))
  )

  return Result.matchWithError(result, {
    onInitial: () => <ReviewSkeleton />,
    onError: (error) => (
      <ReviewError slug={slug} id={id as TicketId} tag={error._tag} />
    ),
    onDefect: () => (
      <ReviewError slug={slug} id={id as TicketId} tag="GitHubError" />
    ),
    onSuccess: ({ value }) => (
      <Card>
        <CardHeader>
          <ReviewHeader bundle={value} slug={slug} id={id as TicketId} />
        </CardHeader>
        <CardContent>
          <pre className="max-h-[60vh] overflow-auto rounded bg-muted p-3 text-xs">
            {value.patch}
          </pre>
        </CardContent>
      </Card>
    )
  })
}

function ReviewHeader({
  bundle,
  slug,
  id
}: {
  bundle: PullRequestReviewBundle
  slug: string
  id: TicketId
}) {
  const status: "open" | "draft" | "merged" | "closed" =
    bundle.state === "merged"
      ? "merged"
      : bundle.state === "closed"
        ? "closed"
        : bundle.draft
          ? "draft"
          : "open"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Link
          to="/projects/$slug"
          params={{ slug }}
          search={{ ticket: id }}
          className="mt-0.5 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Back to ticket"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
        </Link>
        <h1 className="flex-1 text-lg font-semibold leading-tight">
          {bundle.title}{" "}
          <span className="text-muted-foreground font-normal">
            #{bundle.number}
          </span>
        </h1>
        <PrStatusChip status={status} />
        <a
          href={bundle.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Open in GitHub
          <ArrowUpRight className="size-3" strokeWidth={1.75} />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono">
          {bundle.baseBranch} ← {bundle.headBranch}
        </span>
        <span>·</span>
        <span>
          <span className="text-emerald-600 dark:text-emerald-400">
            +{bundle.additions}
          </span>{" "}
          /{" "}
          <span className="text-red-600 dark:text-red-400">
            −{bundle.deletions}
          </span>
        </span>
        <span>·</span>
        <span>{bundle.changedFiles} files</span>
        {bundle.author && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              {bundle.author.avatarUrl && (
                <img
                  src={bundle.author.avatarUrl}
                  alt=""
                  className="size-4 rounded-full"
                />
              )}
              by @{bundle.author.login}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

function PrStatusChip({
  status
}: {
  status: "open" | "draft" | "merged" | "closed"
}) {
  const tint =
    status === "merged"
      ? "bg-violet-500/10 text-violet-700 dark:text-violet-400"
      : status === "closed"
        ? "bg-muted text-muted-foreground"
        : status === "draft"
          ? "bg-muted text-muted-foreground"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
  const Icon =
    status === "merged"
      ? GitMerge
      : status === "closed"
        ? GitPullRequestClosed
        : GitPullRequest
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        tint
      )}
    >
      <Icon className="size-3" strokeWidth={1.75} />
      {status}
    </span>
  )
}

function ReviewSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-2">
          <div className="h-6 w-2/3 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted/60" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 animate-pulse rounded bg-muted/60" />
      </CardContent>
    </Card>
  )
}

function ReviewError({
  slug,
  id,
  tag
}: {
  slug: string
  id: TicketId
  tag: string
}) {
  // Placeholder rendering — replaced with the full taxonomy in Task 10.
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold">Couldn't load review</h1>
        <p className="text-sm text-muted-foreground">{tag}</p>
      </CardHeader>
      <CardContent>
        <Link
          to="/projects/$slug"
          params={{ slug }}
          search={{ ticket: id }}
          className="text-sm text-primary underline"
        >
          Back to ticket
        </Link>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify the back-link `search` shape**

The back-to-ticket link uses `search={{ ticket: id }}`. Open `packages/frontend/src/routes/_authed/projects/$slug/index.tsx` and confirm that route declares a `validateSearch` (or equivalent) accepting a `ticket` field. If the search shape is named differently (e.g. `expandedTicket`), update both `<Link>` invocations in this file to match. Run `bun run typecheck` — TanStack Router type-checks `search` against the route's declared schema, so a mismatch fails compilation.

- [ ] **Step 3: Typecheck**

```bash
cd packages/frontend && bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Browser check**

Reload the review page. Expected: header card renders with the PR title, #number, status chip, base ← head, +X/−Y, file count, author. Patch text appears as raw `<pre>` underneath. Clicking the back-arrow returns to the project page with the ticket panel re-expanded. Clicking "Open in GitHub" opens the PR on github.com in a new tab.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/routes/_authed/projects/\$slug/tickets/\$id/review.tsx
git commit -m "feat(frontend): render review header card"
```

---

## Task 6: Render the diff with `@pierre/diffs`

**Files:**
- Modify: `packages/frontend/src/routes/_authed/projects/$slug/tickets/$id/review.tsx`

Swap the raw `<pre>` patch dump for per-file `<FileDiff>` blocks. The library's `MultiFileDiff` is *not* what its name suggests — it compares two single-file versions. `PatchDiff` only handles a single-file patch (calls `getSingularPatch` internally). For our multi-file PR patch we use `parsePatchFiles(patch)` to get an array of `FileDiffMetadata`, then render one `<FileDiff>` per entry. This also positions us for per-file anchors in Task 9 with no rework.

- [ ] **Step 1: Add a `Diff` component and use it**

In the route file, add the imports and component:

```tsx
import { useMemo } from "react"
import { parsePatchFiles } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"

// Render one <FileDiff> per parsed file from the unified patch string.
// The patch string can carry multiple files (PR diff) and even multiple
// commits — parsePatchFiles flattens both. Each file's `.name` is the
// path (or new path on rename).
function Diff({ patch }: { patch: string }) {
  const files = useMemo(
    () => parsePatchFiles(patch).flatMap((p) => p.files),
    [patch]
  )
  return (
    <div className="flex flex-col gap-4">
      {files.map((file, i) => (
        <FileDiff key={`${file.name}-${i}`} fileDiff={file} />
      ))}
    </div>
  )
}
```

If the library ships a stylesheet (common pattern: `@pierre/diffs/dist/styles.css`), import it once at the top of the route file:

```tsx
import "@pierre/diffs/styles.css" // adjust path to whatever the package documents
```

- [ ] **Step 2: Replace the `<pre>` block with `<Diff>`**

In the `onSuccess` branch of `Result.matchWithError`, replace:

```tsx
<pre className="max-h-[60vh] overflow-auto rounded bg-muted p-3 text-xs">
  {value.patch}
</pre>
```

with:

```tsx
<Diff patch={value.patch} />
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/frontend && bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Browser check**

Reload the page. Expected: the patch renders as a styled diff (per-file headers, +/− lines, syntax highlighting if the lib ships it by default). Compare visually against `https://github.com/<owner>/<repo>/pull/<n>` for the same PR — line counts and per-file structure should match.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/routes/_authed/projects/\$slug/tickets/\$id/review.tsx
git commit -m "feat(frontend): render PR diff via @pierre/diffs"
```

---

## Task 7: ~~Build the `pathsToTree` utility~~ — SKIPPED

Confirmed against `node_modules/@pierre/trees/dist/model/types.d.ts`: `useFileTree` takes `FileTreeInputOptions` which expects `paths: readonly string[]` — a flat list of path strings, *not* a nested tree object. The library builds the tree internally.

No `pathsToTree` utility is needed. Task 8 passes `bundle.files.map(f => f.path)` directly to `useFileTree`. No code, no commit for this task.

---

## Task 8: Render the file tree with `@pierre/trees`

**Files:**
- Modify: `packages/frontend/src/routes/_authed/projects/$slug/tickets/$id/review.tsx`

Add a `FileTree` component that wraps `useFileTree`. Render it next to the diff in a 2-column layout.

- [ ] **Step 1: Add the `FileTree` component**

In the route file, add (and import the relevant pieces):

```tsx
import { useEffect, useMemo, useRef } from "react"
import {
  FileTree as PierreFileTree,
  useFileTree,
  useFileTreeSelection
} from "@pierre/trees/react"
import type { ReviewFileSummary } from "@projectproject/shared"

// Aliased on import because `FileTree` is the package's component name —
// we keep our wrapper as `FileTree`.
function FileTree({
  files,
  onSelect
}: {
  files: ReadonlyArray<ReviewFileSummary>
  onSelect: (path: string) => void
}) {
  const paths = useMemo(() => files.map((f) => f.path), [files])
  const { model } = useFileTree({ paths })
  // useFileTreeSelection returns the currently-selected paths.
  // Fire the callback whenever the most-recent selection changes.
  const selected = useFileTreeSelection(model)
  const lastFired = useRef<string | null>(null)
  useEffect(() => {
    const last = selected.at(-1)
    if (last && last !== lastFired.current) {
      lastFired.current = last
      onSelect(last)
    }
  }, [selected, onSelect])
  return <PierreFileTree model={model} />
}
```

API confirmed against `node_modules/@pierre/trees/dist/react/`:
- `useFileTree(options)` returns `{ model: FileTree }` — destructure `.model`.
- `useFileTreeSelection(model)` returns `readonly string[]`.
- `<FileTree>` (our `PierreFileTree`) takes a `model` prop.

- [ ] **Step 2: Compose into a 2-column layout**

Replace the `<CardContent>` block in `ReviewPage`'s `onSuccess` branch with:

```tsx
<CardContent>
  <div className="grid gap-4 md:grid-cols-[260px_1fr]">
    <aside className="md:sticky md:top-2 md:self-start">
      <FileTree
        files={value.files}
        onSelect={() => {
          /* scroll wiring lands in Task 9 */
        }}
      />
    </aside>
    <div className="min-w-0">
      <Diff patch={value.patch} />
    </div>
  </div>
</CardContent>
```

The `min-w-0` on the diff column is critical — without it, long unwrapped lines blow out the grid. The `md:sticky` keeps the tree visible while the diff scrolls.

If the tree library ships a stylesheet, import it next to the diff stylesheet at the top of the file.

- [ ] **Step 3: Typecheck**

```bash
cd packages/frontend && bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Browser check**

Reload. Expected: the left column shows a path-first tree of the PR's files; right column shows the diff. Selecting a file in the tree does nothing yet (Task 9 wires it). Resize the window — under `md` breakpoint the tree stacks above the diff.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/routes/_authed/projects/\$slug/tickets/\$id/review.tsx
git commit -m "feat(frontend): render review file tree alongside diff"
```

---

## Task 9: Wire tree selection to scroll the diff

**Files:**
- Modify: `packages/frontend/src/routes/_authed/projects/$slug/tickets/$id/review.tsx`

When a path is selected in the tree, scroll the diff to that file's anchor.

- [ ] **Step 1: Add an `fileAnchorId` helper**

Add at module scope:

```tsx
// Stable DOM id per file path. Used both to mark the diff blocks and to
// look them up from selection callbacks. Replaces `/`, `.`, and other
// CSS-id-unfriendly chars while remaining unambiguous.
function fileAnchorId(path: string): string {
  return `file-${path.replace(/[^a-zA-Z0-9_-]/g, "_")}`
}
```

- [ ] **Step 2: Wrap each file block in an anchor div**

Task 6's `Diff` already iterates per-file. Add a wrapper `<div>` carrying the stable id:

```tsx
function Diff({ patch }: { patch: string }) {
  const files = useMemo(
    () => parsePatchFiles(patch).flatMap((p) => p.files),
    [patch]
  )
  return (
    <div className="flex flex-col gap-4">
      {files.map((file, i) => (
        <div
          key={`${file.name}-${i}`}
          id={fileAnchorId(file.name)}
          className="scroll-mt-20"
        >
          <FileDiff fileDiff={file} />
        </div>
      ))}
    </div>
  )
}
```

The `scroll-mt-20` (5rem) offsets the scroll target so the project layout's sticky header doesn't cover the file heading. Adjust the value if the layout's top chrome height changes.

`FileDiffMetadata.name` carries the file path (or new path on a rename). That's what we anchor on.

- [ ] **Step 3: Wire the selection callback**

In `ReviewPage`'s `onSuccess` JSX, replace the placeholder `onSelect` callback:

```tsx
<FileTree
  files={value.files}
  onSelect={(path) => {
    const el = document.getElementById(fileAnchorId(path))
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
  }}
/>
```

The path string format depends on what `useFileTree` selection returns — typically the joined segments (e.g. `"src/foo.ts"`). If the library returns segments with trailing slashes for files (unlikely) or with a different separator, normalize before calling `fileAnchorId`.

- [ ] **Step 4: Typecheck**

```bash
cd packages/frontend && bun run typecheck
```

- [ ] **Step 5: Browser check**

Reload. Pick a file in the tree. Expected: the diff column scrolls smoothly to that file's block at the top of the viewport. Try files near the top, middle, and bottom of the file list.

If scrolling overshoots (because the project header is sticky/fixed), pass a `scrollMargin` via CSS on the file blocks: `style={{ scrollMarginTop: "4rem" }}` or a `scroll-mt-16` Tailwind class on the wrapping div.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/routes/_authed/projects/\$slug/tickets/\$id/review.tsx
git commit -m "feat(frontend): scroll diff to selected file from review tree"
```

---

## Task 10: Build the full error-state taxonomy

**Files:**
- Modify: `packages/frontend/src/routes/_authed/projects/$slug/tickets/$id/review.tsx`

Replace the placeholder `ReviewError` component with the full per-tag mapping from the spec.

- [ ] **Step 1: Replace `ReviewError`**

```tsx
const ERROR_COPY: Record<
  string,
  { title: string; body: string }
> = {
  NotFound: {
    title: "No PR yet",
    body: "This ticket doesn't have an open pull request to review."
  },
  Conflict: {
    title: "No GitHub repo connected",
    body: "Connect a repository to this project to review pull requests."
  },
  GitHubTokenExpired: {
    title: "GitHub session expired",
    body: "Reconnect your GitHub account to view this review."
  },
  GitHubScopeInsufficient: {
    title: "Insufficient GitHub permissions",
    body: "GitHub didn't grant the access this repo needs."
  },
  RepoGone: {
    title: "Repository missing",
    body: "The connected repo no longer exists or isn't reachable."
  },
  RateLimited: {
    title: "GitHub rate-limited us",
    body: "Try again in a minute — we've hit GitHub's request quota."
  },
  Unauthorized: {
    title: "Couldn't load the review",
    body: "Your session may have expired."
  },
  GitHubError: {
    title: "Couldn't load the review",
    body: "GitHub returned an unexpected error."
  }
}

function ReviewError({
  slug,
  id,
  tag
}: {
  slug: string
  id: TicketId
  tag: string
}) {
  const copy = ERROR_COPY[tag] ?? ERROR_COPY["GitHubError"]
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
      </CardHeader>
      <CardContent>
        <Link
          to="/projects/$slug"
          params={{ slug }}
          search={{ ticket: id }}
          className="text-sm text-primary underline"
        >
          ← Back to ticket
        </Link>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/frontend && bun run typecheck
```

- [ ] **Step 3: Browser check**

Hit at least one error path manually:
- Navigate to a ticket with no PR (`NotFound`).
- (Optional, harder to reproduce locally) navigate to a ticket whose project has no repo connection (`Conflict`).

Expected: the error card renders with the right title, body, and back link.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/routes/_authed/projects/\$slug/tickets/\$id/review.tsx
git commit -m "feat(frontend): full error taxonomy for review page"
```

---

## Task 11: Final cross-flow check

**Files:**
- None — verification only.

End-to-end browser walk-through to make sure no regressions slipped in.

- [ ] **Step 1: Typecheck the whole frontend**

```bash
cd packages/frontend && bun run typecheck
```

Expected: zero errors.

- [ ] **Step 2: Walk the happy path**

In the dev server, with a project that has at least one ticket with an open PR:
1. Navigate to the project, expand the ticket panel.
2. Click the green PR badge in the panel.
3. Land on the review page. Verify: header, status chip, base/head, +/−/files, author all match the GitHub PR.
4. Pick three files in the tree at different depths. Each scrolls the diff to the right block.
5. Click "Open in GitHub" — opens the right URL in a new tab.
6. Click the back-arrow — returns to the project page with the same ticket re-expanded.

- [ ] **Step 3: Walk an error path**

Navigate to a review URL for a ticket with no PR (e.g. `/projects/<slug>/tickets/T-<noPR>/review`). Expected: `NotFound` error card with back link, no console errors.

- [ ] **Step 4: Walk a merged or closed PR (if available)**

If a project has a merged or closed PR ticket, repeat Step 2 against it. Expected: the status chip shows `merged` (purple) or `closed` (muted) and the diff still renders.

- [ ] **Step 5: Verify no PrLink regressions**

On the project page (without entering the review), expand any ticket with an open PR. The PR badge in the inline panel should still look identical to before this work (number, icon, tone, draft label, checks dot) — only the click target has changed.

- [ ] **Step 6: Tag-check the design spec checklist**

Open `docs/superpowers/specs/2026-05-04-pr-review-frontend-design.md` and tick off each goal:
- Open the PR diff inside the app instead of bouncing to GitHub. ✓
- PR context shown (title, status, branches, stats, author). ✓
- File tree on the left, diff on the right; selection scrolls. ✓
- Plugs into existing patterns (atom family, nested route, error renderers). ✓

If anything is missing, file a follow-up task here rather than scope-creeping.

- [ ] **Step 7: No commit needed unless something was tweaked**

If steps 5–6 surfaced small fixes, commit each with a focused message (`fix(frontend): …`).

---

## Out of scope (per spec)

These are explicitly deferred — do not let them creep into this plan:

- Inline review threads / comment rendering.
- Posting reviews, comments, approvals.
- Filtering the diff by selected files.
- File search inside the tree.
- List virtualization, server-side per-file patch endpoints.
- Auto-collapse for huge files (the spec describes the migration path; enable it only if a real PR triggers a perf problem).
- Syntax-highlighting toggles, side-by-side / unified toggle, ignore-whitespace toggle.

If a real-world PR exposes the large-diff perf concern, see the spec section "Performance posture for large diffs" for the migration path: switch `MultiFileDiff` → per-file `FileDiff` with `IntersectionObserver` lazy mounting + 500-line auto-collapse.
