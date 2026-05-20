# In-app PR review — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a ProjectProject-native review cockpit for ticket-linked GitHub PRs: overview, changed-files review workspace, pending review submission, existing thread replies/resolution, and merge/close/reopen actions, while GitHub remains the source of truth for PR data and review state.

**Architecture:** Add a shared `reviews` HttpApi group and Review DTO schemas. Backend owns ProjectProject auth, project/ticket resolution, capability calculation, and GitHub API adaptation through a new `Reviews` service plus new raw review methods on `GitHub`. Frontend owns a project child route at `/orgs/:orgSlug/projects/:slug/reviews/:prNumber`, review atoms keyed by `{ orgSlug, slug, prNumber }`, and a desktop-first review workspace using Pierre diff/tree primitives after their APIs are validated.

**Tech Stack:** Effect v3, HttpApi, Octokit REST + `@octokit/graphql`, TanStack Router, `@effect-atom/atom-react`, paraglide, `@pierre/diffs`, `@pierre/trees`.

**Spec:** `docs/superpowers/specs/2026-05-20-in-app-pr-review-design.md`

**Branch:** TBD. Create a feature branch before Task 0. The spec is currently untracked; commit it with this plan or in a dedicated docs commit before code work starts.

**Architecture checkpoints before coding:**

- Confirm adding frontend dependencies `@pierre/diffs` and `@pierre/trees`.
- Confirm adding one backend domain service `Reviews` and one shared schema file `schemas/Review.ts`.
- Confirm adding `Tickets.findByPrNumber(...)` as an internal service method for linked-ticket resolution.
- Confirm v1 `@` mention candidates come from PR page/comment data only. Repo-wide collaborator search would need another backend endpoint and is not in this plan.

---

## File map

**New:**

