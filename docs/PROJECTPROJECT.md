# ProjectProject — A Markdown-First Project Management Tool

A learning project for building a real full-stack TypeScript application with Effect at its core. Jira/Trello-style project and ticket management, but with markdown files as the source of truth for project and ticket data, GitHub branch automation, and a rich-text editor on top.

The primary goal is **learning Effect deeply by building something real**. Secondary goals: end up with a tool that's actually useful on a homelab, and produce a codebase that mirrors what a production Effect app might look like.

---

## Tech Stack

| Layer              | Choice                                   | Why                                                                       |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------- |
| Runtime            | Bun                                      | Fast, native TypeScript, native workspaces, single binary in containers   |
| Monorepo           | Bun workspaces                           | No Turborepo/Nx — keep it minimal                                         |
| Backend framework  | `@effect/platform` HttpApi               | Schema-first API, derives OpenAPI spec, derives typed client              |
| Database           | Postgres                                 | Auth, sessions, OAuth tokens, project index                               |
| ORM                | Drizzle + `@effect/sql-drizzle`          | Drizzle ergonomics, Effect connection/transaction layers                  |
| Auth               | Better Auth (GitHub OAuth only)          | Cookie sessions; we get the GitHub token "for free" via the account table |
| Markdown storage   | Bind-mounted host directory              | Source of truth for projects/tickets, host-accessible for grep/AI         |
| Git                | Octokit, called from Effect              | Branch creation against connected repos                                   |
| Frontend framework | TanStack Start (SPA mode)                | File-based routing, devtools, no SSR                                      |
| State / cache      | `@effect-atom/atom-react`                | Atoms as cache cells, families as query keys                              |
| UI primitives      | BaseUI                                   | Headless, accessible, you style it                                        |
| Editor             | Lexical                                  | Configured for markdown I/O                                               |
| Tables             | TanStack Table                           | For the ticket list view                                                  |
| Testing            | `@effect/vitest` + React Testing Library | Effect-aware test runtime, layer mocking                                  |
| Container          | Docker Compose                           | One file, runs on the homelab                                             |

> **Effect version:** start on **v3 stable**. The team explicitly recommends v3 for production right now; v4 is in beta and Schema lives under `effect/unstable/schema`. Migrate after v4 LTS.

---

## Repository Layout

```
projectproject/
├── bun.lockb
├── package.json                      # workspaces config
├── docker-compose.yml
├── docker/
│   └── Dockerfile
├── data/                             # bind-mounted into container; gitignored
│   └── projects/
│       └── <project-slug>/
│           ├── project.md
│           └── tickets/
│               └── <ticket-id>.md
├── packages/
│   ├── shared/                       # HttpApi definition, Schemas, shared types
│   │   ├── package.json
│   │   └── src/
│   │       ├── api.ts                # HttpApi.make("projectproject").add(...)
│   │       ├── schemas/
│   │       │   ├── Project.ts
│   │       │   ├── Ticket.ts
│   │       │   └── User.ts
│   │       └── errors.ts             # tagged errors used in both ends
│   ├── backend/
│   │   ├── package.json
│   │   └── src/
│   │       ├── main.ts               # entry point
│   │       ├── server.ts             # HttpApiBuilder wiring
│   │       ├── services/             # domain services as Layers
│   │       │   ├── Db.ts
│   │       │   ├── Auth.ts
│   │       │   ├── Projects.ts
│   │       │   ├── Tickets.ts
│   │       │   ├── Markdown.ts
│   │       │   └── GitHub.ts
│   │       ├── handlers/             # one file per HttpApi group
│   │       │   ├── projects.ts
│   │       │   ├── tickets.ts
│   │       │   └── auth.ts
│   │       └── db/
│   │           ├── schema.ts         # Drizzle schema
│   │           └── migrations/
│   └── frontend/
│       ├── package.json
│       ├── app.config.ts             # TanStack Start config
│       └── src/
│           ├── routes/               # file-based routes
│           │   ├── __root.tsx
│           │   ├── index.tsx
│           │   ├── login.tsx
│           │   ├── projects.index.tsx
│           │   ├── projects.$slug.tsx
│           │   └── projects.$slug.tickets.$id.tsx
│           ├── runtime.ts            # Atom.runtime + Layers
│           ├── atoms/
│           │   ├── auth.ts
│           │   ├── projects.ts
│           │   └── tickets.ts
│           ├── services/
│           │   └── ApiClient.ts      # HttpApiClient.make(AppApi)
│           ├── components/
│           │   ├── Editor.tsx        # Lexical
│           │   ├── TicketTable.tsx   # TanStack Table
│           │   └── ui/               # BaseUI-based primitives
│           └── lib/
└── README.md
```

The `shared/` package is the keystone. The HttpApi defined there is **the contract** — backend implements it, frontend consumes it, OpenAPI spec is derived from it.

---

## Data Model

### What lives in Postgres

Postgres holds only what _has_ to be in a database: identity, sessions, and a thin index for fast project lookup. Everything else is markdown.

