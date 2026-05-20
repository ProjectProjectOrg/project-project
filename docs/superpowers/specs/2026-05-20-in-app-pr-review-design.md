# In-app PR review - design

**Date:** 2026-05-20
**Status:** Draft, ready for implementation planning
**Source:** Product grilling session on ProjectProject-owned PR review

## Goal

Add a ProjectProject-native PR review surface for GitHub pull requests that are linked to tickets.

ProjectProject owns the user experience and workflow context. GitHub remains the source of truth for pull request data, review comments, approvals, thread resolution, checks, merge state, and patch payloads.

The product goal is not to rebuild GitHub or DiffKit. The goal is a ticket-aware review cockpit: review code, submit GitHub reviews, merge/close/reopen PRs, and keep the linked ProjectProject ticket visible without leaving the app.

## Product boundary

### Ownership

ProjectProject owns:

- Routing, layout, and review UI.
- Project/ticket access control before any GitHub data is shown.
- Linked-ticket context in the PR page.
- Ticket links inserted into review comments.
- Refresh and capability presentation.

GitHub owns:

- PR title/body/state/mergeability/checks.
- File summaries, patches, and review comments.
- Pending review submission.
- Review thread replies and resolve/unresolve state.
- Merge, close, and reopen mutations.

ProjectProject does not persist a local copy of review comments, patches, approvals, checks, or thread state in v1.

### Token model

Reads use the project GitHub App installation when possible:

- PR detail.
- Changed file summaries.
- Patch pages.
- Review comments and threads.
- Checks and merge capability data.

Writes require the current ProjectProject user to have personal GitHub connected:

- Submit review.
- Reply to a review thread.
- Resolve or unresolve a review thread.
- Merge.
- Close.
- Reopen.

If the user has ProjectProject access but no personal GitHub connection, the page is readable and write controls are disabled behind a persistent connect prompt.

## References and dependencies

Use DiffKit in `opensrc/repos/github.com/stylessh/diffkit` as a reference for the review workspace shape, especially:

- `apps/dashboard/src/components/pulls/review/review-page.tsx`
- `apps/dashboard/src/components/pulls/review/review-diff-pane.tsx`
- `apps/dashboard/src/components/pulls/review/review-file-diff-block.tsx`
- `apps/dashboard/src/components/pulls/review/review-file-tree.tsx`

Use the Pierre packages requested for the core rendering:

- `@pierre/diffs` for diff rendering and line/range selection. Verified latest npm version during spec writing: `1.1.22`.
- `@pierre/trees` for the changed-file tree. Verified latest npm version during spec writing: `1.0.0-beta.4`.

Implementation should validate the exact `@pierre/trees` React API before committing to component-level shapes, because it is still beta.

## Scope

In scope:

- PR-centered route for ticket-linked PRs only.
- Overview view first, with title/body and ProjectProject ticket context.
- Dedicated files view for code review.
- Changed-files-only tree.
- Split/unified diff viewer.
- Multi-line line/range comments.
- Pending review model: draft multiple comments, then submit once as comment/approve/request changes.
- Existing review thread display, replies, and resolve/unresolve.
- Outdated thread display, read-only and clearly marked.
- Merge, close, and reopen actions.
- GitHub mentions in review comments.
- Current-project ticket picker in review comments.
- Backend-owned review API and explicit capability model.
- Explicit refresh/refetch, no webhook requirement.
- Desktop-first UX that is not broken on mobile.
- Low-risk keyboard navigation shortcuts.

Out of scope:

- Follow-up ticket creation from review comments.
- Review inbox or project-level review queue.
- Full repository file browser.
- Unchanged repository file tree.
- Full PR timeline/conversation feed.
- GitHub issue comments outside diff review threads.
- Editing PR title/body/labels/reviewers.
- Update branch from base.
- Suggestion builder or apply-suggestion UI.
- AI or code-agent handoff.
- Local durable review metadata.
- Reviewing unlinked PRs.
- GitHub webhooks or live sockets.

## Routing

Primary route:

```txt
/orgs/:orgSlug/projects/:slug/reviews/:prNumber
```

View mode is represented as a search param:

```txt
/orgs/:orgSlug/projects/:slug/reviews/:prNumber?view=overview
/orgs/:orgSlug/projects/:slug/reviews/:prNumber?view=files
```

Default view is `overview`.

Entry points:

- Ticket detail git panel: `Review PR`.
- Ticket list PR chip/menu: `Review`.