- `packages/shared/src/schemas/Review.ts`
- `packages/backend/src/Services/Reviews.ts`
- `packages/backend/src/Layers/Reviews.ts`
- `packages/backend/src/Layers/GitHub/reviews.ts`
- `packages/backend/src/handlers/reviews.ts`
- `packages/frontend/src/atoms/reviews.ts`
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/reviews/$prNumber.tsx`
- `packages/frontend/src/components/Reviews/ReviewPage.tsx`
- `packages/frontend/src/components/Reviews/ReviewOverview.tsx`
- `packages/frontend/src/components/Reviews/ReviewFilesWorkspace.tsx`
- `packages/frontend/src/components/Reviews/ReviewFileTree.tsx`
- `packages/frontend/src/components/Reviews/ReviewDiffPane.tsx`
- `packages/frontend/src/components/Reviews/ReviewFileDiffBlock.tsx`
- `packages/frontend/src/components/Reviews/ReviewCommentEditor.tsx`
- `packages/frontend/src/components/Reviews/ReviewSubmitPopover.tsx`
- `packages/frontend/src/components/Reviews/ReviewActions.tsx`
- `packages/frontend/messages/en/reviews.json`

**Modified:**

- `packages/shared/src/api.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/errors.ts`
- `packages/backend/src/Services/GitHub.ts`
- `packages/backend/src/Services/Tickets.ts`
- `packages/backend/src/Layers/GitHub/index.ts`
- `packages/backend/src/Layers/Tickets.ts`
- `packages/backend/src/main.ts`
- `packages/frontend/package.json`
- `package.json` / `bun.lock`
- `packages/frontend/messages/en/git.json`
- `packages/frontend/messages/en/common.json` if new shared error labels are needed
- `packages/frontend/src/components/TicketGit.tsx`
- `packages/frontend/src/components/TicketList/FilteredList.tsx`
- `packages/frontend/src/lib/errorMessage.ts`
- `CLAUDE.md`
- `packages/frontend/project.inlang/settings.json`

---

## Task 0: Branch hygiene and dependency/API validation

**Files:** docs and dependency metadata only.

- [x] **Step 1: Confirm branch and docs state**

Run:

```bash
git status --short
git branch --show-current
```

Expected: working tree only has the spec/plan docs, or unrelated user changes are understood and left alone.

- [x] **Step 2: Create or confirm the feature branch**

Use the branch name Wouter chooses. If no branch exists yet, create one from the intended base:

```bash
git switch -c feat/in-app-pr-review
```

- [x] **Step 3: Read the source-of-truth docs**

Read:

```bash
sed -n '1,260p' CLAUDE.md
sed -n '1,220p' docs/PROJECTPROJECT.md
sed -n '1,220p' .impeccable.md
sed -n '1,520p' docs/superpowers/specs/2026-05-20-in-app-pr-review-design.md
```

- [x] **Step 4: Fetch Pierre source if it is not already in `opensrc`**

Run only if the packages are not already present:

```bash
npx opensrc @pierre/diffs
npx opensrc @pierre/trees
```

Validate the React exports and exact types needed for line/range selection, annotations, unified/split rendering, and file tree rendering before writing review UI components.

Note: `npx opensrc fetch @pierre/diffs @pierre/trees` failed because both packages publish no repository URL. Installed package types were used for API validation instead.

- [x] **Step 5: Re-read the DiffKit references**

Read the local source files:

```bash
sed -n '1,260p' opensrc/repos/github.com/stylessh/diffkit/apps/dashboard/src/components/pulls/review/review-page.tsx
sed -n '1,260p' opensrc/repos/github.com/stylessh/diffkit/apps/dashboard/src/components/pulls/review/review-diff-pane.tsx
sed -n '1,320p' opensrc/repos/github.com/stylessh/diffkit/apps/dashboard/src/components/pulls/review/review-file-diff-block.tsx
sed -n '1,260p' opensrc/repos/github.com/stylessh/diffkit/apps/dashboard/src/components/pulls/review/review-file-tree.tsx
```

Extract patterns, not styling: progressive file loading, near-viewport diff rendering, active-file store, pending comment annotations, and split/unified wiring.

- [x] **Step 6: Install frontend review renderer packages after Wouter confirms**

```bash
bun add --filter @projectproject/frontend @pierre/diffs@1.1.22 @pierre/trees@1.0.0-beta.4
```

If npm has newer versions, do not upgrade silently. Ask before changing versions from the spec.

- [ ] **Step 7: Commit docs and dependency setup**

```bash
git add docs/superpowers/specs/2026-05-20-in-app-pr-review-design.md docs/superpowers/plans/2026-05-20-in-app-pr-review.md package.json packages/frontend/package.json bun.lock opensrc/sources.json opensrc
git commit -m "docs: plan in-app PR review"
```

If Task 0 did not fetch or install anything, only add the docs.

---

## Task 1: Shared review schemas

**Files:**

- Create: `packages/shared/src/schemas/Review.ts`
- Modify: `packages/shared/src/index.ts`

- [x] **Step 1: Define PR overview schemas**

Add ProjectProject-shaped DTOs, not raw GitHub payloads:

- `ReviewActor`
- `ReviewBranchRef`
- `ReviewPrState`
- `ReviewPrCounts`
- `ReviewCheckRollup`
- `ReviewPr`
- `ReviewLinkedTicket`
- `ReviewParticipant`
- `ReviewReviewer`
- `ReviewMergeMethod`
- `ReviewCapabilities`
- `ReviewPage`

Use explicit literal unions for GitHub-derived state values that the UI switches over.

- [x] **Step 2: Define file and patch schemas**

Add:

- `ReviewFileStatus`
- `ReviewFileSummary`
- `ReviewFileSummaryPage`
- `ReviewFilePatch`
- `ReviewFilePatchPage`

Pages should include `items`/`files`, `nextCursor`, `totalCount`, and enough loaded counts for the files view to say `loaded N of M files`.

- [x] **Step 3: Define review thread schemas**

Add:

- `ReviewCommentSide`
- `ReviewCommentPosition`
- `ReviewComment`
- `ReviewCommentThread`
- `ReviewCommentsResponse`

Represent unresolved/resolved/outdated as data from GitHub. Do not invent local thread state.

- [x] **Step 4: Define mutation input/output schemas**

Add:

- `PendingReviewCommentInput`
- `SubmitReviewInput`
- `SubmitReviewResult`
- `ReplyReviewCommentInput`
- `ReviewThreadMutationResult`
- `MergeReviewInput`
- `MergeReviewResult`
- `ReviewPrMutationResult`

Use `comment | approve | request_changes` for review events and `merge | squash | rebase` for merge methods.

- [x] **Step 5: Export the schemas**

Export `./schemas/Review` from `packages/shared/src/index.ts`.

- [x] **Step 6: Typecheck shared**

```bash
bun --filter @projectproject/shared run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/Review.ts packages/shared/src/index.ts
git commit -m "feat(review): add shared review schemas"
```

---

## Task 2: Shared HttpApi group

**Files:**

- Modify: `packages/shared/src/api.ts`
- Modify: `packages/shared/src/errors.ts` only if an existing error cannot express a needed failure

- [ ] **Step 1: Import review schemas**

Import the DTOs and inputs from `./schemas/Review`.

- [ ] **Step 2: Add review path/url schemas**

Add:

```ts
const ReviewPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  prNumber: Schema.NumberFromString
})
```

Add thread/comment paths and cursor params as needed.

- [ ] **Step 3: Add the `reviews` HttpApi group**

Add endpoints from the spec:

- `get`
- `fileSummaries`
- `files`
- `comments`
- `submit`
- `reply`
- `resolveThread`
- `unresolveThread`
- `merge`
- `close`
- `reopen`

All endpoints are nested under `/orgs/:orgSlug/projects/:slug/reviews/:prNumber` and use `Authentication`.

Audit note: this group was initially added, then removed before moving on because a wired placeholder backend would expose callable review endpoints that returned fake `GitHubError` 502s. Re-add the HttpApi group with the first real backend endpoint slice.

- [ ] **Step 4: Model errors conservatively**

Use existing errors where possible:

- `Unauthorized`
- `NotFound`
- `Forbidden`
- `Conflict`
- `GitHubTokenExpired`
- `GitHubScopeInsufficient`
- `RepoGone`
- `RateLimited`
- `GitHubError`
- `Validation`

Only add new tagged errors if the frontend needs a distinct recoverable UI path that capabilities cannot represent.

- [ ] **Step 5: Typecheck shared**

```bash
bun --filter @projectproject/shared run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/api.ts packages/shared/src/errors.ts
git commit -m "feat(review): add review api group"
```

---

## Task 3: Ticket linked-PR lookup

**Files:**

- Modify: `packages/backend/src/Services/Tickets.ts`
- Modify: `packages/backend/src/Layers/Tickets.ts`
- Add/modify backend ticket tests near existing ticket layer tests

- [x] **Step 1: Add `findByPrNumber` to `TicketsShape`**

Signature:

```ts
findByPrNumber(
  orgSlug: string,
  userId: string,
  slug: string,
  prNumber: number
): Effect.Effect<TicketDetail, NotFound | MarkdownError | MalformedTicketDocument>
```

- [x] **Step 2: Implement by scanning ticket docs**

Reuse existing access checks and `documentToDetail`. Return the first ticket where `ticket.pr === prNumber`. If no ticket matches, return `NotFound`.

- [x] **Step 3: Add focused tests**

Cover:

- member can find a ticket with matching stored PR number
- non-member gets `NotFound`
- no matching PR returns `NotFound`

- [x] **Step 4: Run backend tests for tickets**

```bash
bun --filter @projectproject/backend test -- src/Layers/Tickets.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/Services/Tickets.ts packages/backend/src/Layers/Tickets.ts packages/backend/src/Layers/Tickets.test.ts
git commit -m "feat(review): resolve tickets by linked PR number"
```

---

## Task 4: Raw GitHub review methods

**Files:**

- Modify: `packages/backend/src/Services/GitHub.ts`
- Create: `packages/backend/src/Layers/GitHub/reviews.ts`
- Modify: `packages/backend/src/Layers/GitHub/index.ts`
- Add tests under `packages/backend/src/Layers/GitHub/`

- [ ] **Step 1: Add raw GitHub review types**

Keep these backend-local. They should represent enough GitHub data to build shared DTOs without leaking Octokit response types through service boundaries.

- [ ] **Step 2: Add installation-read methods to `GitHubShape`**

Add methods for:

- PR detail and capability inputs
- changed file summaries
- patch pages
- review comments
- review threads/statuses

Reads take installation id, owner, repo name, and PR number.

- [ ] **Step 3: Add user-write methods to `GitHubShape`**

Add methods for:

- submit review with pending comments
- reply to review comment
- resolve/unresolve thread
- merge PR
- close PR
- reopen PR

Writes take `userId`; the live layer gets the personal GitHub token using the existing Better Auth path.

- [ ] **Step 4: Implement REST helpers first**

Use REST for:

- PR detail if sufficient
- file pages
- submit review if REST maps cleanly
- merge
- close/reopen
- review comment replies if supported cleanly

- [ ] **Step 5: Implement GraphQL helpers where needed**

Use `@octokit/graphql` for:

- review thread IDs/statuses
- resolve/unresolve thread mutations
- richer mergeability/review decision if REST is insufficient

- [ ] **Step 6: Map GitHub failures to existing tagged errors**

Use existing `githubRequest`, `mapHttpError`, and `narrow` patterns. Preserve rate limit, repo gone, token expired/scope insufficient, and generic GitHub errors.

- [ ] **Step 7: Test request mapping**

Add tests that mock Octokit/request boundaries where existing GitHub layer tests do this already. Cover REST payload shapes for submit/merge/close/reopen and GraphQL variable shapes for thread resolution.

- [ ] **Step 8: Run GitHub layer tests**

```bash
bun --filter @projectproject/backend test -- src/Layers/GitHub
```

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/Services/GitHub.ts packages/backend/src/Layers/GitHub packages/backend/src/Layers/GitHub.test.ts
git commit -m "feat(review): add GitHub review operations"
```