**Better Auth tables** (managed by Better Auth migrations):

- `users` — id, email, name, image, createdAt
- `sessions` — sessionToken, userId, expires
- `accounts` — userId, provider="github", providerAccountId, accessToken, refreshToken, etc. (this is where the GitHub OAuth token lives)
- `verification_tokens` — for OAuth state

**Our tables:**

- `project_index` — `(slug PK, owner_id, created_at)` — used to list projects without scanning the filesystem and to enforce slug uniqueness across the system. Members are _not_ in this table; they live in the markdown frontmatter (source of truth).

That's it. No `tickets` table, no `members` table, no `comments` table. Adding a column to a database for new feature data is a smell in this app — markdown is the answer.

### What lives in markdown

```
data/projects/<slug>/project.md
data/projects/<slug>/tickets/<ticket-id>.md
data/projects/<slug>/docs/<...folders>/<doc-slug>.md
```

**`project.md`:**

```markdown
---
slug: design-system
name: Design System Rewrite
owner: github_42 # users.id from postgres
members:
  - { id: github_42, role: owner }
  - { id: github_88, role: admin }
  - { id: github_103, role: member }
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
status: in_progress # todo | in_progress | done
type: feat # feat | bug | chore | other
branch: feat/T-12-add-primary-button # null until branch is created
assignee: github_88 # nullable
createdBy: github_42
createdAt: 2025-11-04T11:30:00Z
updatedAt: 2025-11-04T15:12:00Z
---

# Add primary button component

Description body in markdown. This is what Lexical reads/writes.
Code blocks, lists, tables, the works.
```

Ticket IDs are sequential per project (`T-1`, `T-2`, …). The next-ID counter lives in `project.md` frontmatter or a tiny `_meta.json` next to it — pick whatever feels less ugly when you write the code.

### Why this split

Source of truth is the file. The DB is for things the file _can't_ answer fast: "show me all projects this user is in." We rebuild the index by scanning the filesystem on demand if it ever drifts (a rake-style command in development).

This makes the future "feed it to an AI" goal trivial — point a tool at `data/projects/`, and every piece of structured project context is greppable, parseable, and self-describing.

---

## API Surface

The full HttpApi is defined in `packages/shared/src/api.ts`. Sketch:

```ts
// packages/shared/src/api.ts
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema
} from "@effect/platform"
import { Schema as S } from "effect"
import { Project, Ticket, User } from "./schemas"
import {
  Conflict,
  Forbidden,
  NotFound,
  Unauthorized,
  ValidationError
} from "./errors"

const Auth = HttpApiGroup.make("auth")
  .add(HttpApiEndpoint.get("me", "/me").addSuccess(User).addError(Unauthorized))
  .add(HttpApiEndpoint.post("logout", "/logout").addSuccess(S.Void))

const Projects = HttpApiGroup.make("projects")
  .add(HttpApiEndpoint.get("list", "/projects").addSuccess(S.Array(Project)))
  .add(
    HttpApiEndpoint.post("create", "/projects")
      .setPayload(S.Struct({ name: S.String, slug: S.String }))
      .addSuccess(Project)
      .addError(Conflict)
      .addError(ValidationError)
  )
  .add(
    HttpApiEndpoint.get("get", "/projects/:slug")
      .setPath(S.Struct({ slug: S.String }))
      .addSuccess(Project)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint.patch("update", "/projects/:slug")
      .setPath(S.Struct({ slug: S.String }))
      .setPayload(Project.pipe(S.partial))
      .addSuccess(Project)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint.del("delete", "/projects/:slug")
      .setPath(S.Struct({ slug: S.String }))
      .addSuccess(S.Void)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint.post("addMember", "/projects/:slug/members")
      .setPath(S.Struct({ slug: S.String }))
      .setPayload(
        S.Struct({ userId: S.String, role: S.Literal("admin", "member") })
      )
      .addSuccess(Project)
      .addError(NotFound)
      .addError(Forbidden)
  )

const Tickets = HttpApiGroup.make("tickets")
  .add(
    HttpApiEndpoint.get("list", "/projects/:slug/tickets")
      .setPath(S.Struct({ slug: S.String }))
      .addSuccess(S.Array(Ticket))
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint.post("create", "/projects/:slug/tickets")
      .setPath(S.Struct({ slug: S.String }))
      .setPayload(
        S.Struct({
          title: S.String,
          type: S.Literal("feat", "bug", "chore", "other")
        })
      )
      .addSuccess(Ticket)
      .addError(NotFound)
      .addError(Forbidden)
  )
  // ... get, patch, delete
  .add(
    HttpApiEndpoint.post("createBranch", "/projects/:slug/tickets/:id/branch")
      .setPath(S.Struct({ slug: S.String, id: S.String }))
      .setPayload(
        S.Struct({ branchName: S.String, baseBranch: S.optional(S.String) })
      )
      .addSuccess(Ticket)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(GitHubError)
  )

export const AppApi = HttpApi.make("projectproject")
  .add(Auth)
  .add(Projects)
  .add(Tickets)
```

