# Git Connection — Design

**Date:** 2026-05-03
**Status:** Approved, ready for implementation plan
**Spec context:** Phase 5 of `docs/PROJECTPROJECT.md`, expanded scope.

## Goal

Make ProjectProject usable for managing ProjectProject's own development. The git connection is a **bridge** to GitHub, not a replacement: repo connection at the project level, every other git affordance lives on tickets. No background sync, no webhooks, on-demand polling only.

## Scope

In scope:

- Connect / disconnect a GitHub repo to a project (owner/admin).
- Create branch from a ticket (any member).
- Open PR from a ticket (any member).
- Live branch + PR status surfaced on ticket list and ticket detail.
- Auto-transition ticket `status` to `done` when PR merges (idempotent).
- Stale-branch detection (frontmatter says branch X, remote says it's gone).
- Token / scope / repo-gone error states with reconnect affordances.

Out of scope:

- Multiple repos per project.
- Non-GitHub providers (GitLab, Bitbucket).
- Webhook-based realtime updates.
- PR review surfaces (requesting reviewers, approvals).
- CI/CD orchestration beyond surfacing GitHub Actions check status.
- Issue ↔ ticket linking on the GitHub side.

## Data Model

### `project.md` frontmatter

Already specifies a `github` block. One additive field:

```yaml
github:
  repoOwner: woutervh
  repoName: project-project
  branchTemplate: "{type}/{id}-{slug}"
  defaultBaseBranch: main         # NEW; optional. Overrides repo default.
```

### `tickets/T-N.md` frontmatter

Two new fields:

```yaml
branch: feat/T-12-add-button     # already exists; null until created
pr: 42                            # NEW. PR number, null if no PR.
lastTransitionedPr: 42            # NEW. Idempotency key for auto-status.
```

`pr` is updated whenever a fetch observes a PR for the ticket's branch. `lastTransitionedPr` is written exactly once per PR — when we first observe it as merged and flip ticket status to `done`. If the user later moves the ticket back to `in_progress`, we don't reflip, because `lastTransitionedPr === currentPrNumber`.

### Schemas (`packages/shared/src/schemas`)

- Extend `Project` schema's `github` field with `defaultBaseBranch?: string`.
- Extend `Ticket` with `pr: number | null` and `lastTransitionedPr: number | null`.
- New `GitState` schema (per ticket): a tagged union over `NoBranch | Branch | BranchAhead | PrOpen | PrMerged | PrClosed | StaleBranch`, each with the fields needed to render the corresponding UI state.
- New shared `GitHubRepo` schema (`owner`, `name`, `defaultBranch`, `private`, `description`).

## Backend

### `GitHub` service (`packages/backend/src/services/GitHub.ts`)

`Context.Tag` with the following shape (Octokit calls under the hood, server-side only):

```ts
listUserRepos(userId, query?, page?)              → Effect<RepoPage, GitHubTokenExpired | GitHubError>
verifyAccess(repo, userId)                         → Effect<void, RepoGone | GitHubScopeInsufficient | GitHubError>
getDefaultBranch(repo, userId)                     → Effect<string, RepoGone | GitHubError>
createBranch(repo, name, baseBranch, userId)       → Effect<{ name, sha }, BranchExists | BranchProtected | RepoGone | GitHubError>
openPullRequest(repo, args, userId)                → Effect<{ number, url }, BranchProtected | RepoGone | GitHubError>
fetchProjectTicketStates(repo, ticketBranches, userId)
                                                  → Effect<Record<branchName, RawGitState>, RepoGone | RateLimited | GitHubError>
```

`fetchProjectTicketStates` is a single GraphQL roundtrip that asks for every branch + associated PR in one shot. Returns raw data; mapping to `GitState` happens in `Tickets`.

Token sourced from `BetterAuth.getAccessToken(userId, "github")`. On 401 → `GitHubTokenExpired`. On 403 with scope hint → `GitHubScopeInsufficient`. On 404 → `RepoGone` (for repos) or `BranchExists` (handled by ref creation).

### `Tickets` service additions

```ts
applyMergeTransition(slug, ticketId, prNumber)     → Effect<{ transitioned: boolean }, NotFound | MarkdownError>
```

Reads ticket. If `lastTransitionedPr === prNumber`, returns `{ transitioned: false }`. Else writes `status: "done"`, `lastTransitionedPr: prNumber`, returns `{ transitioned: true }`. Idempotent under concurrent calls — last write wins, but the result is the same regardless.

```ts
listGitStates(slug, userId)                        → Effect<Record<ticketId, GitState>, ...>
```

1. Loads project, verifies user is a member, reads `github` block.
2. Lists tickets, collects `(ticketId, branch)` pairs. Tickets without a branch return `NoBranch` immediately.
3. Calls `GitHub.fetchProjectTicketStates` for the rest.
4. For any state where PR is `merged` and `pr !== lastTransitionedPr`, calls `applyMergeTransition`. Records a `transitioned` entry.
5. Also writes `pr` field back to ticket frontmatter when observed PR number differs from stored `pr`. Keeps the file as source of truth.
6. Returns `{ states: Record<id, GitState>, transitioned: TransitionRecord[] }`.

**Notable choice:** a "read" of git state can mutate ticket markdown (status + pr fields). Justification: keeps the auto-transition trigger atomic with the observation, removes a frontend roundtrip, idempotency is enforced by `lastTransitionedPr`. Alternative considered: separate explicit endpoint the frontend calls after observing merged. Rejected as more roundtrips for no benefit.

### HttpApi endpoints (`packages/shared/src/api.ts`)

Add a `github` group plus extensions to `projects` and `tickets`:

| Endpoint                              | Method | Path                                       | Auth                  |
| ------------------------------------- | ------ | ------------------------------------------ | --------------------- |
| `github.listRepos`                    | GET    | `/github/repos?q&page`                     | authed user           |
| `projects.connectGithub`              | POST   | `/projects/:slug/github`                   | owner/admin           |
| `projects.disconnectGithub`           | DELETE | `/projects/:slug/github`                   | owner/admin           |
| `projects.gitStates`                  | GET    | `/projects/:slug/git-states`               | member                |
| `tickets.createBranch`                | POST   | `/projects/:slug/tickets/:id/branch`       | member                |
| `tickets.openPr`                      | POST   | `/projects/:slug/tickets/:id/pr`           | member                |
| `tickets.clearBranch`                 | DELETE | `/projects/:slug/tickets/:id/branch`       | member                |

`gitStates` response: `{ states: Record<ticketId, GitState>, transitioned: TransitionRecord[], tokenStatus: "ok" | "expired" | "scope_insufficient", repoStatus: "ok" | "gone" }`. The latter two let the frontend flip the header chip without making the per-ticket states carry the failure context.

### Permissions

| Action                  | owner | admin | member |
| ----------------------- | :---: | :---: | :----: |
| Connect/disconnect repo |   ✓   |   ✓   |   –    |
| Set `defaultBaseBranch` |   ✓   |   ✓   |   –    |
| Create branch           |   ✓   |   ✓   |   ✓    |
| Open PR                 |   ✓   |   ✓   |   ✓    |
| Clear branch link       |   ✓   |   ✓   |   ✓    |
| Read git states         |   ✓   |   ✓   |   ✓    |

Auto-status transition runs server-side and bypasses permission checks: it's triggered by observation, not by a user action.

### Tagged errors

All `Schema.TaggedError` (cross the wire), defined in `packages/shared/src/errors.ts`:

- `GitHubTokenExpired` — Better Auth says token is expired or refresh failed.
- `GitHubScopeInsufficient` — token lacks `repo` scope (e.g. user revoked it post-consent).
- `RepoGone` — connected repo no longer accessible (deleted, renamed, access revoked).
- `BranchExists` — `createBranch` collided.
- `BranchProtected` — `createBranch` or `openPr` blocked by branch protection.
- `RateLimited` — primary or secondary rate limit hit. Carries reset timestamp.
- `GitHubError` — catch-all with raw message.

## Frontend

### Header chip (project page header)

States, all rendered as a small chip next to the project title:

- **Not connected, owner/admin:** "Connect repo" button → click expands inline below the header into the connect surface (search input + paginated repo picker → confirm).
- **Not connected, member:** nothing.
- **Connected:** chip `<github-icon> owner/repo` linking to GitHub. Owner/admin: chevron expands an inline panel with `defaultBaseBranch` editor + "Disconnect repo" (inline confirm step, no dialog).
- **Token broken:** warning chip "GitHub token expired — Reconnect" linking to OAuth re-auth. Driven by `tokenStatus !== "ok"` in `gitStates` response.
- **Repo gone:** warning chip "Repo not accessible — Reconnect or Disconnect" (owner/admin only, otherwise generic "GitHub repo unreachable" pill).

### Ticket list — git column

One narrow right-aligned column added to the existing TanStack Table after `assignee`. Renders one of:

- (empty) — no branch.
- `<branch> name` — branch only.
- `<git> +N` — branch with N commits ahead, no PR.
- `<pr> #42 open` — checks-aware color (green/yellow/red/grey).
- `<pr> #42 draft`.
- `<pr> #42 merged`.
- `<pr> #42 closed`.
- `<warning> stale` — frontmatter has branch, remote does not.

Hover → tooltip with full info (commits ahead, base branch, PR title). Click on chip → opens GitHub. Row click is unchanged (opens ticket detail).

### Ticket detail — git panel

Single row below the title, above the description. Shape shifts with state:

- **No branch:** "Create branch" button. Click → row expands inline:
  - Name input pre-filled from `branchTemplate`.
  - Base-branch picker, default `defaultBaseBranch ?? repo.defaultBranch`.
  - Confirm / Cancel.
  - Per `feedback_intent_micro_interactions`: focusing the name input dims the panel and collapses the title to a small breadcrumb.
- **Branch, no PR, 0 commits ahead:** branch chip + "Branch ready, no commits yet" hint.
- **Branch, no PR, N commits ahead:** branch chip + "Open PR" → expands inline:
  - Title pre-filled from ticket title.
  - Body pre-filled with link back to the ticket.
  - "Draft" toggle.
  - Confirm / Cancel.
- **PR open / draft:** branch chip + PR chip with status (checks pill, draft pill, link out).
- **PR merged:** merged pill + "ticket auto-set to done [<relative time>]". Status is editable as before; we won't reflip.
- **PR closed (unmerged):** closed pill + "Open new PR" affordance.
- **Stale branch:** inline warning + "Clear branch link" / "Recreate branch".

No dialogs anywhere. All confirms inline (per the no-dialogs rule).

### Auto-status transition UX

`gitStates` response includes a `transitioned: TransitionRecord[]` array. On receipt the frontend:

1. Refreshes affected ticket atoms.
2. Shows one toast per transition: "T-12 → done (PR #42 merged)". Non-modal, dismissible, no undo (status is editable; user can move it back manually if they disagree).

### Atoms (`packages/frontend/src/atoms/`)

```
github.ts:
  githubReposAtom            — Atom.family((query: string) => paginated repo list)

projects.ts:
  connectRepoAtom            — Atom.fn (refreshes projectAtom, invalidates gitStates)
  disconnectRepoAtom         — Atom.fn (refreshes projectAtom, invalidates gitStates)

tickets.ts:
  projectGitStatesAtom       — Atom.family((slug) => GitStatesResponse)
                               TTL 30s, refresh on focus and post-mutation
  createBranchAtom           — Atom.fn (refreshes ticketAtom, invalidates gitStates for slug)
  openPrAtom                 — Atom.fn
  clearBranchAtom            — Atom.fn
```

### Routing

No new routes. The connect-repo surface and ticket-level git affordances all live within existing `_authed/projects/$slug/*` routes. The header chip lives in the project layout (`route.tsx`).

## Testing

- **`@effect/vitest` service tests:**
  - `GitHub.fetchProjectTicketStates` against a faked Octokit layer; assert mapping of `merged`, `closed`, `draft`, `checks` to wire-side `GitState`.
  - `Tickets.applyMergeTransition` idempotency — call twice, second is `{ transitioned: false }`.
  - `Tickets.listGitStates` writes `pr` and `lastTransitionedPr` to ticket markdown when applicable.
- **Repository test:** `Markdown` write of `lastTransitionedPr` round-trips through Schema.
- **API integration:** full handlers with a faked GitHub layer; assert wire-side error mapping for each tagged error.
- **Frontend:** render the ticket detail panel through each git-state branch with a stubbed `ApiClient` layer.

## Open follow-ups (deferred)

- Webhook-based realtime updates: pushes us toward background workers + signing-key management. Not now.
- Multi-repo per project: needs a different data model on `project.md`. Not now.
- PR template support: trivial follow-up once openPr exists.
- Surface check-run details inline (which checks failed): nice-to-have, hidden behind the open-PR chip's tooltip for now.