---

## Task 5: Backend `Reviews` service and handler

**Files:**

- Create: `packages/backend/src/Services/Reviews.ts`
- Create: `packages/backend/src/Layers/Reviews.ts`
- Create: `packages/backend/src/handlers/reviews.ts`
- Modify: `packages/backend/src/main.ts`
- Add tests for `Reviews`

- [ ] **Step 1: Define `ReviewsShape`**

Methods should mirror the HttpApi endpoint names:

- `get`
- `fileSummaries`
- `files`
- `comments`
- `submit`
- `reply`
- `resolveThread`
- `unresolveThread`
- `merge`
- `close`
- `reopen`

- [ ] **Step 2: Implement linked-ticket resolution**

Flow:

1. Resolve org/project membership.
2. Load project GitHub integration.
3. Call `tickets.findByPrNumber(...)`.
4. If not found, call `tickets.listGitStates(...)` once to refresh stored PR numbers.
5. Retry `tickets.findByPrNumber(...)`.
6. If still not found, return `NotFound`.

Do this before returning any GitHub PR data.

- [ ] **Step 3: Implement read methods**

Build shared DTOs from raw GitHub data:

- `get` returns PR overview, linked ticket, reviewers, participants, capabilities, and merge methods
- `fileSummaries` returns changed-file summary pages
- `files` returns patch pages
- `comments` returns review threads and any unmapped outdated threads