**Auth endpoints (login, OAuth callback) are handled by Better Auth directly**, not by HttpApi. They're mounted at `/api/auth/*` as a sibling to `/api/*` for the HttpApi. Better Auth sets the session cookie; HttpApi handlers read it via middleware.

---

## Backend Architecture

### Service layers (the Effect way)

Each service is a `Context.Tag` with a `Layer`. The wiring graph for the backend:

```
              ┌─────────────┐
              │   AppLayer  │
              └──────┬──────┘
     ┌───────────────┼─────────────────┐
     │               │                 │
 ProjectsLive   TicketsLive       AuthLive
     │               │                 │
     ├───────────────┤                 │
     │               │                 │
MarkdownLive   GitHubLive         BetterAuthLive
     │               │                 │
     │               │                 │
  DbLive (Drizzle + @effect/sql-pg pool)
```

- **`Db`** — Drizzle client wrapped in a layer. Provides typed queries and transaction support. `Effect.gen(function* () { const db = yield* Db; ... })`.
- **`BetterAuth`** — wraps the Better Auth instance. Exposes `getSession(cookie): Effect<Session | null>` and a method to fetch the GitHub access token for a user.
- **`Auth`** — middleware service. Reads session cookie, returns the current user, fails with `Unauthorized` if absent. Used in HttpApi middleware to gate routes.
- **`Markdown`** — read/write a markdown file with parsed frontmatter. Returns `Effect<{ frontmatter, body }, MarkdownError | NotFound>`. Internally uses `gray-matter` (the standard YAML+markdown parser); you wrap each call in `Effect.tryPromise`.
- **`Projects`** — domain service. `list(userId)`, `get(slug, userId)`, `create(...)`, etc. Each method composes Markdown + Db. Permission checks happen here, not in handlers.
- **`Tickets`** — same shape. Uses Projects internally to verify access.
- **`GitHub`** — wraps Octokit. `createBranch(repo, name, fromSha)`. Takes the user's access token from `Auth`/`BetterAuth`. Errors are tagged: `BranchExists`, `RepoNotFound`, `RateLimited`, `GitHubError`.

### Handler shape

Handlers stay thin — they're plumbing. All logic is in services.

```ts
// packages/backend/src/handlers/projects.ts
import { HttpApiBuilder } from "@effect/platform"
import { Effect } from "effect"
import { AppApi } from "@projectproject/shared"
import { Projects } from "../services/Projects"
import { Auth } from "../services/Auth"

export const ProjectsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "projects",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.gen(function* () {
          const user = yield* Auth.currentUser
          const projects = yield* Projects
          return yield* projects.list(user.id)
        })
      )
      .handle("create", ({ payload }) =>
        Effect.gen(function* () {
          const user = yield* Auth.currentUser
          const projects = yield* Projects
          return yield* projects.create({ ...payload, ownerId: user.id })
        })
      )
      .handle("get", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* Auth.currentUser
          const projects = yield* Projects
          return yield* projects.get(path.slug, user.id)
        })
      )
)
```

The handler has no idea whether the data lives in markdown, postgres, or a sandwich. It just composes services.

### Markdown service in detail

```ts
// packages/backend/src/services/Markdown.ts
export class Markdown extends Context.Tag("Markdown")<
  Markdown,
  {
    readonly read: <A>(
      path: string,
      schema: Schema.Schema<A>
    ) => Effect.Effect<
      { frontmatter: A; body: string },
      MarkdownError | NotFound
    >
    readonly write: <A>(
      path: string,
      schema: Schema.Schema<A>,
      data: { frontmatter: A; body: string }
    ) => Effect.Effect<void, MarkdownError>
    readonly listDir: (
      path: string
    ) => Effect.Effect<readonly string[], MarkdownError | NotFound>
    readonly remove: (path: string) => Effect.Effect<void, MarkdownError>
  }
>() {}
```

Crucially, `read`/`write` take a Schema for the frontmatter. The frontmatter is parsed YAML, then run through `Schema.decodeUnknown(schema)`. So if a markdown file is malformed or missing required fields, you get a typed `MarkdownError` you can recover from — not a runtime crash deep in the handler.

This is the kind of place where Effect's typed errors really earn their keep.

### Permission model

Three roles: `owner`, `admin`, `member`. Stored in `project.md`'s `members` frontmatter.

| Action              | owner | admin | member |
| ------------------- | ----- | ----- | ------ |
| Read project        | ✓     | ✓     | ✓      |
| Read/write tickets  | ✓     | ✓     | ✓      |
| Add/remove members  | ✓     | ✓     | –      |
| Change roles        | ✓     | –     | –      |
| Delete project      | ✓     | –     | –      |
| Connect GitHub repo | ✓     | ✓     | –      |

The permission check is a single function per action, called at the top of every Projects/Tickets service method. Returns `Forbidden` as a tagged error. Don't try to be clever about caching this — read the project markdown, check, done.

---

## Frontend Architecture

### The runtime + atoms (recap)

