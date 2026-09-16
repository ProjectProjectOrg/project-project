# AGENTS.md — ProjectProject

## Project context

This repo builds **ProjectProject**, a markdown-first project management tool described in `docs/PROJECTPROJECT.md`. **Read that file first** before any non-trivial response — it is the spec we're building toward.

### What lives in markdown, what lives in Postgres

Markdown holds what is **portable and cheap**: anything a human would write or read, anything another tool could use, expressed in a few characters. Postgres holds what is neither — data that is large, opaque, or meaningless outside this instance. Losing the Postgres half costs a re-upload, not information.

A project's `icon` (emoji) and `color` (hex) stay in frontmatter; its `banner`, `iconImage`, and banner `placeholder` live only in `project_index`. An attachment id is meaningless copied into another workspace; a hex colour survives that copy. See `docs/superpowers/specs/2026-09-10-aesthetic-data-in-postgres-design.md`.

**For any UI/frontend work**, also read `PRODUCT.md` (strategic design context — users, brand personality, aesthetic direction, design principles) and `DESIGN.md` (visual system — color tokens, typography hierarchy, elevation, component primitives, named rules, do's and don'ts). Both are binding for visual and interaction decisions. Use the project UI quality checklist when working on UI so the change is reviewed against the product and design rules.

The project started as a structured Effect-learning curriculum (chapter-by-chapter exercises in `docs/chapters/`). Wouter has now absorbed enough Effect to shift to a **normal collaborative implementation workflow**. The chapter docs stay in the repo for reference, but the chapter-viewer app is gone and we no longer follow the stub-and-exercise pattern.

## Wouter

TypeScript engineer, frontend background, comfortable with Effect v3 fundamentals (Layers, scopes, tagged errors, `Effect.gen`, `HttpApi`, `@effect-rx`). Works in a real engineering setting most of the time and is fine pair-programming with AI. Treat him as a peer, not a student — but he's still building Effect intuition, so flag non-obvious choices when you make them.

## How we work

We implement the app together. You can write working code anywhere in the repo (`backend/`, `frontend/`, `shared/`). The split is collaborative:

- **You implement** — services, handlers, atoms, components, schemas. Working code is the norm.
- **Wouter reviews and steers** — he decides direction; you propose and execute.

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
- No emoji unless asked.

## Frontend stack

- **TanStack Start + TanStack Router** as already wired up.
- **`@effect/atom-react`** for Effect-aware state (`Atom.runtime`, atom families, etc.).
- **shadcn/ui (Radix-backed)** as the component foundation. Install via the shadcn CLI.
- **Fluid Functionalism components** from <https://www.fluidfunctionalism.com>, installed through the shadcn registry (`npx shadcn@latest registry add @fluid`). Also Radix-backed, so they coexist cleanly with shadcn defaults. Prefer these where they exist for richer motion-aware primitives before reaching for something custom.
- Don't add other UI libraries (Headless UI, Mantine, Chakra, etc.) without asking — see the architecture rule above.

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

### Hover feel — instant in, eased out

Hover (and Radix `[data-highlighted]` / `[data-selected]`) state changes should land **instantly on enter** and **ease out at ~150ms on exit**. That asymmetry is what makes the app feel responsive without feeling twitchy.

Implementation lives as a single global rule in `packages/frontend/src/styles.css`: while the element is hovered or carries the highlight data attribute, `transition-duration` is forced to `0ms`; once the cursor leaves (or the highlight clears), the override is gone and the element's underlying transition-duration governs the exit.