- [ ] **Step 4: Implement capability calculation**

Capabilities are backend-owned. Include disabled reasons exactly from the shared schema. Do not let the frontend infer from PR state alone.

- [ ] **Step 5: Implement write methods**

Every write must:

1. Resolve linked ticket and project access.
2. Require personal GitHub write capability.
3. Call the GitHub raw method.
4. Return a small mutation result.
5. Refresh project git states where relevant after merge/close/reopen.

Do not mutate the ticket status directly on merge; rely on the existing merged-PR observation rule.

- [ ] **Step 6: Add the handler group**

Add `ReviewsHandlerLive` with thin `HttpApiBuilder.group(AppApi, "reviews", ...)` handlers, following the existing project/ticket handler style.

- [ ] **Step 7: Wire the handler and layer**

Provide `ReviewsHandlerLive` and `ReviewsLive` in `packages/backend/src/main.ts` / runtime wiring according to the existing layer structure.

- [ ] **Step 8: Add backend tests**

Cover:

- linked-ticket resolution succeeds
- linked-ticket resolution refreshes git state once before failing
- non-member cannot read review data
- project member can read linked PR data through installation access
- write actions require personal GitHub
- capability reasons match PR state/token state
- submit review maps line/range comments to GitHub shape
- merge refreshes git state and does not directly update ticket status
- close/reopen call the correct GitHub mutation

- [ ] **Step 9: Run backend typecheck/tests**

```bash
bun --filter @projectproject/backend run typecheck
bun --filter @projectproject/backend test
```

- [ ] **Step 10: Commit**

```bash
git add packages/backend/src/Services/Reviews.ts packages/backend/src/Layers/Reviews.ts packages/backend/src/handlers/reviews.ts packages/backend/src/main.ts packages/backend/src/**/*.test.ts
git commit -m "feat(review): serve linked PR review data"
```