```ts
// frontend/src/runtime.ts
import { Layer } from "effect"
import { Atom } from "@effect-atom/atom-react"
import { ApiClient } from "./services/ApiClient"

export const AppLayer = Layer.mergeAll(ApiClient.Default)
export const runtime = Atom.runtime(AppLayer)
```

```ts
// frontend/src/services/ApiClient.ts
import { FetchHttpClient, HttpApiClient } from "@effect/platform"
import { AppApi } from "@projectproject/shared"
import { Effect } from "effect"

export class ApiClient extends Effect.Service<ApiClient>()("ApiClient", {
  effect: HttpApiClient.make(AppApi, { baseUrl: "/api" }),
  dependencies: [FetchHttpClient.layer]
}) {}
```

> **Note (updated):** the original draft of this spec used `Context.Tag` + `Layer.effect` here with `HttpApiClient.Client<typeof AppApi>` as the service shape. That stopped compiling once `HttpApiClient.Client` started taking three type parameters. `Effect.Service` infers the shape from the `effect:` field, so the rename is the whole fix. We still use `Context.Tag` for our own services (`Markdown`, `Projects`, `Tickets`) where the shape is hand-written.

That's it for the codegen story — `HttpApiClient.make(AppApi)` reads the shared definition and gives you a fully typed client. `client.projects.get({ path: { slug } })` is autocompleted, payload-checked, and returns `Effect<Project, NotFound | Forbidden | ...>`.

### Atom families = query keys

```ts
// frontend/src/atoms/projects.ts
import { Atom } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "../runtime"
import { ApiClient } from "../services/ApiClient"

export const projectsListAtom = runtime
  .atom(
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.projects.list()
    })
  )
  .pipe(Atom.setIdleTTL("1 minute"))

export const projectAtom = runtime.family((slug: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.projects.get({ path: { slug } })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
)

export const createProjectAtom = runtime.fn(
  Effect.fn(function* (input: { name: string; slug: string }, get) {
    const client = yield* ApiClient
    const project = yield* client.projects.create({ payload: input })
    get.refresh(projectsListAtom)
    return project
  })
)
```

### Routes

TanStack Start in SPA mode, file-based routing. The auth gate is a route-tree concern — wrap protected routes in a layout that reads `meAtom` and redirects to `/login` if missing.

```tsx
// frontend/src/routes/_authed.tsx
export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context }) => {
    const me = await context.registry.get(meAtom)
    if (Result.isFailure(me)) throw redirect({ to: "/login" })
  },
  component: () => <Outlet />
})
```

All authenticated routes nest under `/_authed`. Login route is outside.

### UI composition

- **BaseUI** for primitives — Dialog, Popover, Select, Menu, Tooltip. You write the styles. Pair with Tailwind or CSS Modules; Tailwind is faster to iterate on for a learning project.
- **Lexical** for the description editor. Configure with the markdown plugin: it reads markdown on mount, serializes to markdown on change, debounce-saves via the `tickets.update` endpoint. There's a learning curve — Lexical is more raw than Tiptap. Worth it for the control.
- **TanStack Table** for the ticket list per project. Columns: ID, title, type, status, assignee, branch. Filter by status, sort by created/updated. Don't add features it doesn't need yet.

---

## Auth Flow

Better Auth handles every piece of this; we just configure it.

1. User clicks "Login with GitHub" → frontend hits `/api/auth/sign-in/github`
2. Better Auth redirects to GitHub OAuth consent
3. GitHub redirects back to `/api/auth/callback/github`
4. Better Auth exchanges code for token, creates user + account + session, sets the session cookie
5. Frontend redirects to `/projects`
6. Every subsequent request carries the session cookie
7. Backend middleware reads cookie via `BetterAuth.getSession`, attaches `currentUser` to the Effect context

When the backend needs the user's GitHub token (for branch creation), it calls `BetterAuth.getAccessToken(userId, "github")`. Better Auth handles refresh-on-expiry.

**Better Auth config sketch:**

```ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: ["read:user", "user:email", "repo"] // repo scope = branch creation
    }
  },
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } }
})
```

Wrapping it in an Effect layer is straightforward — `Layer.sync(BetterAuth, () => auth)` plus a few helper methods.

---

## GitHub Integration

### What it does

1. Project owner connects a repo: pastes `owner/repo` (or picks from a list). We verify the user has push access via Octokit.
2. User opens a ticket → "Create branch" button.
3. Modal opens with suggested branch name: `{type}/{id}-{slug-of-title}`. Type defaults to ticket type. User can override the whole name.
4. Choose base branch (default: repo default branch).
5. We call Octokit `git.createRef`, save the branch name back to the ticket markdown's `branch` field.
6. UI shows the branch name with a link to GitHub.

### Service shape