When a parent reveals a child on hover (a row's actions, say), the child is not itself hovered, so give the parent a named reveal group — `group/reveal` — and pair it with `group-hover/reveal:*` on the child; the global rule covers that name alongside `group/hitbox`.

For this to work, hover-affected elements must have a transition class set up — typically `transition-colors` (Tailwind default 150ms). If a hover-driven color change has no `transition-*` class, both directions snap and the rule has nothing to override. Add `transition-colors` (or `transition-opacity` / `transition-all` as appropriate) when introducing a new hover state.

When you write a new component with hover behavior, always pair the hover class with the matching transition utility — e.g. `transition-colors hover:bg-accent`, not bare `hover:bg-accent`.

### Prefer component variants over local styling

When you find yourself writing a one-off styled version of an existing component (different size, chrome, spacing, etc.), **add a variant to the component instead of rolling local Tailwind in the callsite**. Local styles compound: the second time we want the same look we have to copy classes; the third time they drift. A typed variant prop on the primitive keeps the design language singular and reusable.

Concrete example: the inline-pill version of `SegmentedTabs` (used for "Update status to: …") lives as `variant="inline"` on the primitive, not as a hand-rolled set of classes inside `CreateBranchFields`. Same rule applies to buttons, inputs, badges, etc. — extend the primitive, don't reskin it locally.

If extending the primitive feels disruptive (touches public API, would conflict with other callsites), stop and ask before going local.

## i18n

- All user-facing strings go through paraglide messages (`m.*` from `@/paraglide/messages`); raw literals in JSX are forbidden.
- User-authored markdown (ticket descriptions, project READMEs, comments) stays as authored — never translated.
- Errors map through `packages/frontend/src/lib/errorMessage.ts`. Extend that file when adding new tagged errors that surface in the UI.
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
| `packages/frontend/messages/en/common.json`   | `common_`, `error_`, `validation_`                     |
| `packages/frontend/messages/en/shell.json`    | `chrome_`, `nav_`, `theme_`                            |
| `packages/frontend/messages/en/account.json`  | `auth_`, `profile_`                                    |
| `packages/frontend/messages/en/projects.json` | `org_`, `projects_`, `project_`, `members_`, `editor_`, `storage_`, `attachments_` |
| `packages/frontend/messages/en/comments.json` | `comments_`                                            |
| `packages/frontend/messages/en/tickets.json`  | `tickets_`                                             |
| `packages/frontend/messages/en/tags.json`     | `tags_`, `color_`                                      |
| `packages/frontend/messages/en/git.json`      | `git_`, `github_`                                      |
| `packages/frontend/messages/en/sprints.json`  | `sprints_`, `error_sprint_`                            |
| `packages/frontend/messages/en/time.json`     | `time_`                                                |
| `packages/frontend/messages/en/figma.json`    | `figma_`                                               |

Within each message file, group keys by prefix in the order listed above, then sort alphabetically inside each prefix group.

## Forms — TanStack Form and the mutation atom

Multi-field and multi-step forms use **TanStack Form** (`@tanstack/react-form`, currently the v2 alpha). Setup follows the conventions in the `omgevingschat-platform` web app:

- `packages/frontend/src/lib/form.ts` builds the hook via `createFormHook` and exports `useAppForm`, `useFormContext`, `appFormOptions`, `defineAppFieldGroup`. In v2 `createFormHook` no longer takes contexts, so there is no `form-context.ts`.
- A form lives in `packages/frontend/src/forms/<name>/`, with shared options and schemas in `opts.ts` and the form in `index.tsx`. Multi-step forms get one file per step beside them.

**Validators are Effect Schema, not zod.** TanStack Form accepts any Standard Schema, and `Schema.toStandardSchemaV1` (Effect v4) produces one — so `@projectproject/shared` schemas can be used directly. Do not add zod; it is not a dependency and a second schema library is not wanted.

### Multi-step forms are FormGroups, not a bespoke primitive

Follow the upstream multi-step wizard example. There is no stepped-form component and there should not be one — the library already does the work:

- One `form.FormGroup name="<step>"` per step, rendered conditionally on the current step index.
- **The group's `onSubmit` is how you advance.** A step's button submits the *group*; the group validates, and `onSubmit` fires only when it passes, so advancing is gated without computing validity or disabling anything. `onSubmitInvalid` handles the failure case.
- The last step's group `onSubmit` calls `form.handleSubmit()`.
- Put the whole-form schema in the form's own `validators` with `triggers: []`, so it runs on `form.handleSubmit()` only. That validates every step regardless of which groups are mounted.
- Use `createValidator` for the per-step validators so a step only revalidates on change after its first submit attempt — don't show errors before the user has tried.
- Type a form passed to step components with `ReactFormType<typeof yourFormOpts>`.

### The form owns validity; the atom owns the mutation

- **The form owns** field values, validation, and step progression.
- **The atom owns** the mutation. `onSubmit` awaits the Effect-Atom mutation, and everything the user sees about progress and failure (`waiting`, `animate-pulse`, error text) is read from the atom, never from `isSubmitting`.

Never disable a control on `isSubmitting` when an atom is doing the work — pass the atom's `waiting` down instead.

### Notes on the v2 alpha

- Validators are an array of `{ run, triggers, runOnMount }`. There is no `onChange`/`onMount` key and no `revalidateLogic` — that was the v1 model.
- **`group.state` is not reactive.** Read group state through `group.Subscribe`.
- Range checks are `Schema.isBetween({ minimum, maximum })` in Effect v4, not `Schema.between`.

## Mutations and optimistic updates

**Default to optimistic.** Reads are `Api.query(...)` wrapped in `Atom.optimistic`. Mutations are `Atom.optimisticFn` against the wrapper of the view they fire from. Worked examples and the legacy shapes we removed: `.agents/skills/effect-atom-optimistic-updates/SKILL.md`. Rationale: `docs/superpowers/specs/2026-09-11-native-atom-data-layer-design.md`.

1. **One client.** `packages/frontend/src/api/Api.ts` is the only way to reach the server. Never hand-roll a fetch atom. Calls to better-auth stay `Effect.tryPromise`, but run inside `Api.runtime.fn` so there is one runtime.

2. **Reads are wrappers.** Every exported read is `Atom.family((req) => Atom.optimistic(query(req)))`, and the query stays module-private. Family keys are request objects, never concatenated strings, so there is nothing to parse back apart:

   ```ts
   export type TagsRequest = Readonly<{
     params: Readonly<{ orgSlug: string; slug: string }>
   }>

   const tagsQuery = (req: TagsRequest) =>
     Api.query("tags", "list", {
       params: req.params,
       timeToLive: "2 minutes",
       reactivityKeys: [Keys.tags(scopeOf(req))]
     })

   export const tagsFor = Atom.family((req: TagsRequest) =>
     Atom.optimistic(tagsQuery(req))
   )
   ```

   `Atom.family` hashes its key by Effect's structural equality (`node_modules/effect/src/Equal.ts`), not by reference, so rebuilding the request literal on every render is free. What must be stable is the request's _contents_ — a field that is not structurally equal from one render to the next (a fresh `Date`, a generated id, a callback) is a different key and a second fetch. Export a query only to compose it into another region inside the atom layer (`sprintDetail.ts` exports `sprintQuery` for `sprintBoard.ts`, and nothing else does); components never see one.

3. **Retention and invalidation are declared at the query.** `timeToLive` and `reactivityKeys` sit in the `Api.query` call next to the data they describe, so a view states what it listens to and how long it is kept. Neither belongs in a mutation body.

4. **Read and write through the same wrapper.** The atom a view renders and the atom its editors mutate must be the same one. This is the worst failure mode in this layer: the optimistic value lands on an atom nobody renders, so the edit is invisible until a reload, and nothing errors. Adding a tag did exactly this during the migration — the detail view read `ticketDetail` while four editors still wrote a legacy atom that no longer had a consumer.

5. **Optimism is per view.** A mutation targets the wrapper of the view it fires from. Other views catch up through reactivity keys, updating once, old to new — that is not flicker. Never fan one transition into several wrappers, and never normalise entities into a store. When the same action must feel instant in three views, write three small `optimisticFn` atoms over one shared pure helper (`applyTicketPatch`).

6. **Key mutations by view request plus entity id**, never by the container alone:

   ```ts
   export const updateBacklogTicket = Atom.family(
     ({ req, id }: Readonly<{ req: BacklogRequest; id: TicketId }>) => ...
   )
   ```

   A mutation atom's `AsyncResult` is per key. Key a row mutation by the project and every row in the list shares one transition, so one failed assignment paints the error state onto every visible row.

7. **Mutation input equals the API payload.** Path params come from the family key. Cache keys, settle targets and view metadata never appear in the input.

8. **Reactivity keys are array form, built in `src/api/keys.ts`.** Record form also hashes the bare key, which would make any ticket mutation refetch every ticket query. Publish every key another view needs, including each source of a composed region. Prefer not to publish a key your own view registered — the wrapper already refreshes its source when the transition commits, so that is a second refetch per edit — but when the key another view needs is one yours also listens to, publish it anyway: correctness before a saved request.

9. **Reducers are pure,** use `AsyncResult.map(current, ...)` and derive from `current`, so stacked edits compose. Don't set `waiting` yourself — `optimisticFn` marks the provisional value waiting for you. A reducer that returns `current` unchanged is a pulse-only reducer: allowed only when the result is genuinely unpredictable, such as a PR number the server assigns.

10. **Push the confirmed value** through `optimisticFn`'s `set` before returning, so the server's own value is on screen before the refetch lands.

11. **Never hold a transition open** by waiting on a read — no `get.result(x, { suspendOnWaiting: true })` inside a mutation body, no pending map, no preview merge, no React context. The wrapper holds the optimistic value until its own source has refetched; that is the reason we wrap the view rather than the entity. (Awaiting a mutation atom's _own_ result from outside React, as `assignTicketToSprint` does to know when to unmount it, is a different thing and is fine.)

12. **Multi-query regions** compose in `Atom.readable(read, (refresh) => ...)` that forwards refresh to every source, with one wrapper around the region. The composed result must report `waiting` while any source is waiting, and must not carry a timestamp older than the value it replaces — `AsyncResult.all` does both, unioning `waiting` and stamping the composed success with the composition time. Get either wrong and the confirmed value is dropped silently, which looks exactly like the bug you were fixing.

13. **Refresh the wrapper, not the query.** `Atom.optimistic` forwards `refresh` to its source (`node_modules/effect/src/unstable/reactivity/Atom.ts`, the third argument to `writable`), and queries aren't exported, so `useAtomRefresh(backlog(req))` is both correct and the only option. This reverses the pre-migration rule that had callers refresh a base atom.

**`waiting` means a mutation is in flight, never a read.** Once a wrapper holds a success it ignores a `Success { waiting: true }` from its source — see the `Success` branch of the source subscription in `Atom.optimistic` (`node_modules/effect/src/unstable/reactivity/Atom.ts`, around line 2435), which only adopts a source value that is not waiting and is not older. A refetch behind an already-loaded view is therefore invisible through the wrapper, and any loading state driven off a wrapper's `waiting` is dead code. Two consequences:

- Surface `waiting` with `animate-pulse` on the data the mutation changed, never on idle controls.
- When a view genuinely needs the read's in-flight state, expose it next to the wrapper as its own atom — `projectGitStatesWaiting` in `atoms/github.ts` is `Atom.readable((get) => get(gitStatesQuery(req)).waiting)`. For the same reason, don't wrap a read that nothing mutates: the wrapper costs the refetch transition and buys nothing.
- A form reads its own submitting and error state off the mutation atom rather than mirroring it into `useState`: `const state = useAtomValue(createProject(req))` gives both `state.waiting` and the failure to render. Forms wired through reusable shells (`InlineForm`, `ConfirmButton`) keep their imperative `setBusy` / `setError` API — the shell doesn't know which atom is firing — as do callsites needing richer state than the atom carries, such as which row of a list is in flight.

Types obey the repo rule above — nested `Readonly<{ ... }>`, `ReadonlyArray<T>`, `readonly [A, B]`, no `interface`, no per-field `readonly`. That covers request types, mutation inputs and composed view-model types.

Reference: `packages/frontend/src/atoms/backlog.ts` (one sections query plus on-demand cursor pages, with sort-aware placement in the reducers), `packages/frontend/src/atoms/sprintBoard.ts` (a region composed from two queries), `packages/frontend/src/atoms/tags.ts` (`tagsFor` as a plain aggregate, `tagEditor` as a region composed from two wrappers).

## Rendering atom AsyncResults — `AsyncResult.matchWithError` + `ErrorPage`

A `useAtomValue` on a runtime atom returns a `AsyncResult<A, E>` with four variants: `Initial`, `Success`, `Failure-with-typed-error`, `Failure-with-defect`. **Always handle all four — never just check `AsyncResult.isSuccess` and render a forever-loading state on anything else.** That swallows real errors silently and makes failures invisible.

**The canonical helper is `AsyncResult.matchWithError`** from `effect/unstable/reactivity/AsyncResult`. It splits the failure path into `onError` (your typed `E` channel — `NotFound`, `Unauthorized`, etc.) and `onDefect` (unexpected throws, decode failures, interruptions). Failed renders use the shared `ErrorPage` component (`packages/frontend/src/components/ErrorPage.tsx`), which wraps the dither shell with a retry button and a home link. Pass `contained` when rendering inside a settings panel or any non-full-page surface.

The minimal pattern:

```tsx
import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { ErrorPage } from "@/components/ErrorPage"

function ProjectStatusesSettings() {
  const result = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))

  return AsyncResult.matchWithError(result, {
    onInitial: () => <LoadingSkeleton />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value }) => <StatusList statuses={value} />
  })
}
```

A few details worth knowing:

- **`onError` receives the typed error itself** (the value from the `E` channel, with its `_tag`), not the Failure variant. Narrow on `error._tag` if you want to render different messages per error kind — but `ErrorPage` already does this via `lib/errorMessage.ts` for any `AppError`, so most callsites just pass `error` through.
- **`onDefect` receives the unknown cause** (a Cause defect, a thrown JS error, a decode failure). Treat it the same way — pass it to `ErrorPage`, which falls back to `String(defect)` for the detail line.
- **`onSuccess` argument is the Success variant** (`{ value, waiting }`), not the raw value. Destructure `value` to get your data. The `waiting: true` flag is set during an in-flight optimistic mutation (per the optimistic-mutation conventions above) — useful when you want to pulse the success view while a refresh is happening.
- **Don't combine `AsyncResult.matchWithError` with a separate `if (!AsyncResult.isSuccess) ...` early return.** Pick one. The `match` form handles every case; mixing both is dead code and a refactor hazard.
- **For tiny callsites where you only care about success vs anything else** (e.g. a sidebar count that defaults to 0), `AsyncResult.isSuccess(result) ? result.value : fallback` is fine. The match form pays for itself once the failure case needs visible UI.

Reference: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/index.tsx` for the standard project-list pattern, and for reading a mutation atom's own state next to it. `AsyncResult` is imported as `Result` in most components; either alias is fine, but keep one per file.

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

## What requires asking first

- Architectural decisions (see list above).
- Installing new dependencies that aren't already implied by the current task.
- Destructive git operations.
- Touching `docs/PROJECTPROJECT.md` or `docs/chapters/` content.

## When in doubt

Re-read the relevant section of `docs/PROJECTPROJECT.md`, then ask. Cheaper to confirm than to redo.

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