---

## Task 6: Frontend i18n domain and error messages

**Files:**

- Create: `packages/frontend/messages/en/reviews.json`
- Modify: `CLAUDE.md`
- Modify: `packages/frontend/project.inlang/settings.json`
- Modify: `packages/frontend/src/lib/errorMessage.ts`
- Regenerate: `packages/frontend/src/paraglide/messages/*`

- [ ] **Step 1: Add `reviews.json`**

Add all review route, overview, files view, actions, empty, loading, error, and disabled-state strings under the `reviews_` prefix. Keep keys sorted alphabetically within the prefix.

- [ ] **Step 2: Update i18n ownership docs**

Add:

```md
| `packages/frontend/messages/en/reviews.json` | `reviews_` |
```

to the table in `CLAUDE.md`.

- [ ] **Step 3: Update Inlang path pattern**

Include the new `reviews.json` domain so paraglide compiles it.

- [ ] **Step 4: Extend `errorMessage.ts`**

Map any new review-surfaced tagged errors. Prefer existing `error_` messages for generic GitHub/rate-limit failures.

- [ ] **Step 5: Compile paraglide and typecheck frontend**

```bash
bun --filter @projectproject/frontend run paraglide:compile
bun --filter @projectproject/frontend run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md packages/frontend/messages/en/reviews.json packages/frontend/project.inlang/settings.json packages/frontend/src/lib/errorMessage.ts packages/frontend/src/paraglide
git commit -m "feat(review): add review translations"
```

---

## Task 7: Frontend review atoms

**Files:**

- Create: `packages/frontend/src/atoms/reviews.ts`

- [ ] **Step 1: Add `reviewKey` helpers**

Use a stable key containing org slug, project slug, and PR number. Parse it with explicit helper functions; do not duplicate parsing in atom bodies.

- [ ] **Step 2: Add read atoms**

Add base + optimistic wrapper where mutations affect the result:

- `reviewBaseAtom` / `reviewAtom`
- `reviewFileSummariesBaseAtom` / `reviewFileSummariesAtom`
- `reviewFilesBaseAtom` / `reviewFilesAtom`
- `reviewCommentsBaseAtom` / `reviewCommentsAtom`

Use separate reads for overview, file summaries, patch pages, and comments.

- [ ] **Step 3: Add mutation atoms**

Add:

- `submitReviewAtom`
- `replyReviewCommentAtom`
- `resolveReviewThreadAtom`
- `unresolveReviewThreadAtom`
- `mergeReviewAtom`
- `closeReviewAtom`
- `reopenReviewAtom`

Use pulse-only optimistic reducers unless the returned state is trivial and reliable.

- [ ] **Step 4: Refresh base atoms after mutations**

Refresh:

- submit/reply/resolve/unresolve: comments and overview
- merge/close/reopen: overview, comments if needed, project git states, and linked ticket atoms

Always refresh base atoms, not optimistic wrappers.

- [ ] **Step 5: Typecheck frontend**

```bash
bun --filter @projectproject/frontend run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/atoms/reviews.ts
git commit -m "feat(review): add review atoms"
```

---

## Task 8: Review route shell and overview view

**Files:**