```ts
export class GitHub extends Context.Tag("GitHub")<
  GitHub,
  {
    readonly verifyAccess: (
      repo: { owner: string; name: string },
      userId: string
    ) => Effect.Effect<void, RepoNotFound | InsufficientScope>

    readonly createBranch: (
      repo: { owner: string; name: string },
      branchName: string,
      baseBranch: string | null, // null = repo default
      userId: string
    ) => Effect.Effect<
      { name: string; sha: string },
      BranchExists | RepoNotFound | GitHubError
    >

    readonly listBranches: (
      repo: { owner: string; name: string },
      userId: string
    ) => Effect.Effect<readonly string[], RepoNotFound | GitHubError>
  }
>() {}
```

Internally each method fetches the user's token from Better Auth, constructs an Octokit instance, calls the API, maps errors to tagged classes.

### Branch name suggestion logic

```
{type}/{id}-{slug}
```

- `{type}` defaults to ticket type, user can change in modal: `feat | bug | chore | other`
- `{id}` is the ticket id (`T-12`)
- `{slug}` is `slugify(title)` truncated to ~30 chars

Stored in `project.md`'s `branchTemplate` so projects can override the convention. PoC supports the default template only; making it configurable is a stretch goal.

---

## Documentation

A project has a **Documentation** tab alongside Tickets and Members. This is where long-form, durable knowledge about the project lives — architecture notes, runbooks, ADRs, onboarding docs, anything that isn't a ticket. Same philosophy as everywhere else in this app: **markdown files on disk, frontmatter is metadata, the filesystem is the index.**

### What it is (and isn't)

- It **is** a place for living docs that are scoped to a project. You write them in the same Lexical-with-markdown editor as ticket descriptions, organize them into folders, tag them, link between them.
- It **isn't** a wiki, a CMS, or a replacement for in-repo `docs/` directories of the project's actual code. Those have their own home. This is for the _project management_ artifacts — meeting notes, decisions, briefs — that belong with the tickets.
- It **isn't** versioned beyond what git on `data/projects/` already gives you. No revision history UI in the PoC.

### Storage

```
data/projects/<slug>/docs/
├── _meta.json                     # tag definitions, optional folder ordering
├── architecture/
│   ├── overview.md
│   └── auth-flow.md
├── decisions/
│   ├── 0001-effect-vs-fp-ts.md
│   └── 0002-markdown-storage.md
└── onboarding.md
```

- Folders are real filesystem folders. Nest as deep as you want.
- File name = doc slug. URL-safe, derived from the title on create, editable later.
- One doc per file. No multi-doc files.

**Doc frontmatter:**

```markdown
---
slug: auth-flow
title: Auth Flow
tags: [auth, architecture, github-oauth]
createdBy: github_42
createdAt: 2026-04-12T10:00:00Z
updatedAt: 2026-04-30T14:33:00Z
---

# Auth Flow

Body in markdown. Lexical reads/writes it just like ticket descriptions.
```

### Tags

Tags are project-scoped strings. The set of known tags lives in `docs/_meta.json`:

```json
{
  "tags": [
    { "name": "architecture", "color": "#7c3aed" },
    { "name": "auth", "color": "#0ea5e9" },
    { "name": "github-oauth", "color": "#22c55e" }
  ]
}
```

Frontmatter `tags` is the source of truth for which docs carry which tag; `_meta.json` adds presentation (color) and a canonical list. A doc can carry tags that aren't in `_meta.json` — they render in a neutral color until someone defines them. No hard validation.

### Permissions

