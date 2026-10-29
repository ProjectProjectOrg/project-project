# ProjectProject — Architecture

ProjectProject (PP) is a markdown-first project management tool: organizations, projects, tickets, sprints and epics, with GitHub branch and PR automation, integrations, an MCP server and the `pp` CLI. Project content lives in markdown files on disk; Postgres holds identity, access, integration state and rebuildable indexes.

This file describes the system as it is. Keep it current in the same PR as the change that makes it wrong. How we work, and the frontend conventions, live in `AGENTS.md`; the visual system lives in `DESIGN.md` and `PRODUCT.md`; running it lives in `README.md` and `docs/deploy.md`.

---

## Tech stack

| Layer              | Choice                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Runtime            | Bun (backend, CLI), Node for frontend tooling                          |
| Monorepo           | Bun workspaces + Turborepo                                             |
| Core library       | Effect v4 (`effect`, `effect/http-api`, `effect/sql`, `effect/reactivity`) |
| Backend            | Effect `HttpApi`, schema-first, sharing one contract with the frontend |
| Database           | Postgres via Drizzle and Effect SQL                                    |
| Durable work       | Effect workflows on the Postgres-backed SQL workflow engine            |
| Auth               | Better Auth: GitHub, Google and magic-link sign-in, organizations, admin, JWT, OAuth provider for MCP and the CLI |
| Markdown storage   | `PROJECTS_DIR` on disk (bind-mounted in production)                    |
| Object storage     | Per-organization S3 connection for attachments and images              |
| Frontend           | React SPA on TanStack Router (Vite plugin), `@effect/atom-react`, TanStack Form |
| UI                 | shadcn/ui on Base UI, Fluid Functionalism components, Tailwind         |
| Editor             | Lexical with markdown import/export                                    |
| Tests              | Vitest with `@effect/vitest`                                           |
| Delivery           | Docker images on ghcr.io, nightly and stable release channels          |

---

## Workspaces

Packages use the `@pp/*` namespace.

| Workspace                       | Owns                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/backend`                  | HTTP transport, Better Auth, runtime composition, integration hosts, the tool route, MCP       |
| `apps/frontend`                 | The React SPA, organized by feature (see `AGENTS.md`)                                          |
| `apps/cli`                      | `pp`, a CLI over the tool catalog with its own sign-in (see `apps/cli/README.md`)              |
| `packages/shared`               | The `HttpApi` contract, schemas, tagged errors, the tool catalog, pure domain logic            |
| `packages/access`               | Org and project roles, permission statements and data-dependent policies                       |
| `packages/db`                   | Drizzle schema, migrations and DB layers. All migrations live here                             |
| `packages/server-core`          | Domain services and live layers: projects, tickets, comments, markdown, access, storage, …    |
| `packages/integration-github`   | GitHub App auth, branches, PRs, webhooks, project git state                                    |
| `packages/integration-slack`    | Slack notifications and ticket link previews (see its README)                                  |
| `packages/integration-everhour` | Everhour time tracking (see its README)                                                        |
| `packages/integration-jira`     | Durable Jira Cloud project migration                                                           |

`@pp/shared` is the keystone: the backend implements its `HttpApi`, the frontend's typed client is derived from it, and the tool catalog in `packages/shared/src/tools` is served both over MCP and to the CLI.

Integration packages own provider behavior and reach PP through Effect host services that the backend supplies. Core never imports an integration package. Figma is the exception today and still lives in `server-core`.

---

## Data model

### What lives in markdown

```
<PROJECTS_DIR>/orgs/<org-slug>/
├── library.md, blocks/, templates/        # org-level blocks and templates
└── projects/<project-slug>/
    ├── project.md
    ├── tickets/<ticket-id>.md             # frontmatter, description, comments region
    ├── groups/<group-id>.md               # sprints and epics
    └── blocks/, templates/                # project-level library