- Create: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/reviews/$prNumber.tsx`
- Create: `packages/frontend/src/components/Reviews/ReviewPage.tsx`
- Create: `packages/frontend/src/components/Reviews/ReviewOverview.tsx`

- [ ] **Step 1: Add route search validation**

Validate `view` as `overview | files`; default to `overview`.

- [ ] **Step 2: Mount review overview atom in the loader**

Decode `prNumber` as a positive number and mount `reviewBaseAtom(reviewKey(...))`.

- [ ] **Step 3: Add route-level result handling**

Use existing `ErrorPage` / `NotFoundPage` patterns. `NotFound` means the PR is not linked to a ticket in the current project or the project is unavailable to the user.

- [ ] **Step 4: Build `ReviewPage` shell**

Render:

- breadcrumb-compatible route metadata
- persistent missing-personal-GitHub banner when capabilities require it
- explicit refresh action
- overview/files view switch

- [ ] **Step 5: Build overview**

Render:

- PR title/body/state/author/base/head
- commits/files/additions/deletions strip
- `Review changes` action that navigates to `view=files`
- linked ticket card
- reviewers/participants/details right rail

Use restrained chrome from `.impeccable.md`; no decorative card-heavy layout.

- [ ] **Step 6: Typecheck**

```bash
bun --filter @projectproject/frontend run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/routes/_authed/orgs/'$orgSlug'/projects/'$slug'/reviews/'$prNumber'.tsx packages/frontend/src/components/Reviews/ReviewPage.tsx packages/frontend/src/components/Reviews/ReviewOverview.tsx
git commit -m "feat(review): add review route overview"
```

Use shell quoting correctly when adding files whose path contains `$`.

---

## Task 9: Review entry points from ticket UI

**Files:**

- Modify: `packages/frontend/src/components/TicketGit.tsx`
- Modify: `packages/frontend/src/components/TicketList/FilteredList.tsx`
- Modify: `packages/frontend/messages/en/git.json` or `reviews.json`

- [ ] **Step 1: Add ticket detail entry point**

For `pr_open`, `pr_merged`, and `pr_closed` states in `TicketGitPanel`, add an internal `Review PR` action to `/orgs/$orgSlug/projects/$slug/reviews/$prNumber`. Keep the existing GitHub external link available.

- [ ] **Step 2: Add ticket list entry point**

For PR chips in ticket list rows, add a menu or secondary action to open the review route. Do not make row clicks ambiguous.

- [ ] **Step 3: Preserve external GitHub affordances**

Existing `PrLink` can still open GitHub. The new action is the ProjectProject review entry, not a replacement for the external link unless Wouter explicitly chooses that.

- [ ] **Step 4: Typecheck**

```bash
bun --filter @projectproject/frontend run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/TicketGit.tsx packages/frontend/src/components/TicketList/FilteredList.tsx packages/frontend/messages/en packages/frontend/src/paraglide
git commit -m "feat(review): link tickets to PR review"
```

---

## Task 10: Files view data loading and layout

**Files:**

- Create: `packages/frontend/src/components/Reviews/ReviewFilesWorkspace.tsx`
- Create: `packages/frontend/src/components/Reviews/ReviewFileTree.tsx`
- Modify: `packages/frontend/src/components/Reviews/ReviewPage.tsx`
- Modify: review route loader if needed

- [ ] **Step 1: Mount files atoms when `view=files`**

Load overview first. Then mount file summaries, patch pages, and comments for files view.

- [ ] **Step 2: Build compact files top bar**

Render:

- PR number/title
- changed-file count and additions/deletions
- unified/split toggle
- submit review action
- primary PR action
- overflow actions
- linked ticket chip/popover

- [ ] **Step 3: Build changed-file tree**

Use `@pierre/trees` if the validated API fits. If not, use a local virtualized tree patterned after DiffKit and record the reason in the plan before continuing.

- [ ] **Step 4: Add active file tracking**

Use a stable external store or equivalent pattern so active file changes do not rerender the whole tree.

- [ ] **Step 5: Add progressive loading**

Render file summaries as soon as available. Fetch patch pages in small pages, prefetch a few pages ahead, and show `loaded N of M files`.

- [ ] **Step 6: Add mobile layout fallback**

Mobile uses unified diff only and opens the file tree in a drawer. Hide or disable split toggle on narrow viewports.

- [ ] **Step 7: Typecheck**

```bash
bun --filter @projectproject/frontend run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/components/Reviews packages/frontend/src/routes/_authed/orgs/'$orgSlug'/projects/'$slug'/reviews/'$prNumber'.tsx
git commit -m "feat(review): add files workspace shell"
```

---

## Task 11: Diff rendering

**Files:**

- Create: `packages/frontend/src/components/Reviews/ReviewDiffPane.tsx`
- Create: `packages/frontend/src/components/Reviews/ReviewFileDiffBlock.tsx`
- Modify: `packages/frontend/src/components/Reviews/ReviewFilesWorkspace.tsx`

- [ ] **Step 1: Initialize Pierre diff rendering**

Use `@pierre/diffs` / `@pierre/diffs/react` according to the API validated in Task 0. Register themes or CSS variables that match ProjectProject light/dark tokens.

- [ ] **Step 2: Build `ReviewDiffPane`**

Support:

- split/unified diff style
- progressive visible file count
- scroll-to-file from tree
- active file updates while scrolling
- load-more sentinel

- [ ] **Step 3: Build `ReviewFileDiffBlock`**

Support:

- sticky file headers
- collapse/expand
- binary or too-large neutral state
- open-on-GitHub affordance
- near-viewport rendering for heavy patches

- [ ] **Step 4: Wire line/range selection**

Expose selected range data in the shape needed for GitHub pending review comments.

- [ ] **Step 5: Typecheck**

```bash
bun --filter @projectproject/frontend run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/Reviews/ReviewDiffPane.tsx packages/frontend/src/components/Reviews/ReviewFileDiffBlock.tsx packages/frontend/src/components/Reviews/ReviewFilesWorkspace.tsx
git commit -m "feat(review): render PR file diffs"
```

---

## Task 12: Pending review comments and submit flow

**Files:**

- Create: `packages/frontend/src/components/Reviews/ReviewCommentEditor.tsx`
- Create: `packages/frontend/src/components/Reviews/ReviewSubmitPopover.tsx`
- Modify: `ReviewDiffPane.tsx`
- Modify: `ReviewFileDiffBlock.tsx`
- Modify: `ReviewFilesWorkspace.tsx`

- [ ] **Step 1: Add component-local pending comment state**

Pending comments live in the files view component until submitted. They do not need durable cache state in v1.

- [ ] **Step 2: Render inline comment form**

Clicking or dragging a line/range opens the form at that position. User can save a pending comment, cancel, edit, or remove it before submission.

- [ ] **Step 3: Build GitHub markdown editor**

Use a review-specific editor/textarea that inserts literal GitHub markdown. Do not use ProjectProject Lexical mention nodes or `mention:` URLs.

- [ ] **Step 4: Add `@` mention insertion**

Use PR author, reviewers, participants, and existing review commenters as candidates. Insert literal `@login`.

- [ ] **Step 5: Add `#` ticket insertion**

