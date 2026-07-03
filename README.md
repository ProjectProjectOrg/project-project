# ProjectProject

A markdown-first project management tool, built as a vehicle for learning Effect deeply.

The full spec lives in [`docs/PROJECTPROJECT.md`](docs/PROJECTPROJECT.md). The chapter-by-chapter learning material lives in [`docs/chapters/`](docs/chapters/). The teaching workflow that governs how this repo evolves lives in [`CLAUDE.md`](CLAUDE.md).

## Layout

```
projectproject/
├── package.json              # Bun workspaces root
├── tsconfig.base.json        # Shared compiler options
├── docs/
│   ├── PROJECTPROJECT.md     # The spec
│   └── chapters/             # Learning material + exercises
├── packages/
│   ├── shared/               # HttpApi contract + Schemas + tagged errors
│   ├── backend/              # HttpApi server, services, db
│   └── frontend/             # React SPA, atoms, routes
└── data/                     # Markdown source of truth (gitignored)
```

## Prerequisites

- [Bun](https://bun.sh) — runtime, package manager, and workspaces driver
- Postgres (later chapters; not required for Chapter 0)

## Getting started

```bash
bun install
```

Per-chapter instructions live in `docs/chapters/`. Start with chapter 0.

## Bootstrapping a fresh instance

ProjectProject is **invite-only**. There is no public "first user creates the
org" flow, and org creation stays gated (`allowUserToCreateOrganization: false`
in `packages/backend/src/auth.ts`). A fresh instance is seeded once, then grows
by invitation.

1. **Seed the first org + owner.** Set the `BOOTSTRAP_*` values in `.env` (see
   [`.env.example`](.env.example) — org slug/name and the owner's email, name,
   and optional username), then run the seeding script:

   ```bash
   bun --filter @projectproject/backend run bootstrap:org
   ```

   It creates the organization, the owner identity, and their `owner`
   membership. The command is repeat-safe: re-running reports the existing
   records instead of creating duplicates. Use the same email the owner will
   sign in with (magic link or Google).

2. **Owner signs in and invites the team.** The owner signs in with the
   configured email, opens org settings → members, and invites teammates by
   email.

3. **Invited users land from their invite.** Each invitation produces a link
   (`/invite/<invitationId>`, logged by `sendInvitationEmail`). Opening it
   sends a signed-out user through login (with the invite preserved) and then
   drops them on a focused accept screen; accepting sets the invited org active
   and lands them inside it. Signed-in users can also review every pending
   invitation at `/welcome`. Invites match on email, so members sign in with the
   address they were invited under.

For production and Docker specifics (running the seed inside the container,
migrations, reverse proxy) see [`docs/deploy.md`](docs/deploy.md).

## Conventions

- **Effect v3 stable.** All Effect code targets v3; `Schema` is imported from `effect`.
- **The shared package is the contract.** Endpoints declared in `packages/shared/src/api.ts` drive both the backend implementation and the frontend's typed client.
- **Markdown is the source of truth.** Postgres holds only auth + a thin project index; everything else lives under `data/projects/`.