Same model as the rest of the project. Read: any member. Write/create/delete/move: any member. Tag definitions in `_meta.json`: owner/admin only (so ad-hoc tag spam doesn't pollute the canonical list, but ad-hoc _use_ is fine).

### UI

- Tab on the project page: **Documentation**.
- Left side: tree view of folders + docs. Drag-and-drop to move (no dialog — drop target is the destination folder).
- Filter row above the tree: tag chips (multi-select), search input (full-text against titles + body, debounced).
- Right side: the open doc, with the Lexical editor.
- Create: inline "+ doc" / "+ folder" affordances at any folder level. New doc opens directly in the editor with title pre-focused.
- Tag editing: inline tag chips below the doc title. Type to add (autocompletes against `_meta.json`), backspace to remove. No dialog.

### Service shape

`Docs` service alongside `Projects` and `Tickets`:

```ts
list(slug, userId)                     → Effect<DocTree, NotFound | Forbidden>
get(slug, path, userId)                → Effect<Doc, NotFound | Forbidden>
create(slug, path, input, userId)      → Effect<Doc, Conflict | Forbidden>
update(slug, path, patch, userId)      → Effect<Doc, NotFound | Forbidden>
move(slug, fromPath, toPath, userId)   → Effect<Doc, NotFound | Conflict | Forbidden>
remove(slug, path, userId)             → Effect<void, NotFound | Forbidden>
listTags(slug, userId)                 → Effect<readonly Tag[], NotFound | Forbidden>
upsertTag(slug, tag, userId)           → Effect<Tag, Forbidden>
removeTag(slug, name, userId)          → Effect<void, Forbidden>
search(slug, query, userId)            → Effect<readonly DocHit[], NotFound | Forbidden>
```

Search is `grep`-grade for the PoC: walk the docs tree, match title/body/tags, return hits with snippets. SQLite FTS is the obvious upgrade once it stops being snappy.

### Why this earns its keep

Two reasons. First, projects accumulate context that doesn't fit on a ticket — the _why_ behind the work — and Slack/Notion is where that context goes to die. Putting it next to the tickets, in the same markdown tree, makes it greppable, AI-readable (see MCP below), and survives tool churn. Second, the same markdown-on-disk pattern from tickets pays off: nothing new to learn, the data is portable, and `cd data/projects/<slug>/docs && grep -ri foo` Just Works.

---

## MCP Server

ProjectProject exposes its project context through a built-in **MCP (Model Context Protocol) server**, so AI agents — Claude Code, Cursor, custom agents — can read project state directly without scraping the UI or writing custom integrations.

This is the payoff of the markdown-first data model. Project state is already plain files; the MCP server is a thin protocol shim on top.

### What the MCP server is

- A second listener on the backend process, speaking MCP over stdio (for desktop agent integrations like Claude Code) and over HTTP (for hosted agents). Same Effect runtime, same services as the HTTP API.
- Authenticated. Each MCP client carries a project-scoped token issued from the user's session. The token grants the same access the user has in the web UI — no superuser MCP path.
- Read-mostly in v1. Write tools (create ticket, append doc) come in a second pass; the v1 surface is read tools so AI agents can gather context without unilaterally mutating state.

### Transport

Two modes:

1. **stdio** — for users running an agent locally that can spawn the MCP server as a subprocess. The server reads a long-lived API token from `MARKMATE_MCP_TOKEN` env var, validates it against the same Better Auth session table, then serves MCP over stdin/stdout. This is how Claude Code, Cursor, and similar tools consume MCP.
2. **HTTP / SSE** — same MCP shape served over HTTP at `/mcp/*`, for agents running off-host. Protected by the same session cookie or a bearer token.

The server itself is one Effect program; the transport is a layer choice.

### Tool surface (v1, read-only)

Each tool is a typed Effect program returning Schema-validated output.

- `list_projects()` — projects the authed user is a member of.
- `get_project(slug)` — full `project.md` (frontmatter + body) plus members, GitHub connection state, tag list.
- `list_tickets(slug, filter?)` — tickets in a project, optionally filtered by status, type, assignee, branch presence, has-PR.
- `get_ticket(slug, id)` — full ticket frontmatter + body + current git state (branch, PR number, PR status).
- `search_tickets(slug, query)` — full-text search, returns ticket IDs + snippets.
- `list_docs(slug, folder?)` — doc tree under a folder (or root). Returns titles, paths, tags.
- `get_doc(slug, path)` — full doc (frontmatter + body).
- `search_docs(slug, query, tags?)` — full-text + tag search across docs.
- `git_state(slug)` — current branch + PR state per ticket, same payload as the web `gitStates` endpoint.
- `me()` — the authed user's identity, role per project.

### Resources

In addition to tools, the server exposes **resources** — addressable URIs the agent can read directly:

- `markmate://projects/<slug>/project.md`
- `markmate://projects/<slug>/tickets/<id>.md`
- `markmate://projects/<slug>/docs/<path>.md`

These are the underlying markdown files, served verbatim. Agents that prefer to "open a file" rather than "call a tool" get a natural fit. This is also the cheapest way for an agent to slurp a whole project's context (`list_resources` then bulk-read).

### Architecture

```
Backend process
├── HTTP listener  (existing, /api/*)
├── MCP listener   (new, stdio | /mcp/*)
└── Same service layers (Projects, Tickets, Docs, GitHub, Markdown, Db, Auth)
```

The MCP listener is a thin layer that:

1. Authenticates the request → resolves a `currentUser`.
2. Routes the MCP method to a tool implementation that calls into the existing services.
3. Maps tagged errors (`NotFound`, `Forbidden`, etc.) to MCP error responses with the same taxonomy as the HTTP API.

No duplication of business logic. The MCP tool for `list_tickets` is a one-liner that calls `Tickets.list(slug, currentUser.id)`.

### Why bother

Two things this unlocks:

1. **Agent-driven workflows.** "Look at the open in_progress tickets in `design-system`, summarize what's blocked, and draft a status update." With MCP, an agent does this in one prompt without you copy-pasting anything into context.
2. **Context-on-tap during coding.** When you ask Claude Code to "implement T-12", it can pull the ticket, the project's architecture docs, and the latest decisions doc into context automatically. The bridge between PM tooling and coding tooling stops being a copy-paste loop.

### v1 boundaries

- **Read-only tools.** No `create_ticket`, no `update_doc` yet. AI agents propose changes via the chat UI of their host; the human applies them through ProjectProject's regular UI. We add write tools after the read surface settles.
- **No streaming.** Tools return full payloads. Streaming is meaningful for long search results; not yet.
- **Project-scoped, not workspace-scoped.** Each MCP session targets the projects the user is a member of; there's no cross-tenant view. (Won't matter for a homelab single-user install; matters if this ever multi-tenants.)