Search current-project tickets using existing ticket search APIs. Insert an absolute ProjectProject URL in markdown:

```md
[T-12](https://<host>/orgs/<org>/projects/<project>/tickets/T-12)
```

- [ ] **Step 6: Build submit popover**

Support events:

- comment
- approve
- request changes

Submit one GitHub review containing all pending comments. Keep mutation errors visible inside the submit surface.

- [ ] **Step 7: Refresh after submit**

On success, clear pending comments and refresh comments/overview base atoms.

- [ ] **Step 8: Typecheck**

```bash
bun --filter @projectproject/frontend run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add packages/frontend/src/components/Reviews
git commit -m "feat(review): submit pending review comments"
```

---

## Task 13: Existing review threads

**Files:**

- Modify: `ReviewFileDiffBlock.tsx`
- Modify: `ReviewDiffPane.tsx`
- Modify: `ReviewFilesWorkspace.tsx`

- [ ] **Step 1: Map GitHub comments to Pierre annotations**

Render inline threads at GitHub-provided positions when the position maps to the current diff.

- [ ] **Step 2: Render replies**

Show existing replies under the first comment. Use GitHub actor, timestamp, body markdown, and GitHub URL where available.

- [ ] **Step 3: Add reply form**

When `capabilities.canReview` is true, allow replies. Keep mutation errors inside the reply surface.

- [ ] **Step 4: Add resolve/unresolve controls**

Show controls only when GitHub exposes a thread id and the backend capability allows the mutation.

- [ ] **Step 5: Handle outdated threads**

Show outdated threads as read-only and clearly marked. If an outdated thread cannot be mapped to a current diff location, group it in a per-file outdated section or a bottom-of-files section.

- [ ] **Step 6: Typecheck**

```bash
bun --filter @projectproject/frontend run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/components/Reviews
git commit -m "feat(review): show and manage review threads"
```

---

## Task 14: Merge, close, and reopen actions

**Files:**

- Create: `packages/frontend/src/components/Reviews/ReviewActions.tsx`
- Modify: `ReviewFilesWorkspace.tsx`
- Modify: `ReviewOverview.tsx` if overview exposes actions

- [ ] **Step 1: Implement primary action rules**

Rules:

- open and mergeable PR: `Merge`
- open PR: `Submit review` remains primary review action
- open PR: `Close PR` in overflow
- closed and unmerged PR: `Reopen PR`
- merged PR: read-only state

- [ ] **Step 2: Build merge surface**

