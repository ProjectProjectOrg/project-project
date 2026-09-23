# T-172 main layout integration plan

> **For agentic workers:** Use `superpowers:executing-plans` for this integration. Track each checkbox in order.

**Goal:** Move the completed Jira migration into the feature boundaries introduced on `main`, preserve its behavior, and make PR #235 reviewable against current `main`.

**Architecture:** `packages/shared` owns the HTTP contract and Jira schemas; `packages/db` owns Jira tables, migrations, and visibility predicates. `packages/server-core/src/jira` owns Jira client, credentials, scan, import, projection, workflow logic, cleanup, and retention. `apps/backend` owns HTTP handlers, OAuth routes, Bun workflow registration, runtime composition, and the loopback browser harness. `apps/frontend/src/features/jira` owns migration atoms, polling, form, and UI; the router and translations stay in their established app locations. Dependencies point inward: app to server-core to db/shared. No server-core import points to an app.

**Tech stack:** Bun, Effect v4 rc.112, Drizzle, Postgres, TanStack Start/Form, Effect Atom, existing Vitest tooling.

**Spec:** `docs/superpowers/specs/2026-09-22-t172-effect-jira-migration-design.md`; the approved port boundary is Wouter's 2026-09-23 direction to follow current `main` strictly.

## Global constraints

- Do not change Jira migration behavior to settle a relocation conflict.
- Preserve the successful public browser import, cancellation, retry, restricted-content, and attachment-replacement behavior.
- Keep the known Effect rc.112 early-Retry wakeup failure visible and documented; Wouter deferred that fix.
- Use `@pp/*` workspace imports and the current `main` package scripts. Add no dependency unless an existing Jira import demonstrably requires it.
- Keep the existing isolated browser database and bucket separate from test resources.
- Do not alter the unrelated main checkout or its uncommitted work.

## Review focus

- Jira services must be included in the production layer and both HTTP handler groups; a compiling but unreachable feature is a failed port.
- `project_index` visibility guards and imported-comment attribution must survive the main merge.
- OAuth state, PKCE, and credential refresh must keep working after service relocation.
- Workflow restart, cleanup fencing, and attachment outcomes must still use the same durable database and storage services.
- The frontend's optimistic mutation and polling atoms must read and write through the same wrapper after moving into the Jira feature directory.

## Task 1: Merge main and preserve shared behavior

**Files:** `AGENTS.md`, `packages/shared/src/api.ts`, `packages/db/src/schema.ts`, moved cross-domain files in `packages/server-core/src`, `apps/backend/src/auth.ts`, `apps/backend/src/main.ts`, frontend primitives and comment editor files.

- [ ] Fetch the current GitHub `main` ref and merge it into the isolated Jira branch without force or reset.
- [ ] Resolve each shared-file conflict against the new location, retaining Jira endpoints, schema fields, attachment helpers, imported-comment attribution, and hidden-project visibility guards.
- [ ] Move Jira migrations to `packages/db/src/migrations` and the visibility helper to `packages/db/src/projectVisibility.ts`; update db package exports only where consumers need the helper.
- [ ] Run `git diff --check`, search for conflict markers, and inspect the staged diff against both merge parents before committing the merge.

## Task 2: Move backend Jira code into the new package boundaries

**Files:** `packages/backend/src/Jira/*` → `packages/server-core/src/jira/*` and `apps/backend/src/jira/*`; `packages/backend/src/runtime.ts` → `apps/backend/src/runtime.ts`; `packages/backend/scripts/jira-browser-harness.ts` → `apps/backend/scripts/jira-browser-harness.ts`.

- [ ] Keep HTTP handler and OAuth route modules in `apps/backend/src/jira`; import their services from `@pp/server-core/jira/*`.
- [ ] Keep `WorkflowRuntime.ts` in the backend app because it installs Bun crypto and the SQL runner; move domain activities, projection, scans, import, cleanup, and retention to server-core.
- [ ] Move the browser fixture and harness guard into backend app test support, updating their imports to the new domain modules.
- [ ] Replace old `../Services/*`, `../Layers/*`, `../db/*`, and `@projectproject/shared` imports with the corresponding `@pp/server-core/*`, `@pp/db`, and `@pp/shared` paths.
- [ ] Rebuild `makeBackendServicesLive` and `makeBackendHttpServicesLive` around main's runtime graph so fixture injection and production registration both retain the Jira layers.
- [ ] Run the backend, server-core, db, and shared typechecks and focused Jira tests; fix relocation errors before changing behavior.

## Task 3: Move the Jira UI into its feature folder

**Files:** `packages/frontend/src/JiraMigration/*`, `packages/frontend/src/forms/jiraMigration/*`, Jira atom and polling modules → `apps/frontend/src/features/jira/*`; Jira routes in `apps/frontend/src/routes`; `apps/frontend/messages/en/jira.json`.

- [ ] Place the UI in `features/jira/components`, the wizard in `features/jira/form`, atoms in `features/jira/atoms`, and polling in `features/jira/hooks`.
- [ ] Update route imports, shared-schema imports, and cross-feature attachment/project imports to main's feature paths.
- [ ] Preserve the final-save conflict-check fix and the disabled discard state.
- [ ] Compile Paraglide messages, run frontend typecheck, and run focused wizard, atom, and lifecycle tests.

## Task 4: Verify and update PR #235

**Files:** test-only corrections, `docs/screenshots/T-172/*`, PR body.

- [ ] Run root typecheck, lint, format check, diff check, and the SQL-enabled Jira suite. Record the exact pass/fail counts and distinguish the deferred Effect regression from new failures.
- [ ] Run the isolated public browser harness through a completed import against disposable resources, then inspect the final page and copied/unsupported attachment results.
- [ ] Add current Jira screenshots, with a completed-import image, to `docs/screenshots/T-172` and link them in a concise, numbered PR description using `i-have-adhd` style.
- [ ] Run the one comprehensive final review requested for T-172; address critical and important findings.
- [ ] Push a fast-forward update to PR #235, verify its diff and checks, update its body, and mark it ready for review with the deferred Effect limitation clearly stated.