---

## Testing Strategy

One representative test per layer; AI-generated coverage on top after the patterns are established.

### Service tests (backend)

`@effect/vitest` lets you `it.effect("...", () => Effect.gen(...))` and provide a test layer with mocks for unrelated services. This is the canonical "Effect testing" pattern and you should write at least three of these by hand to internalize it.

```ts
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Projects } from "../services/Projects"
import { Markdown } from "../services/Markdown"

const FakeMarkdown = Layer.succeed(Markdown, {
  read: () =>
    Effect.succeed({
      frontmatter: {
        /* ... */
      },
      body: ""
    }),
  write: () => Effect.succeed(undefined),
  listDir: () => Effect.succeed(["design-system"]),
  remove: () => Effect.succeed(undefined)
})

it.effect("Projects.list returns only projects user is a member of", () =>
  Effect.gen(function* () {
    const projects = yield* Projects
    const result = yield* projects.list("user-1")
    expect(result).toHaveLength(1)
  }).pipe(Effect.provide(Layer.merge(ProjectsLive, FakeMarkdown)))
)
```

### Repository tests

Spin up a real Postgres in a container (`testcontainers` package, or a docker-compose `test` service). Don't mock the DB — Drizzle's behavior is part of what you're testing.

### API integration tests

Mount the full HttpApi against an in-process server, hit it with `HttpApiClient.make(AppApi)`. Same client your frontend uses, same types, no test-specific HTTP setup.

### Frontend tests

Vitest + React Testing Library. Atoms get a test runtime with mocked `ApiClient` layer. Render a component, assert it renders the loading/success/error states correctly.

```tsx
const TestApiLayer = Layer.succeed(ApiClient, {
  projects: { list: () => Effect.succeed([fakeProject]) /* ... */ }
} as any)

const testRuntime = Atom.runtime(TestApiLayer)
// re-create atoms against testRuntime, render, assert
```

---

## Deployment

Single `docker-compose.yml`, runs on the homelab.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: projectproject
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: projectproject
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "projectproject"]

  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
    environment:
      DATABASE_URL: postgres://projectproject:${POSTGRES_PASSWORD}@postgres:5432/projectproject
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      BASE_URL: ${BASE_URL}
    volumes:
      - ${MARKMATE_DATA_DIR}:/app/data # bind mount, host-accessible
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

The `app` container runs Bun and serves both the backend (HttpApi at `/api`) and the built frontend static files (everything else). One container, one process. If you have Caddy or Traefik already running on the homelab, put it behind that for HTTPS; otherwise expose `:3000` directly on your LAN.

The `${MARKMATE_DATA_DIR}` is set in `.env` to a host path like `/srv/projectproject/data` — you can `cd` in, edit, grep, point AI tools at it.

The actual production stack ships in `docker-compose.prod.yml` and the
`docker/Dockerfile.{backend,frontend}` images, with auto-redeploy via
GitHub Actions → ghcr.io → Watchtower on a Proxmox VM. End-to-end setup
steps live in `docs/deploy.md`.

### Dockerfile sketch

Multi-stage: build frontend with Bun, build backend with Bun, copy both into a slim runtime image. Alpine-based bun image (`oven/bun:1-alpine`) is ~80MB.

---

## Implementation Roadmap

Build it in vertical slices, not horizontal layers. Each phase ends with something demoable.

### Phase 0 — Skeleton (1 evening)

- Bun workspaces set up
- `shared/` exports `AppApi` with one trivial endpoint (`GET /health`)
- `backend/` runs an HttpApi server implementing it
- `frontend/` runs TanStack Start, calls the endpoint via `HttpApiClient.make(AppApi)`
- Render the response on the index page
- Docker compose starts both
- **You've now seen the full Effect ↔ TanStack Start loop work end-to-end.** This is the moment that tells you the stack is real.

### Phase 1 — Auth (1–2 evenings)

- Postgres in compose, Drizzle migrations for Better Auth tables
- Better Auth wired up, GitHub OAuth app created
- `/me` HttpApi endpoint reading session
- `meAtom`, `_authed` route layout, login button
- Logout

### Phase 2 — Projects CRUD (1–2 evenings)

- Markdown service with Schema-validated frontmatter
- Projects service: list, get, create, delete
- Project list page, create-project dialog (BaseUI), project detail page

### Phase 3 — Tickets CRUD (1–2 evenings)

- Tickets service
- Ticket list per project (TanStack Table)
- Ticket detail page (no editor yet, just textarea)
- Status changes, assignment

### Phase 4 — Lexical editor (1 evening)

- Replace ticket description textarea with Lexical
- Markdown read on mount, markdown serialize on change, debounced save
- This will be its own minor rabbit hole — Lexical configuration takes some patience

### Phase 5 — Git connection (2–3 evenings)

