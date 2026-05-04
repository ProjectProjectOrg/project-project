# PR Review Frontend — Design

Internal review page that replaces the "view PR on GitHub" link on tickets. Renders the unified diff with [`@pierre/diffs`](https://diffs.com) and a path-first file tree with [`@pierre/trees`](https://trees.software), driven by the existing `GET /projects/:slug/tickets/:id/review` endpoint.

## Goals

- Open the PR diff inside the app instead of bouncing to GitHub.
- Show enough PR context (title, status, branches, stats, author) to read the diff in isolation.
- File tree on the left, diff on the right; selecting a path scrolls the diff to that file.
- Plug into existing patterns: atom family for fetching, nested route under the project layout, tagged-error renderers.

## Non-goals (v1)

- Inline review threads / comment rendering. Threads are in the bundle but not displayed yet.
- Posting reviews, comments, or approvals.
- Filtering the diff by selected files (selection is scroll-only).
- File search / fuzzy navigation inside the tree.
- List virtualization or server-side per-file patch endpoints.
- Syntax-highlighting toggles, side-by-side vs unified toggle, whitespace-ignore toggle.

## Architecture

### Route

- File: `packages/frontend/src/routes/_authed/projects/$slug/tickets/$id/review.tsx`
- URL: `/projects/<slug>/tickets/<id>/review`
- Nests inside `_authed/projects/$slug/route.tsx`, so the project header + tab strip stay visible above the page. The route doesn't itself appear as a tab; it's reached via `PrLink`.
- `loader` returns a breadcrumb fragment matching the existing pattern (`crumb: { type: "static", label: "Review" }` — exact shape decided at implementation time against `route.tsx`).

### Data fetching

New file: `packages/frontend/src/atoms/reviews.ts`.

```ts
import { Atom } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import type { TicketId } from "@projectproject/shared"

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

- Mirrors `ticketAtom` (`atoms/tickets.ts`) — `Atom.family`, primitive key, split on first `/`.
- 30-second TTL, matching `projectGitStatesAtom` — PR state moves upstream, but we don't need second-by-second freshness for a review session.
- No mutations in v1 (read-only).

### Page composition

Components inside `routes/.../review.tsx` (kept colocated; extract to `components/Review*` only if reused):

- `ReviewPage` — top-level. Reads `ticketReviewAtom`, renders one of: skeleton, error card, or `<ReviewHeader>` + `<ReviewBody>` against the resolved bundle.
- `ReviewHeader` — title, status chip, base/head branches, stats, author, "Open in GitHub" link, back-to-ticket link.
- `ReviewBody` — two-column grid: `<FileTree />` left, `<Diff />` right.
- `FileTree` — wraps `useFileTree` from `@pierre/trees/react`, builds a `paths` object from `bundle.files`, exposes selection.
- `Diff` — wraps `<MultiFileDiff>` from `@pierre/diffs` with the bundle's `patch` string. Each file gets an anchor id derived from its path.

## UI / layout

```
┌────────────────────────────────────────────────────────────┐
│ [Project header + tab strip from the project layout]       │
├────────────────────────────────────────────────────────────┤
│ Review                                                     │
│  ← back to ticket  Title  #N  [open|draft|merged|closed]   │
│  base ← head  ·  +X/−Y  ·  Z files  ·  by @author          │
│                                       Open in GitHub ↗     │
├──────────────────────┬─────────────────────────────────────┤
│ Files                │ Diff                                │
│ @pierre/trees        │ @pierre/diffs MultiFileDiff         │
│  • sticky top        │  one anchor per file (id by path)   │
│  • path-first        │  vertical scroll                    │
│  • single-select     │                                     │
└──────────────────────┴─────────────────────────────────────┘
```

- Wrapped in `Card` to match `about.tsx` / `members.tsx` chrome.
- Header is one `CardHeader`; body is one `CardContent` with a CSS grid (`md:grid-cols-[260px_1fr]`).
- Sidebar uses `position: sticky; top: 0` so the tree stays visible while the diff scrolls.
- Status chip reuses the same tone palette as `PrLink` (open/draft/merged/closed). Extract a small `PrStatusChip` if it duplicates more than trivially with `PrLink`.

## Tree → diff wiring

- `bundle.files` is a flat array of `ReviewFileSummary` objects with `.path`. Build the nested `paths` object expected by `useFileTree`:
  - For `["src/foo.ts", "src/bar/baz.ts"]` produce `{ "src/": { type: "directory", children: { "foo.ts": { type: "file" }, "bar/": { type: "directory", children: { "baz.ts": { type: "file" } } } } } }`.
  - Extract this as `pathsToTree(files)` inside `routes/.../review.tsx`. Pure function, easy to unit-test if we add tests.
- Each `<MultiFileDiff>` file block (or per-file `<FileDiff>` if we go that route — see Performance) gets an id like `id={fileAnchorId(path)}` where `fileAnchorId` slugifies the path consistently with what `useFileTree` exposes as the selection key.
- Selection handler: `useFileTreeSelector(model, s => s.selection.paths)` → effect: `document.getElementById(fileAnchorId(selectedPath))?.scrollIntoView({ behavior: "smooth", block: "start" })`.
- Single-select tree (no shift/cmd-click multi-select). Multi-select adds no value when selection is scroll-only.

## Performance posture for large diffs

The user has flagged this as a "keep in mind, don't optimize prematurely" concern. Plan:

- **v1 default**: single `<MultiFileDiff>` fed the patch string. Simplest. Library-internal lazy/parsing behavior is the first defense.
- **If perf regresses on a real large PR** (e.g. >50 files or >5k diff lines):
  - Switch to per-file rendering: iterate `bundle.files`, slice the parsed patch per-file (use `parsePatchFiles` once at mount), render one `<FileDiff>` per entry.
  - Lazy-mount file blocks with `IntersectionObserver`: until a file scrolls within ~one viewport of the visible area, render only the file header (path, status badge, +/− stats) and a skeleton bar in place of the diff body.
  - Tree-driven scrolls trigger mounts naturally — `scrollIntoView` puts the target file in view, observer fires.
- **Auto-collapse threshold**: any file with `additions + deletions > 500` starts collapsed regardless of viewport. Header shows "+X/−Y · Show diff" toggle.
- Out of scope for now: list virtualization (`react-window`), server-side per-file patch endpoints, syntax-highlighting opt-out, "load more hunks" pagination.

The "switch to per-file lazy" path is purely internal to the `Diff` component — same atom, same `<Link>` target, same file tree. Migration is a render swap.

## Existing `PrLink` update

- File: `packages/frontend/src/components/TicketGit.tsx:361-406`.
- Current: `<a href={url} target="_blank" rel="noreferrer">…</a>` linking to GitHub.
- Replace with TanStack Router `<Link to="/projects/$slug/tickets/$id/review" params={{ slug, id }}>…</Link>`.
- Caller already has `slug` and `ticket.id` in context (the row is rendered inside ticket components with both available). Plumb `slug` and `id` into `PrLink`'s props alongside the existing `number / url / tone / checks`.
- Visual styling (number, icon, tone tint, draft label, checks dot) unchanged.
- The `url` prop becomes the source for the "Open in GitHub" link in `ReviewHeader`, not for the badge itself.
- Both render sites — the ticket list row and the inline ticket detail panel — get the same swap (confirmed scope).

## Loading + error states

- **Loading**: skeleton matching the layout — header bar, tree column placeholders, three diff-block placeholders. Roughly mirrors the project layout's `Skeleton` (animated `bg-muted/60` rectangles).
- **Errors**: tagged-error renderer at the page level. The endpoint can fail with `Unauthorized | NotFound | Conflict | GitHubTokenExpired | GitHubScopeInsufficient | RepoGone | RateLimited | GitHubError`.

| Tag                         | Message                                                       | CTA                          |
| --------------------------- | ------------------------------------------------------------- | ---------------------------- |
| `NotFound`                  | "No PR is open for this ticket yet."                          | Back to ticket               |
| `Conflict`                  | "This project isn't connected to a GitHub repo."              | Back to ticket               |
| `GitHubTokenExpired`        | "Your GitHub session expired. Reconnect to view this review." | Back to ticket               |
| `GitHubScopeInsufficient`   | "GitHub didn't grant the access this repo needs."             | Back to ticket               |
| `RepoGone`                  | "The connected repo no longer exists."                        | Back to ticket               |
| `RateLimited`               | "GitHub rate-limited us. Try again in a minute."              | Back to ticket               |
| `GitHubError` / `Unauthorized` / defect | "Couldn't load the review."                       | Back to ticket               |

- The "Reconnect GitHub" deeper CTA can land in a follow-up — for v1 the back-link is enough.
- "Back to ticket" routes to `/projects/$slug?ticket=$id` (the inline-detail deep link the ticket list already supports).

## Files touched

- **New**: `packages/frontend/src/routes/_authed/projects/$slug/tickets/$id/review.tsx`
- **New**: `packages/frontend/src/atoms/reviews.ts`
- **Modified**: `packages/frontend/src/components/TicketGit.tsx` — `PrLink` props + render swap
- **Possibly modified**: any component that constructs `<PrLink number=... url=... />` and now needs to also pass `slug` and `id` (most likely already in scope at the call site).

## Dependencies

Adding `@pierre/diffs` and `@pierre/trees` to `packages/frontend/package.json`. Both are new dependencies — flag at install time, since the project rule is "ask before adding packages."

## Open questions

- Do `@pierre/diffs` / `@pierre/trees` ship a Tailwind-friendly stylesheet, or do we need to import a CSS file at the route level? Resolves at install.
- `useFileTree` selection model exposes paths as strings — we need to confirm the exact format (e.g. `"src/foo.ts"` vs `"/src/foo.ts"` vs `"src/" + "foo.ts"`) so `fileAnchorId` lines up. Resolves at first render.
- Is the breadcrumb `crumb` shape from `loader` a tuple per the project route's pattern, or just a single object like `about.tsx`? Pattern-match at implementation time.
