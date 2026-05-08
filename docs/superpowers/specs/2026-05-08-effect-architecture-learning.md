# Effect Architecture Learning Notes

**Date:** 2026-05-08
**Status:** Learning artifact, not an approved implementation plan
**Context:** Comparison between ProjectProject's current Effect code and the local `opensrc` copy of `pingdotgg/t3code`.

## Goal

Understand what t3code's Effect-heavy backend does well, where our current Effect modules are becoming shallow or hard to test, and which best practices are worth adopting without copying t3code's exact stack.

t3code currently uses Effect v4 beta. ProjectProject uses Effect v3 stable. Treat t3code as an architecture reference, not an API reference.

## Main Lesson

The strongest pattern in t3code is not a specific Effect feature. It is the discipline of separating a module's **Interface** from its **Implementation**, then composing named live adapters into runtime layers.

In ProjectProject, several services currently combine all of these in one file:

- the service tag
- the public Interface
- helper functions
- database or filesystem adapter code
- domain rules
- cross-service workflow
- failure policy

That was useful while learning Effect because everything was visible in one place. The cost is that the Interface becomes implicit, tests need broad fakes, and future changes require understanding too much Implementation detail at once.

## What T3code Does Differently

t3code often uses this shape:

- `Services/Foo.ts` defines the service tag and shape.
- `Layers/Foo.ts` builds the live adapter.
- pure domain modules hold decision logic.
- runtime modules group layers into named dependency graphs.
- tests replace modules at the seam with `Layer.mock` or `Layer.succeed`.

Examples in the source reference:

- `opensrc/repos/github.com/pingdotgg/t3code/apps/server/src/auth/Services/ServerAuth.ts`
- `opensrc/repos/github.com/pingdotgg/t3code/apps/server/src/auth/Layers/ServerAuth.ts`
- `opensrc/repos/github.com/pingdotgg/t3code/apps/server/src/orchestration/decider.ts`
- `opensrc/repos/github.com/pingdotgg/t3code/apps/server/src/orchestration/projector.ts`
- `opensrc/repos/github.com/pingdotgg/t3code/apps/server/src/orchestration/runtimeLayer.ts`
- `opensrc/repos/github.com/pingdotgg/t3code/apps/server/src/server.ts`

The important idea is depth: callers see a small, stable Interface while the messy Implementation sits behind the seam.

## Current Friction In ProjectProject

### Broad service modules

Files:

- `packages/backend/src/services/Projects.ts`
- `packages/backend/src/services/Tickets.ts`
- `packages/backend/src/services/Groups.ts`
- `packages/backend/src/services/GitHub.ts`

Problem:

These modules are doing real work, but their Interfaces are inferred from the returned object inside `Effect.Service`. That makes the public contract harder to see and easier to grow accidentally. Tests also fake large services with `as never`, which means TypeScript is not helping us keep fake adapters aligned with real adapters.

Proposed direction:

Introduce explicit service shape types for the high-change modules first. Keep current behavior. Move the live adapter into a clearly named Implementation module only when there is a practical reason.

Best practice:

Use the Interface as the test surface. If a test needs to know about private helper structure, the module is probably too shallow or the wrong seam is being tested.

### Duplicated runtime wiring

Files:

- `packages/backend/src/main.ts`
- `packages/backend/src/mcp.ts`

Problem:

HTTP and MCP compose similar services separately. Every new backend service now risks a wiring update in more than one entrypoint.

Proposed direction:

Create one shared backend runtime layer module with named layer groups, then let HTTP and MCP add only their transport-specific layers.

Best practice:

Entrypoints should describe how the process starts. They should not be the only place where the app dependency graph exists.

### Markdown store leaks raw file concerns

Files:

- `packages/backend/src/services/Markdown.ts`
- `packages/backend/src/services/Projects.ts`
- `packages/backend/src/services/Tickets.ts`
- `packages/backend/src/services/Groups.ts`

Problem:

`Markdown` exposes parsed `{ data, body }`, and each domain service understands its own frontmatter decoding, defaults, disk shape, and wire shape. That gives every caller too much knowledge of the file format.

Proposed direction:

Deepen the Markdown store into typed document repositories. For example, project, ticket, and group document reads should return decoded domain document values rather than raw frontmatter maps.

Best practice:

Raw external data belongs at an adapter seam. Once data crosses that seam, the rest of the app should work with decoded domain values or typed failures.

### Ticket Git-state logic mixes planning and effects

Files:

- `packages/backend/src/services/Tickets.ts`
- `packages/backend/src/services/GitHub.ts`

Problem:

`listGitStates` reads markdown, fetches GitHub data, computes UI state, writes ticket updates, and reports transitions. The rule itself is important: observing a merged PR can mark a ticket done. But the current module makes the rule hard to test without filesystem and GitHub context.

Proposed direction:

Split the git-state rule into a pure planning module and an Effectful adapter. The planner receives ticket snapshots and raw GitHub state, then returns the next visible states plus a write plan. The service applies the write plan.

Best practice:

When a workflow both decides and performs, extract the deciding part first. That gives high locality for business rules while keeping Effect where it earns its keep: dependencies, errors, resources, concurrency, and logging.

### Operational context is thin

Files:

- `packages/backend/src/services/Projects.ts`
- `packages/backend/src/services/GitHub.ts`
- `packages/backend/src/handlers/projects.ts`
- `packages/backend/src/handlers/tickets.ts`

Problem:

Important failures are often collapsed with `Effect.orDie`, `Effect.die`, or `console.warn`. Some defects are appropriate, but they lose useful context.

Proposed direction:

Add structured Effect logging and spans around GitHub calls, markdown rewrites, and cross-store mutations. Keep wire error behavior unchanged unless we explicitly choose a new error contract.

Best practice:

Use tagged errors for expected domain outcomes. Use defects for broken invariants. Use logs and spans to explain defects and external failures after the fact.

## Best-Practice Checklist For Our Effect Code

- Make important service Interfaces explicit once a module has more than one adapter, more than one caller type, or meaningful tests.
- Keep live adapters small enough that their dependencies are obvious.
- Compose runtime layers in named modules, not only inside process entrypoints.
- Put raw IO parsing at adapter seams; pass decoded values inward.
- Put business decisions in testable functions when the decision is more interesting than the IO.
- Avoid adding a seam with only pass-through methods. One adapter is hypothetical; two adapters or meaningful tests make the seam real.
- Prefer `Layer.succeed` or Effect's test helpers for fakes over `as never` service objects.
- Use `Effect.log*`, spans, and annotations instead of `console.*` in backend services.
- Keep HttpApi handlers thin, but do not repeat the same gate logic in every handler if a small module can own it.
- Do not copy t3code's Effect v4 APIs until ProjectProject intentionally migrates from Effect v3.

## Suggested First Refactors

1. Shared backend runtime layer.
   This has low behavior risk and immediately removes duplicate service graph knowledge from `main.ts` and `mcp.ts`.

2. Explicit service shapes for `Projects`, `Tickets`, and `Groups`.
   This improves the test surface before we split implementations into separate files.

3. Git-state planner extraction.
   This targets the most complex current workflow and gives a strong example of separating domain decision logic from Effectful adapters.

## What This Is Not

This is not an implementation plan. It does not decide folder structure, exact service shape names, or which module gets split first. Those are architectural decisions and should be picked deliberately before code changes.