- `GitHub` service with Octokit + a single GraphQL roundtrip for project-wide ticket states
- Connect repo via picker in the project header chip (no settings page; inline)
- Inline create-branch on tickets (no dialog), pre-filled from `branchTemplate`
- Inline open-PR on tickets, draft toggle
- Live branch + PR state column in the ticket list, status panel on ticket detail
- Auto-transition ticket `status: done` on PR merge, idempotent via `lastTransitionedPr`
- Tagged error taxonomy (`GitHubTokenExpired`, `RepoGone`, `BranchExists`, etc.) wired to inline UX

Detailed design: `docs/superpowers/specs/2026-05-03-git-connection-design.md`.

### Phase 6 — Members & permissions (1 evening)

- Add/remove members, role changes
- Permission checks in services
- Member list UI on project page

### Phase 7 — Documentation tab (2 evenings)

- `Docs` service: list/get/create/update/move/remove + tag CRUD + search
- Docs storage at `data/projects/<slug>/docs/**`, `_meta.json` for tag definitions
- Tab in the project page with folder tree + tag-filtered list + Lexical editor
- Drag-and-drop folder moves, inline tag editing, inline create

### Phase 8 — MCP server (1–2 evenings)

- MCP listener as a sibling transport to the HTTP API, sharing the Effect runtime and service layers
- stdio transport (token via `MARKMATE_MCP_TOKEN`) and HTTP transport at `/mcp/*`
- Read-only tool surface (`list_projects`, `get_project`, `list_tickets`, `get_ticket`, `search_tickets`, `list_docs`, `get_doc`, `search_docs`, `git_state`, `me`)
- Resource URIs (`markmate://...`) mapped to the markdown files

### Phase 9 — Polish (ongoing)

- OpenAPI spec served at `/api/openapi.json` via `OpenApi.fromApi(AppApi)`
- Swagger UI at `/api/docs` (Effect's `HttpApiSwagger` package or just a static Swagger UI page pointed at the JSON)
- Better error UI (one component per tagged error)
- Tests for the bits you didn't write tests for in earlier phases

---

## Things to Watch Out For

A few specific gotchas I want you to expect, so you don't waste a Saturday on them:

- **Better Auth + Effect interop.** Better Auth is Promise-based; you'll wrap most calls in `Effect.tryPromise`. Don't try to make Better Auth itself "Effect-native" — it's not worth it. The seam is clean.
- **HttpApi error type alignment.** When you `addError(NotFound)`, the tagged error class needs to be a `Schema.Class` or it won't serialize correctly across the wire. Use `Schema.TaggedError` for shared errors, not `Data.TaggedError` — they're different. (Internal-only errors that never cross the wire can stay as `Data.TaggedError`.)
- **`@effect-atom/atom-react` rename.** If you find blog posts using `@effect-rx/rx-react`, it's the same library, renamed in August 2025. The mental model is identical, just update imports.
- **Lexical and markdown.** Lexical's markdown support exists but isn't the default — you'll add `@lexical/markdown` and configure import/export transforms. Budget an evening just for this.
- **TanStack Start SPA mode.** The config flag is `ssr: false` in `app.config.ts`. Routes still need to use `createFileRoute`, but `loader` functions run on the client.
- **GitHub API rate limits.** OAuth tokens get 5,000 requests/hour. For a PoC this is plenty, but log rate limit headers from Octokit responses early so you can spot if anything's looping.
- **Markdown frontmatter and dates.** `gray-matter` parses YAML, which has quirky date handling (some YAML parsers parse ISO dates as Date objects, some as strings). Decide on one convention (ISO strings) and enforce it via your Schema.

---

## Open Questions for Later

Things deliberately out of scope for the PoC, but worth thinking about so the data model doesn't paint you into a corner:

- **Comments on tickets.** Probably a `comments/` directory next to each ticket, one file per comment.
- **File attachments.** Where do they live? Likely outside the markdown tree, maybe in `data/attachments/<ticket-id>/`.
- **Search.** When `find data/projects -name '*.md' | xargs grep` stops being enough, the answer is probably a SQLite FTS index rebuilt nightly, not Postgres.
- **Real-time updates.** If two members are looking at the same ticket, do edits stream? Effect's `Stream` + SSE is the natural fit, but it's a Phase 8+ concern.
- **Mobile.** TanStack Start can build a real SPA, so it's responsive-by-default, but a real mobile experience is a different design pass.

---

## What This Project Will Teach You

By the time Phase 6 is done, you'll have hands-on experience with:

- `Effect.gen` and the runtime model
- `Layer` composition and dependency injection
- Tagged errors as a discipline (you will _feel_ the compiler force you to handle them)
- Schema as the boundary between trusted and untrusted data
- `@effect/platform` HttpApi as the contract-first server pattern
- Atoms as a cache model that is genuinely different from query keys
- The "shared HttpApi → derived client + spec" workflow
- Effect-friendly testing with `@effect/vitest` and layer mocks
- Where Effect feels great, and where it feels like extra ceremony

That last one matters most. The honest answer to "is Effect worth it for production?" is something only you can answer after living in a real codebase for a few weeks. This project is calibrated to give you that answer.

Have fun.