The route is centered on the PR number, but the backend must resolve a linked ProjectProject ticket before returning the review page. V1 only supports PRs linked to a ticket in the current project.

Linked-ticket resolution:

1. Load project GitHub connection.
2. Confirm the current user is a ProjectProject member.
3. Find a ticket whose stored PR number matches `:prNumber`.
4. If no match is found, the backend may reuse the existing git-state refresh path once, then retry resolution.
5. If still no match, return `NotFound`.

## Page model

### Overview view

Overview should feel like DiffKit's PR page, but ProjectProject-styled:

- Breadcrumb: project / ticket / repo / PR number.
- PR title.
- State, author, base branch, head branch.
- Compact stats/action strip:
  - commits
  - files changed
  - additions/deletions
  - `Review changes` action
- PR body rendered as markdown.
- Right rail:
  - linked ticket card
  - reviewers
  - participants
  - details such as created/updated/comments/review comments

No full timeline. The only long content in overview is the PR body.

`Review changes` switches to `view=files` on the same route.

### Files view

Files view is a dedicated review workspace:

- Compact top bar:
  - PR number and title
  - changed-file count and additions/deletions
  - unified/split toggle
  - primary review action
  - primary PR action
  - overflow menu
- Left rail:
  - changed-file tree only
  - search input
  - file status/addition/deletion markers
  - active file tracking
  - optional comment count badges
- Main pane:
  - virtualized/progressively rendered file diff blocks
  - sticky file headers
  - inline review threads
  - pending draft comments

The overview right rail disappears by default in files view to preserve diff width. Linked ticket context is available from a compact header chip/popover.

## PR actions

Primary action rules:

- Open and mergeable PR: `Merge` is the primary PR action.
- Open PR: `Submit review` is the primary review action, visible even before comments exist and visually stronger when pending comments exist.
- Open PR: `Close PR` lives in overflow.
- Closed and unmerged PR: `Reopen PR` is the primary PR action.
- Merged PR: read-only merged state, no primary PR action.

Draft PRs:

- Review comments and approve/request-changes are allowed if GitHub allows them.
- Merge is disabled with a `draft_pr` reason.

Merge:

- Show all merge methods allowed by GitHub for the repo/PR.
- Default to `squash` when allowed.
- If squash is not allowed, default to the next available method.
- After merge, refresh review data and project git state.
- Do not directly mutate the ticket status in the merge action. Reuse the existing merged-PR observation rule that sets the linked ticket to `done` idempotently.

## Review comments

New diff comments use GitHub's pending review model:

1. User clicks or drags a line/range in the diff.
2. Inline comment form opens at that line/range.
3. User can add multiple pending comments.
4. `Submit review` sends one GitHub review event:
   - comment
   - approve
   - request changes

Pending comments can be edited or removed before submission.

Existing review threads:

- Render inline at their GitHub-provided position when possible.
- Allow replies when the user has review write capability.
- Allow resolve/unresolve when GitHub exposes the thread capability.
- Show outdated threads as read-only and clearly marked.
- If an outdated thread cannot be mapped to the current diff, group it in an outdated threads section for the file or at the bottom of the files view.

No suggestion UI in v1. Users may type GitHub suggestion fences manually, but ProjectProject does not offer a builder or apply action.

## Mentions and links

Review comments are GitHub-bound markdown, so they must not use ProjectProject's internal `mention:` scheme.

`@` mentions:

- Source from GitHub data, not ProjectProject members.
- Candidate sources can include repo collaborators, PR participants, PR author, requested reviewers, and existing review commenters.
- Selecting a candidate inserts the literal GitHub mention, for example `@octocat`.
- GitHub remains responsible for parsing, linking, and notifications.

`#` ticket references:

- Source from tickets in the current ProjectProject project only.
- Selecting a ticket inserts a normal absolute ProjectProject URL:

```md
[T-12](https://<projectproject-host>/orgs/<org>/projects/<project>/tickets/T-12)
```

- GitHub sees a normal markdown link.
- ProjectProject may render its own ticket URLs as ticket chips when displaying review comments in the review page.

No ProjectProject user mentions in PR review comments for v1.

## Backend API

All review data and mutations go through ProjectProject's backend. The frontend never calls GitHub directly.

New `reviews` HttpApi group, nested under org/project:

| Endpoint | Method | Path | Purpose |
| --- | --- | --- | --- |
| `reviews.get` | GET | `/orgs/:orgSlug/projects/:slug/reviews/:prNumber` | Overview data, linked ticket, capabilities |
| `reviews.fileSummaries` | GET | `/orgs/:orgSlug/projects/:slug/reviews/:prNumber/file-summaries?cursor` | Changed file metadata pages |
| `reviews.files` | GET | `/orgs/:orgSlug/projects/:slug/reviews/:prNumber/files?cursor` | Patch payload pages |
| `reviews.comments` | GET | `/orgs/:orgSlug/projects/:slug/reviews/:prNumber/comments` | Review comments and thread state |
| `reviews.submit` | POST | `/orgs/:orgSlug/projects/:slug/reviews/:prNumber/reviews` | Submit pending review |
| `reviews.reply` | POST | `/orgs/:orgSlug/projects/:slug/reviews/:prNumber/comments/:commentId/replies` | Reply to a review comment |
| `reviews.resolveThread` | POST | `/orgs/:orgSlug/projects/:slug/reviews/:prNumber/threads/:threadId/resolve` | Resolve a review thread |
| `reviews.unresolveThread` | POST | `/orgs/:orgSlug/projects/:slug/reviews/:prNumber/threads/:threadId/unresolve` | Unresolve a review thread |
| `reviews.merge` | POST | `/orgs/:orgSlug/projects/:slug/reviews/:prNumber/merge` | Merge PR |
| `reviews.close` | POST | `/orgs/:orgSlug/projects/:slug/reviews/:prNumber/close` | Close PR |
| `reviews.reopen` | POST | `/orgs/:orgSlug/projects/:slug/reviews/:prNumber/reopen` | Reopen PR |

### DTO shape

The exact schema names can be finalized during implementation, but the frontend should receive ProjectProject-shaped DTOs, not raw GitHub payloads.

`ReviewPage` includes:

- `pr`: title/body/state/draft/base/head/author/repo/created/updated/counts/checks.
- `linkedTicket`: id/title/status/type/priority/assignees/branch/git state.
- `reviewers`: requested reviewers and current review decisions when available.
- `participants`: compact actor list.
- `capabilities`: explicit booleans and disabled reasons.
- `mergeMethods`: allowed merge methods plus selected default.

`ReviewFileSummary` includes:

- filename
- previous filename
- status
- additions/deletions
- change count
- comment/thread counts when available

`ReviewFilePatch` includes:

- file metadata
- patch string or null for binary/too-large
- pagination cursor metadata

`ReviewCommentThread` includes:

- first comment
- replies
- path
- side
- line/range
- resolved state
- outdated state
- GitHub URL when available

### Capabilities

Backend returns explicit capabilities. Frontend should not infer from PR state alone.

```ts
capabilities: {
  canView: boolean
  canReview: boolean
  canMerge: boolean
  canClose: boolean
  canReopen: boolean
  disabledReasons: {
    review: null | "personal_github_required" | "insufficient_permission" | "pr_not_open"
    merge: null | "personal_github_required" | "insufficient_permission" | "draft_pr" | "not_mergeable" | "pr_not_open"
    close: null | "personal_github_required" | "insufficient_permission" | "pr_not_open"
    reopen: null | "personal_github_required" | "insufficient_permission" | "pr_not_closed" | "pr_merged"
  }
}
```

Mutation failures still need inline error handling because GitHub can disagree after capabilities were fetched.

### GitHub API usage

Use a pragmatic REST/GraphQL mix:

- REST where simple and stable:
  - PR details when sufficient
  - list files/patches
  - submit review if the REST endpoint covers pending comments cleanly
  - merge
  - close/reopen
  - reply to review comments when available
- GraphQL where REST is missing or awkward:
  - resolve/unresolve review threads
  - richer thread status
  - mergeability or review decision data if REST is insufficient

No pure API-style rule. Use the endpoint that yields the cleanest service boundary.

## Frontend state

New review atoms should follow the existing `Atom.family` keying and optimistic mutation rules.

Likely families:

- `reviewAtom(reviewKey)`
- `reviewFileSummariesAtom(reviewKey)`
- `reviewFilesAtom(reviewKey)`
- `reviewCommentsAtom(reviewKey)`
- `submitReviewAtom(reviewKey)`
- `replyReviewCommentAtom(reviewKey)`
- `resolveReviewThreadAtom(reviewKey)`
- `mergeReviewAtom(reviewKey)`
- `closeReviewAtom(reviewKey)`
- `reopenReviewAtom(reviewKey)`

