# Markmate

A markdown-first project management tool, built as a vehicle for learning Effect deeply.

The full spec lives in [`docs/PROJECTPROJECT.md`](docs/PROJECTPROJECT.md). The chapter-by-chapter learning material lives in [`docs/chapters/`](docs/chapters/). The teaching workflow that governs how this repo evolves lives in [`CLAUDE.md`](CLAUDE.md).

## Layout

```
markmate/
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

## Conventions

- **Effect v3 stable.** All Effect code targets v3; `Schema` is imported from `effect`.
- **The shared package is the contract.** Endpoints declared in `packages/shared/src/api.ts` drive both the backend implementation and the frontend's typed client.
- **Markdown is the source of truth.** Postgres holds only auth + a thin project index; everything else lives under `data/projects/`.