Show allowed merge methods. Default to `squash` when allowed; otherwise default to the next available method.

- [ ] **Step 3: Build close/reopen surfaces**

Use overflow for close on open PRs. Use primary action for reopen on closed unmerged PRs.

- [ ] **Step 4: Respect disabled reasons**

Controls should be visible but disabled when the action is relevant and unavailable. Surface backend disabled reasons in concise copy.

- [ ] **Step 5: Refresh after mutations**

Merge/close/reopen refresh review overview, comments if needed, project git states, and linked ticket atoms.

- [ ] **Step 6: Typecheck**

```bash
bun --filter @projectproject/frontend run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/components/Reviews
git commit -m "feat(review): add PR lifecycle actions"
```

---

## Task 15: Keyboard navigation and polish pass

**Files:**

- Modify: review components as needed

- [ ] **Step 1: Add navigation shortcuts**

Implement:

- `f`: focus file search
- `j`: next changed file
- `k`: previous changed file

Only fire shortcuts when focus is not inside an input, textarea, editor, select, or menu.

- [ ] **Step 2: Add optional split/unified shortcut only if simple**

Do not add shortcuts for submit, merge, close, or reopen.

- [ ] **Step 3: Review responsive behavior**

Check:

- overview right rail stacks below body on mobile
- files view uses unified diff on mobile
- file tree drawer is reachable
- line commenting remains possible

- [ ] **Step 4: Review design constraints**

Check:

- no uppercase chrome labels
- hover states have transition classes
- buttons have active press scale
- no nested cards
- no decorative gradients/orbs
- light and dark are both finished

- [ ] **Step 5: Typecheck**

```bash
bun --filter @projectproject/frontend run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/Reviews packages/frontend/src/routes/_authed/orgs/'$orgSlug'/projects/'$slug'/reviews/'$prNumber'.tsx
git commit -m "feat(review): polish review workspace interactions"
```

---

## Task 16: Automated and manual verification

**Files:** test files and any fixes.

- [ ] **Step 1: Run full typechecks**

```bash
bun run typecheck
```

- [ ] **Step 2: Run backend tests**

```bash
bun --filter @projectproject/backend test
```

- [ ] **Step 3: Run frontend tests if available**

```bash
bun --filter @projectproject/frontend test
```

If the frontend package still has no usable test script for this area, record that and rely on typecheck plus manual verification.

- [ ] **Step 4: Run formatting and lint**

```bash
bun run format:check
bun run lint
```

- [ ] **Step 5: Manual checklist**

Verify:

- Open review from ticket detail.
- Open review from ticket list PR chip/menu.
- Overview renders PR body and linked ticket.
- `Review changes` switches to files view.
- Missing personal GitHub connection disables write controls with persistent prompt.
- File search focuses with `f`.
- `j`/`k` move between changed files.
- Active file tracks while scrolling.
- Split diff works on desktop.
- Mobile forces unified diff and uses file-tree drawer.
- Large PR progressively loads without blocking the page.
- Binary/too-large file state is usable.
- Pending comment can be added, edited, removed, and submitted.
- Submit review failure stays visible in the submit surface.
- Existing review thread replies work.
- Resolve/unresolve works when GitHub allows it.
- Outdated threads remain visible and read-only.
- Draft PR allows comments but disables merge with `draft_pr`.
- Open mergeable PR shows merge as primary PR action.
- Open PR shows close in overflow.
- Closed unmerged PR shows reopen.
- Merged PR is read-only.
- Merge refreshes git state and the existing ticket-done observation handles ticket status.
- `#` ticket picker inserts an absolute ProjectProject URL.
- `@` picker inserts literal GitHub mention text.
- ProjectProject ticket links in GitHub comments render as chips when displayed back in ProjectProject.
- Light and dark themes both look complete.

- [ ] **Step 6: Commit final fixes**

```bash
git add .
git commit -m "test(review): verify in-app PR review"
```

---

## Deferred follow-ups

- Repo-wide collaborator search endpoint for `@` mention autocomplete.
- Follow-up ticket creation from review comments.
- GitHub backlink reply when a follow-up ticket is created.
- Agent handoff from selected review comments or generated follow-up tickets.
- Review inbox / queue.
- Full PR conversation timeline.
- Suggestion builder and apply-suggestion UI.
- Webhooks or live refresh.