`reviewKey` should include `orgSlug`, `slug`, and `prNumber`.

Mutation atoms should refresh the relevant base atoms after success:

- Submit/reply/resolve/unresolve refresh comments and overview review state.
- Merge/close/reopen refresh overview, comments if needed, project git states, and linked ticket atoms.

For review submit, the pending comment list can remain component-local in files view until submitted. It does not need to be durable across navigation in v1.

## Loading and performance

Use hybrid progressive loading:

1. Load overview data first.
2. Load changed-file summaries separately and render the tree as soon as possible.
3. Load patch payloads in pages.
4. Auto-prefetch a small number of additional patch pages while the user reads.
5. Show `loaded N of M files` in the files view.
6. Do not aggressively fetch every patch for very large PRs.

The diff pane should avoid rendering heavy diff blocks far outside the viewport. DiffKit's near-viewport rendering pattern is a good reference.

Large/binary files:

- Show file header and a neutral "binary file or diff too large to display" state.
- Include an "open on GitHub" affordance.

## Error model

Persistent top banner:

- Missing personal GitHub connection.
- Insufficient GitHub write permission.

Region errors:

- Rate limit or upstream failure in file summaries/files/comments.
- Retry button in the affected region.

Mutation errors:

- Submit review failures render inside the submit popover/drawer.
- Merge failures render inside the merge confirmation popover/drawer.
- Close/reopen failures render inside the overflow action surface.
- Toasts are acceptable as secondary feedback, not the only error.

Stale/outdated comments:

- Show as outdated.
- Do not hide.
- Do not attempt custom remapping in v1.

## Responsive behavior

Desktop is the primary target.

Mobile should not be broken:

- Overview stacks right rail content below the PR body.
- Files view uses unified diff only.
- Changed-file tree opens as a drawer.
- Split toggle is hidden or disabled on narrow viewports.
- Line commenting should remain possible, even if not as refined as desktop.

## Keyboard shortcuts

V1 shortcuts are navigation-only:

- `f`: focus file search.
- `j`: next changed file.
- `k`: previous changed file.
- Optional: toggle unified/split if implementation is straightforward.

No shortcuts for submit review, merge, close, or reopen.

## i18n

Introduce a reviews message domain during implementation:

- `packages/frontend/messages/en/reviews.json`
- Prefix: `reviews_`

The same PR must update:

- `CLAUDE.md` prefix table.
- Inlang `pathPattern`.

All user-facing review strings go through paraglide messages.

## Testing

Backend tests:

- Linked-ticket resolution succeeds for stored PR number.
- Linked-ticket resolution refreshes git state once before failing.
- Non-member cannot read review data.
- Project member can read linked PR data through installation access.
- Write actions require personal GitHub.
- Capability reasons match PR state and token state.
- Submit review maps pending line/range comments to GitHub shape.
- Merge refreshes git state and relies on existing ticket done transition.
- Close/reopen call the correct GitHub mutation.

Frontend tests:

- Overview renders title/body/linked ticket context.
- `Review changes` switches to files view.
- Files view renders changed-file tree from summaries.
- Split/unified default: split on desktop, unified on mobile.
- Pending comments can be added, edited, removed, and submitted.
- Submit review errors remain visible in the submit surface.
- Merge primary action appears only when capability allows it.
- Close appears in overflow for open PRs.
- Reopen appears as primary for closed unmerged PRs.
- Missing personal GitHub connection disables write controls.
- `#` ticket picker inserts a ProjectProject ticket URL.
- `@` picker inserts literal GitHub `@login` text.

Manual checklist:

- Open review from ticket detail.
- Open review from ticket list PR chip/menu.
- Overview looks finished in light and dark themes.
- Files view looks finished in light and dark themes.
- File search focuses with `f`.
- Active file tracks while scrolling.
- Large PR progressively loads without blocking the page.
- Binary/too-large diff state is usable.
- Draft PR allows comments but disables merge.
- Merged PR is read-only.
- Closed unmerged PR shows reopen.
- ProjectProject ticket links in GitHub review comments render as chips when viewed back in ProjectProject.

## Deferred follow-ups

- Follow-up ticket creation from submitted review comments.
- GitHub backlink reply when a follow-up ticket is created.
- Agent handoff from selected review comments or generated follow-up tickets.
- Review inbox / queue.
- Full PR conversation timeline.
- Full repository file browser.
- ProjectProject member mentions mapped to GitHub identities.
- Webhook-driven live refresh.
- Review notification surface.