```

The rule: markdown holds what is **portable and cheap** — anything a human would write or read, or another tool could use, expressed in a few characters. Postgres holds what is neither — data that is large, opaque or meaningless outside this instance. Losing the Postgres half costs a re-upload or a reindex, not information. See `docs/superpowers/specs/2026-09-10-aesthetic-data-in-postgres-design.md`.

**`project.md`:**

```markdown
---
slug: design-system
name: Design System Rewrite
createdBy: github_42 # users.id from postgres, audit only
github:
  repoOwner: woutervh
  repoName: design-system
branchTemplate: "{type}/{id}-{slug}" # default: feat/T-12-add-button
createdAt: 2025-11-04T10:00:00Z
---

# Design System Rewrite

A long-form description of the project lives here as markdown body.
This is what gets shown on the project landing page.
```

**`tickets/T-12.md`:**

```markdown
---
id: T-12
title: Add primary button component
status: in_progress # one of the project's statuses
type: feat # feat | bug | chore | other
branches: # omitted until a branch is linked
  - branch: feat/T-12-add-primary-button # the ticket's own branch
    base: main # what its pull request targets
    pr: 41
    prState: merged # open | closed | merged
    landed: true # its merge reached the default branch
  - branch: feat/T-12-polish # stacked on the branch above
    base: feat/T-12-add-primary-button
    pr: 42
    prState: open
    prDraft: true
ignoredBranches: # never linked automatically again
  - feat/T-12-spike
assignees: [github_88]
createdBy: github_42
createdAt: 2025-11-04T11:30:00Z
updatedAt: 2025-11-04T15:12:00Z
---

# Add primary button component

