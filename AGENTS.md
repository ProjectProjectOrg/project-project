# AGENTS.md — ProjectProject

## Project context

This repo builds **ProjectProject**, a markdown-first project management tool. `docs/PROJECTPROJECT.md` describes its architecture as it is: workspaces, data model, surfaces, access and integrations. Read it before any non-trivial change, and update it in the same PR when your change makes it wrong.

**Markdown holds what is portable and cheap; Postgres holds what is large, opaque or meaningless outside this instance.** New content a human writes goes in markdown, never in a new column. See the data model in `docs/PROJECTPROJECT.md`.

`CONTEXT.md` is the domain glossary. Use its terms in code, copy and commits.

**For any UI/frontend work**, also read `PRODUCT.md` (strategic design context — users, brand personality, aesthetic direction, design principles) and `DESIGN.md` (visual system — color tokens, typography hierarchy, elevation, component primitives, named rules, do's and don'ts). Both are binding for visual and interaction decisions. Use the project UI quality checklist when working on UI so the change is reviewed against the product and design rules.

## How we work

You implement; the human decides. Write working code anywhere in the repo — services, handlers, atoms, components, schemas. The human reviews and steers: you propose and execute, they pick the direction.

### No architectural decisions without asking

This is the firm rule. **Do not make architectural decisions unilaterally.** That includes:

- Picking libraries (state mgmt, routing, validation, styling, ORM additions, etc.).
- Adding new packages to the workspace or new top-level modules.
- Choosing data-flow patterns (where state lives, how a feature is sliced, sync vs async boundaries).
- Naming conventions for shared concepts (route layouts, atom families, service tags).
- API surface decisions on `packages/shared` (endpoint shape, error taxonomy, schema modeling).

When you hit one of these, **stop and ask**. Present the options with tradeoffs; let the human pick. Implementation details inside an already-agreed shape are fine to just do.

### Tone

- Short, direct, peer-level. No teaching voice unless asked for one.
- Show the why before the what when something is non-obvious, especially around Effect.
- No emoji unless asked.

## Frontend stack

- **TanStack Router** (file routes through the Vite plugin), as an SPA.
- **`@effect/atom-react`** for Effect-aware state (`Atom.runtime`, atom families, etc.).
- **shadcn/ui on Base UI** (`@base-ui/react`) as the component foundation. Install via the shadcn CLI.
- **Fluid Functionalism components** from <https://www.fluidfunctionalism.com>, installed through the shadcn registry (`npx shadcn@latest registry add @fluid`). Prefer these where they exist for richer motion-aware primitives before reaching for something custom.
- Don't add other UI libraries (Headless UI, Mantine, Chakra, etc.) without asking — see the architecture rule above.

### Frontend layout

Code in `apps/frontend/src` is organised by feature:

```
features/<feature>/
  atoms/        effect-atom reads and mutations
  components/   feature UI
  forms/<name>/ TanStack forms (opts.ts, index.tsx, one file per step)
  hooks/        useX.ts
  lib/          pure feature logic and its tests
components/
  ui/           design-system primitives only (shadcn and Fluid)
  shell/        app chrome: layout, sidebar, nav, page and settings scaffolding, ErrorPage, NotFoundPage
lib/            cross-feature helpers only
hooks/          cross-feature hooks only
routes/         route files
```

- **Routes stay thin.** A route file holds `createFileRoute` options (`beforeLoad`, `loader`, `validateSearch`) and renders one component imported from `features/*` or `components/shell`. Page components read params and search through `getRouteApi("<route id>")`; nothing outside `routes/` imports from `routes/`. Tests of route modules sit beside them with a `-` prefix so the router ignores them.
- **Placement.** Code used by one feature lives in that feature; `lib/`, `hooks/` and `components/shell` hold what several features share.
- **Naming.** Directories are kebab-case. React component files are PascalCase (`TicketHoverCard.tsx`), hooks are `useX.ts`, other modules are camelCase (`activityGroups.ts`). `components/ui` keeps the kebab-case names the shadcn CLI generates. A component folder such as `ticket-list/` may hold its private helpers and hooks.
- Tests sit beside the module they test.
- **Pure logic lives in `lib/` with tests.** Sorting, grouping, formatting, payload building and state transitions that a component holds move to `features/<x>/lib/` with a sibling test, not into `*.logic.ts` files beside the component; the component keeps rendering and wiring.
- **Project scope.** Components rendered only inside a project read `orgSlug` and `slug` from `useProjectRoute()` (`features/projects/hooks/useProject.ts`), which reads `ProjectContext`. `ProjectLayout` provides it for the project route and `DashboardTicket` for each dashboard row, so don't drill the slugs as props. Components also rendered at org scope (dashboard lists, project tiles, hover cards that show another project's ticket) keep explicit props. Sidebar slots render outside the project tree, so a project-scoped slot wraps its content in `ProjectContext`.

