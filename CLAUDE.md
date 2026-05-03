# CLAUDE.md — ProjectProject

## Project context

This repo builds **ProjectProject**, a markdown-first project management tool described in `docs/PROJECTPROJECT.md`. **Read that file first** before any non-trivial response — it is the spec we're building toward.

The project started as a structured Effect-learning curriculum (chapter-by-chapter exercises in `docs/chapters/`). Wouter has now absorbed enough Effect to shift to a **normal collaborative implementation workflow**. The chapter docs stay in the repo for reference, but the chapter-viewer app is gone and we no longer follow the stub-and-exercise pattern.

## Wouter

TypeScript engineer, frontend background, comfortable with Effect v3 fundamentals (Layers, scopes, tagged errors, `Effect.gen`, `HttpApi`, `@effect-rx`). Works in a real engineering setting most of the time and is fine pair-programming with AI. Treat him as a peer, not a student — but he's still building Effect intuition, so flag non-obvious choices when you make them.

## How we work

We implement the app together. You can write working code anywhere in the repo (`backend/`, `frontend/`, `shared/`). The split is collaborative:

- **You implement** — services, handlers, atoms, components, schemas. Working code is the norm.
- **Wouter reviews and steers** — he decides direction; you propose and execute.
- **Comment where it teaches** — when a file uses an Effect pattern that isn't immediately obvious (a tricky Layer composition, a scope decision, a non-trivial HttpApi shape), drop a short comment explaining why. Skip the comment when the code speaks for itself. No multi-paragraph docstrings.

### No architectural decisions without asking

This is the firm rule. **Do not make architectural decisions unilaterally.** That includes:

- Picking libraries (state mgmt, routing, validation, styling, ORM additions, etc.).
- Adding new packages to the workspace or new top-level modules.
- Choosing data-flow patterns (where state lives, how a feature is sliced, sync vs async boundaries).
- Naming conventions for shared concepts (route layouts, atom families, service tags).
- API surface decisions on `packages/shared` (endpoint shape, error taxonomy, schema modeling).

When you hit one of these, **stop and ask**. Present the options with tradeoffs; let Wouter pick. Implementation details inside an already-agreed shape are fine to just do.

### Tone

- Short, direct, peer-level. No teaching voice unless he asks for one.
- Show the why before the what when something is non-obvious.
- Name gotchas inline (the spec lists several — `Schema.TaggedError` vs `Data.TaggedError`, the `@effect-rx` rename, gray-matter date quirks).
- No emoji unless asked.

## Frontend stack

- **TanStack Start + TanStack Router** as already wired up.
- **`@effect-rx/rx-react`** for Effect-aware state (`Atom.runtime`, atom families, etc.).
- **shadcn/ui (Radix-backed)** as the component foundation. Install via the shadcn CLI.
- **Fluid Functionalism components** from <https://www.fluidfunctionalism.com>, installed through the shadcn registry (`npx shadcn@latest registry add @fluid`). Also Radix-backed, so they coexist cleanly with shadcn defaults. Prefer these where they exist for richer motion-aware primitives before reaching for something custom.
- Don't add other UI libraries (Headless UI, Mantine, Chakra, etc.) without asking — see the architecture rule above.

## Backend stack

Effect HttpApi + Drizzle + Better Auth + Postgres, as set up in chapters 0–2. Extend within those choices unless we explicitly revisit them.

## Repo orientation

- **Spec / source of truth:** `docs/PROJECTPROJECT.md`
- **Reference material:** `docs/chapters/` — chapter docs and walk-throughs from the learning phase. Read-only context; we don't add new chapters.
- **Code:**
  - `packages/backend` — Effect HTTP server.
  - `packages/frontend` — TanStack Start app.
  - `packages/shared` — HttpApi definition, schemas, tagged errors. The typed seam between ends.

The `packages/chapters-viewer` workspace has been removed.

## What you may freely do

- Read any file in the repo.
- Run `git status` / `git diff` / `git log`.
- Run `bun install`, `bun test`, type-checks, lint, format.
- Write working code in any package.
- Add small implementation comments where they earn their keep.

## What requires asking first

- Architectural decisions (see list above).
- Installing new dependencies that aren't already implied by the current task.
- Destructive git operations.
- Touching `docs/PROJECTPROJECT.md` or `docs/chapters/` content.

## When in doubt

Re-read the relevant section of `docs/PROJECTPROJECT.md`, then ask. Cheaper to confirm than to redo.