Description body in markdown. This is what Lexical reads/writes.
Code blocks, lists, tables, the works.
```

Ticket IDs are sequential per project.

### What lives in Postgres

- **Identity and access:** Better Auth tables (users, sessions, accounts, organizations, members, invitations, OAuth clients and tokens), plus `project_member`, `project_role` and `project_invite_grant`.
- **Indexes:** `project_index`, `ticket_index`, `comment_index`, `attachment_index` and friends. They mirror markdown so lists, filters and lookups don't parse every file, and they can be rebuilt from it (`rebuild_ticket_index`). `project_index` also holds instance-local aesthetics: banner, icon image, placeholder.
- **Project configuration that is instance-bound:** statuses, tags, git automation.
- **Integration state:** connections, OAuth state, encrypted credentials, links, and per-integration delivery records.
- **Durable work:** activity, the provider-neutral integration event outbox, feedback outbox, and workflow engine state.

Adding a column for content a human writes is still a smell; it belongs in markdown.

---

## Surfaces

One set of services in `server-core` serves every surface. Handlers and tools stay thin.

- **Web app.** The SPA calls `/api/*` through the client derived from `AppApi`, with a Better Auth session cookie.
- **MCP.** A Streamable HTTP endpoint on the backend, authenticated through Better Auth's OAuth provider so each client acts as the consenting user. It serves the tool catalog: reads (`me`, orgs, projects, tickets, groups and sprints, statuses, tags, members, git state, docs, blocks and templates) and writes (create and update tickets, comments, attachments, branches and stacks, sprints). Tools carry read-only and destructive hints for agent hosts.
- **CLI.** `pp` calls the same tool catalog over an HTTP tool route, with its own OAuth client, token audience and DPoP-bound tokens. It picks a default org and project, and keeps itself in step with the server's release.

Tagged errors map to the same taxonomy on every surface.

---

## Access

Access lives in Postgres, not in markdown. There are two levels. Org owners and admins can read every project's content, but changing it always needs a project role.

- **Org roles** (Better Auth's `member.role`): `owner`, `admin`, `member`, `guest`. They govern the org: its people, integrations and projects.
- **Project roles** (`project_member.role_id`): `pm`, `developer`, `client`. One per person per project. Only people in the org can be on a project; leaving the org removes their project access.

Both role sets and their permissions are defined in `@pp/access` (`packages/access`). These matrices are its spec.

| Org action                                               | owner | admin | member | guest |
| -------------------------------------------------------- | ----- | ----- | ------ | ----- |
| Delete org, transfer ownership, billing                  | ✓     | –     | –      | –     |
| Invite and remove people, change org roles below owner   | ✓     | ✓     | –      | –     |
| Integrations, storage, org blocks and templates          | ✓     | ✓     | –      | –     |
| See all projects, manage their members, archive/delete   | ✓     | ✓     | –      | –     |
| Read every project's content                             | ✓     | ✓     | –      | –     |
| Create projects (creator becomes PM)                     | ✓     | ✓     | ✓      | –     |
| See the org member directory                             | ✓     | ✓     | ✓      | –     |

| Project action                                                  | pm | developer | client |
| --------------------------------------------------------------- | -- | --------- | ------ |
| View board, tickets, sprints, docs; create tickets              | ✓  | ✓         | ✓      |
| Edit tickets, change their status and assignees                 | ✓  | ✓         | ✓      |
| Delete tickets                                                  | ✓  | –         | –      |
| Plan sprints: create, edit, complete, delete                    | ✓  | –         | –      |
| Add tickets to a sprint and reorder it                          | ✓  | ✓         | ✓      |
| Take tickets out of a sprint or move them to another            | ✓  | –         | –      |
| Comment; edit and delete own comments                           | ✓  | ✓         | ✓      |
| Edit or delete others' comments                                 | ✓  | –         | –      |
| Epics, edit docs                                                | ✓  | ✓         | –      |
| Log time (after connecting your own Everhour), see time totals  | ✓  | ✓         | –      |
| GitHub: state, branches, PRs, connect the repo                  | ✓  | ✓         | –      |
| Figma links                                                     | ✓  | ✓         | ✓      |
| Tags, statuses, workflow, blocks and templates                  | ✓  | –         | –      |
| Project settings and integrations, members, archive/delete      | ✓  | –         | –      |

A project always keeps at least one PM. Org owners and admins without a project role can read every project's content, GitHub state and time totals, manage its members and archive or delete it, but can't change its content. Because they manage members, they can add themselves as PM and work on the project from then on.

Changing a ticket's status on the sprint board is a status change like any other; reordering the sprint doesn't change status. When a ticket is split, the new tickets may copy the original's status and sprint; choosing anything else needs the same permission as changing it.

Clients never see GitHub data: tickets come back with `branch`, `pr`, `prState` and `lastTransitionedPr` as null and an empty `gitState`, and project detail comes back without its `github` connection.

The frontend asks the same sources the server enforces: `canCallProject(permissions)` and `canCallOrg(role)` from `@pp/shared` read each endpoint's required permission from `AppApi`, and rules that depend on the data (comment authors, docs vs settings, sprint moves) call the `@pp/access` policies. Anything the viewer can't do is hidden or rendered read-only; the server still checks every request.

The `Access` service in `server-core` resolves the caller's roles into an `OrgScope` or `ProjectScope`. Every org and project endpoint in `packages/shared/src/api.ts` declares what it needs with a `RequiresOrg` or `RequiresProject` annotation, and the `OrgAccess` / `ProjectAccess` middleware resolves the scope, checks the annotation and hands the scope to the handler, failing with a tagged `Forbidden`. MCP tools declare the same requirement next to the tool. Services read the scope from context, so a service can't run without one, and only checks that depend on the data itself stay in the service. A caller who isn't in the org, or has no access to the project, gets `NotFound`.

---

## Integrations

- **GitHub** — a GitHub App per organization. Repos connect per project; tickets link branches and stacked PRs, and status automation runs on PR events through webhooks. Ticket ownership, stack reconciliation and status automation stay in core.
- **Slack** — workspace per organization, channel notifications per project, ticket link previews. See `packages/integration-slack/README.md`.
- **Everhour** — per-user time tracking against tickets. See `packages/integration-everhour/README.md`.
- **Figma** — linked frames on tickets. See `docs/figma-setup.md`.
- **Jira Cloud** — a durable, resumable migration of a Jira project into PP.
- **Feedback** — instances send feedback and bug reports to a central instance. See `docs/deploy.md`.

Document writes persist provider-neutral events through the durable outbox; each integration consumes only its own subscribed deliveries. Don't add a universal integration-driver interface.

---

## Releases

`main` is built nightly; a soaked nightly is promoted to stable. Versions are build dates (Amsterdam time). `pp upgrade` installs only this project's own GitHub releases. Details in `docs/deploy.md`.