### Types: readonly type aliases, never interfaces

Declare object shapes as `type` aliases wrapped in `Readonly<>`. Never use `interface`, and never
annotate fields with `readonly` one by one.

```ts
export type TicketRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>
```

Nest the wrapper for nested objects. Arrays are `ReadonlyArray<T>` rather than `T[]`; tuples keep
the `readonly [A, B]` spelling. This applies everywhere — request objects, view models, mutation
input shapes, component props, and inline annotations.

### No comments

Default: write zero comments. Self-explanatory names, clean structure, and small functions carry the meaning. Inline comments are noise — they distract during review, rot independently of the code, and signal a missing abstraction.

Exception: a single short line is acceptable only when a value would actively mislead a future reader (a workaround for a documented bug, a non-obvious browser quirk, a load-bearing token name). Even then, ask yourself whether the comment is hiding a rename or refactor that would remove the need.

Forbidden, regardless: multi-line comment blocks, design-rationale prose, layout reasoning, "this used to be X" notes, restatements of what the code obviously does, before/after explanations, and "we picked this because" passages. Those go in the commit message. If you catch yourself writing more than one line, delete the whole comment.

### Press feel — buttons scale down on active

Buttons should scale to **97%** on `:active` with a **100–150ms** transform transition, so the user feels the press land. Use `active:scale-[0.97]` (or `active:[&>span]:scale-[0.97]` when the button's content is what should compress, e.g. an icon button) paired with `transition-transform duration-100`.

This applies to every clickable button in the app — not just the obvious primaries. Skip only when the element is non-interactive or the press is already conveyed by another animation (e.g. an inline-form trigger that immediately morphs).

Buttons that open a popup (dropdown, popover, select, dialog) don't scale: the popup anchors to the trigger's box, so a press scale nudges it a pixel or two as it opens and closes. A global rule in `styles.css` cancels the scale for anything carrying `aria-haspopup`, which every Base UI trigger sets, so components don't need their own exception.

### Hover feel — instant in, eased out

Hover (and Base UI `[data-highlighted]` / `[data-selected]`) state changes should land **instantly on enter** and **ease out at ~150ms on exit**. That asymmetry is what makes the app feel responsive without feeling twitchy.

Implementation lives as a single global rule in `apps/frontend/src/styles.css`: while the element is hovered or carries the highlight data attribute, `transition-duration` is forced to `0ms`; once the cursor leaves (or the highlight clears), the override is gone and the element's underlying transition-duration governs the exit.

When a parent reveals a child on hover (a row's actions, say), the child is not itself hovered, so give the parent a named reveal group — `group/reveal` — and pair it with `group-hover/reveal:*` on the child; the global rule covers that name alongside `group/hitbox`.

For this to work, hover-affected elements must have a transition class set up — typically `transition-colors` (Tailwind default 150ms). If a hover-driven color change has no `transition-*` class, both directions snap and the rule has nothing to override. Add `transition-colors` (or `transition-opacity` / `transition-all` as appropriate) when introducing a new hover state.

When you write a new component with hover behavior, always pair the hover class with the matching transition utility — e.g. `transition-colors hover:bg-accent`, not bare `hover:bg-accent`.

### Prefer component variants over local styling

When you find yourself writing a one-off styled version of an existing component (different size, chrome, spacing, etc.), **add a variant to the component instead of rolling local Tailwind in the callsite**. Local styles compound: the second time we want the same look we have to copy classes; the third time they drift. A typed variant prop on the primitive keeps the design language singular and reusable.

Concrete example: the inline-pill version of `SegmentedTabs` lives as `variant="inline"` on the primitive, not as a hand-rolled set of classes at each callsite. Same rule applies to buttons, inputs, badges, etc. — extend the primitive, don't reskin it locally.

If extending the primitive feels disruptive (touches public API, would conflict with other callsites), stop and ask before going local.

### One primitive per pattern

Each UI pattern has exactly one primitive. Reach for it (or add a variant to it) before writing a second version:

- **Segmented tabs:** `SegmentedTabs` (`components/ui/segmented-tabs.tsx`), controlled by `value` / `onValueChange`, with `default | inline | view` variants and `labels="active"` for icon-only tabs. A tab that must be a router link passes an item `render` element.
- **Command menu:** the Fluid `CommandMenu` (`components/ui/command-menu.tsx`), with `CommandMenuInput` when the list filters from a text box. There is no cmdk.
- **Confirm:** `ConfirmButton` (`components/ui/confirm-button.tsx`). It owns its open state; callers never keep a `confirming` boolean. It covers inline swaps (`Trigger`, `DeleteTrigger`, `Confirm`), confirms opened from a menu (`MenuItem`, `Popover`, or `Idle` plus `Confirm` inside the menu), typed confirmation (`Action typed`), and the mutation atom's `waiting` / `error`.
- **Inline embed chip:** `Chip` (`components/ui/chip.tsx`) for bordered inline chips in the editor. Tinted labels and tags use `Badge`.
- **Icon chrome buttons:** `Button variant="quiet"` with `size="square-7" | "square-8" | "square-9"`, not hand-pasted `grid size-N … hover:bg-hover` buttons.
- **Sliding highlights:** `useFluidHover` + `FluidHoverHighlight` when we own the pointer and keyboard index (nav rails, command menu); `MenuHighlight` when Base UI owns `data-highlighted` (menus, selects); `SegmentedIndicator` for the selected tab.

### Ticket rows are one component

Render every ticket in a list with `Row` (`apps/frontend/src/features/tickets/components/ticket-list/Row.tsx`) inside a `rowGridClassName` grid. `Row` owns its columns — sprint chip, actions menu, epic prefix — and reads the data it needs itself, so callsites pass the ticket and its mutation, nothing about which columns to show. Don't hand-build a ticket row, and add new row behaviour to `Row` rather than to a list. The visual rule is "The One Ticket Row Rule" in `DESIGN.md`.

## i18n

- All user-facing strings go through paraglide messages (`m.*` from `@/paraglide/messages`); raw literals in JSX are forbidden.
- User-authored markdown (ticket descriptions, project READMEs, comments) stays as authored — never translated.
- Errors map through `apps/frontend/src/lib/errorMessage.ts`. Extend that file when adding new tagged errors that surface in the UI.
- `Intl.*` callsites take the active locale, read via `getLocale()` from `@/paraglide/runtime`. No `format.ts` wrapper layer.
- Source locale: `en`. Adding `nl` is a future PR (the locale switcher ships with it).
- Translation placement is governed by this ruleset, not by a validation script.
- Message IDs stay flat and prefix-based, for example `tickets_search_placeholder`.
- Keep existing message IDs unchanged when moving or reorganizing translations.
- Place new translations in the file/domain that owns their prefix.
- Use `common_` only for strings shared across unrelated domains. Do not move a string to `common_` only because the English text is generic.
- Domain-specific actions stay domain-specific, for example `project_detail_delete_button`, not `common_delete_button`.
- If a new domain or prefix is introduced, update this section and the Inlang `pathPattern` in the same PR.
- Future locales must mirror the same file layout and message IDs as `en`.

| File                                          | Prefixes                                               |
| --------------------------------------------- | ------------------------------------------------------ |
| `apps/frontend/messages/en/common.json`   | `common_`, `error_`, `validation_`                     |
| `apps/frontend/messages/en/shell.json`    | `chrome_`, `nav_`, `theme_`                            |
| `apps/frontend/messages/en/account.json`  | `auth_`, `profile_`                                    |
| `apps/frontend/messages/en/projects.json` | `org_`, `projects_`, `project_`, `members_`, `editor_`, `storage_`, `attachments_` |
| `apps/frontend/messages/en/comments.json` | `comments_`                                            |
| `apps/frontend/messages/en/tickets.json`  | `tickets_`                                             |
| `apps/frontend/messages/en/tags.json`     | `tags_`, `color_`                                      |
| `apps/frontend/messages/en/git.json`      | `git_`, `github_`                                      |
| `apps/frontend/messages/en/sprints.json`  | `sprints_`, `error_sprint_`                            |
| `apps/frontend/messages/en/time.json`     | `time_`                                                |
| `apps/frontend/messages/en/slack.json`    | `slack_`                                               |
| `apps/frontend/messages/en/figma.json`    | `figma_`                                               |
| `apps/frontend/messages/en/jira.json`     | `jira_`                                                |
| `apps/frontend/messages/en/templates.json` | `templates_`                                          |

Within each message file, group keys by prefix in the order listed above, then sort alphabetically inside each prefix group.

## Forms

Multi-field and multi-step forms use **TanStack Form** (v2 alpha) through `useAppForm` from `apps/frontend/src/lib/form.ts`, in `features/<feature>/forms/<name>/` (`opts.ts`, `index.tsx`, one file per step).

- Validators are Effect Schema (`Schema.toStandardSchemaV1`), never zod.
- Multi-step forms are one `form.FormGroup` per step; the group's `onSubmit` advances. No stepped-form primitive.
- Single-step forms wrap their schema in `validateAfterSubmit`.
- The form owns values and validity; the mutation atom owns progress and failure. Never read `isSubmitting` or disable on it.
- `form.state` and `group.state` are snapshots, not reactive. Read values through `useFormValues(form)` or `group.Subscribe`.

Read `docs/frontend/forms.md` before writing or changing a form.

## Data layer

Read `docs/frontend/data-layer.md` before adding or changing a read, a mutation or an `AsyncResult` render. The rules most often broken:

- **One client.** `apps/frontend/src/api/Api.ts` is the only way to reach the server. Never hand-roll a fetch atom.
- **Reads are wrappers.** Every exported read is `Atom.family((req) => Atom.optimistic(query(req)))`, keyed by a request object with a `_view` literal. The query stays module-private, and `timeToLive` and `reactivityKeys` are declared on it.
- **Default to optimistic.** Mutations are `viewMutation` against the wrapper of the view they fire from, keyed by view request plus entity id, with input equal to the API payload.
- **Read and write through the same wrapper.** An optimistic value on an atom nobody renders is invisible until a reload, and nothing errors.
- **Reactivity keys come from `src/api/keys.ts`**, in array form.
- **Never hold a transition open** with a pending map, preview merge, React context or a suspended read inside a mutation.
- **`waiting` means a mutation is in flight, never a read.** Pulse the data the mutation changed with `animate-pulse`.
- **Handle every `AsyncResult` variant.** Default to `AsyncView`; use `AsyncResult.matchWithError` only for custom failure UI. Inline mutation errors go through `mutationErrorText`. Never show a raw `error.message`.

The `effect-atom-optimistic-updates` skill has worked examples.

## Test scope

Keep tests for domain logic, API contracts, atoms, and hooks. Do not add component-rendering tests, DOM markup snapshots, or assertions about component styling. Test hooks with `renderHook`; provider wrappers are allowed. Do not hide component rendering behind test helpers. Oxlint rejects Testing Library `render` imports and direct React renderer imports in tests.

When removing a rendering suite, retain independent logic and atom assertions in the appropriate owner suite. Do not create production exports or injection hooks solely to preserve a deleted component test.

Worker isolation, jsdom selection and runtime rules: `docs/testing.md`. Read it before changing test configuration.

## Backend stack

Effect HttpApi + Drizzle + Better Auth + Postgres. Extend within those choices unless we explicitly revisit them.

- Core (`server-core`) never imports an integration package. Integrations reach PP through host services the backend supplies; their host implementations and composition tests live in the matching backend directory.
- Migrations live in `db`, HTTP contracts in `shared`. One SQL workflow engine serves every integration.
- Don't add a universal integration-driver interface, and don't migrate other integrations as part of an ordinary integration change.

## Repo orientation

- **Architecture:** `docs/PROJECTPROJECT.md` — workspaces and what each owns.
- **Domain glossary:** `CONTEXT.md`.
- **Frontend deep dives:** `docs/frontend/data-layer.md`, `docs/frontend/forms.md`, `docs/data-fetching-policy.md`.
- **Tests:** `docs/testing.md`.
- **Running and deploying:** `README.md`, `docs/deploy.md`.
- **Decisions:** `docs/superpowers/specs/` — design specs from past features. Context for why something is shaped the way it is, not a description of the current code.
- **History:** `docs/chapters/` is the Effect curriculum the project started from. Historical; don't treat it as current.

## Also ask first

- Installing dependencies the current task doesn't already imply.
- Destructive git operations.

When in doubt, read the relevant code and `docs/PROJECTPROJECT.md`, then ask. Cheaper to confirm than to redo.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->

## Learning more about Effect

This repository uses Effect v4. Before writing Effect code, read `node_modules/effect/AGENTS.md` completely and follow its linked guides as needed. Search `node_modules/effect/src` for API definitions. See `docs/migrations/effect-v4-handoff.md` for migration guidance.
