# Layered contextual rail — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the third-column contextual rail with a crossfade+scale layer inside the primary sidebar column, so opening the rail no longer shifts main content horizontally.

**Architecture:** Sidebar column splits into three vertical zones (logo header, stacking body, theme-switcher footer). The stacking body holds two layers driven by `useSidebarSlotContent()` — primary nav by default, rail when a section registers content. `AnimatePresence` (already used elsewhere in the repo) handles the enter/exit motion. `SidebarSlot`'s payload stays a plain `ReactNode`; the back row is rendered *by* the rail using a shared `<RailBackLink>` primitive, so no slot API change is required.

**Tech Stack:** React 19, TanStack Router, `motion/react` (`AnimatePresence` + `motion.div`), Tailwind v4, paraglide for i18n.

---

## Files touched

- Create: `packages/frontend/src/components/RailBackLink.tsx` — shared back-row primitive used by any section that owns the rail.
- Modify: `packages/frontend/messages/en/sprints.json` — add `sprints_rail_section_label`.
- Modify: `packages/frontend/src/routes/_authed/route.tsx` — split `Sidebar` into header / stacking body / footer; remove the inner `<aside>` and width transition from `<main>`; wire `AnimatePresence`.
- Modify: `packages/frontend/src/components/sprints/SprintRail.tsx` — drop the outer pill chrome and mount `<RailBackLink>` as the first child.
- Modify: `packages/frontend/src/components/SidebarSlot.tsx` — no API change; only verify it still does what we need (light touch — may be no-op).

---

## Task 1: Add the rail header translation key

**Files:**
- Modify: `packages/frontend/messages/en/sprints.json`

- [ ] **Step 1: Add the key**

Open `packages/frontend/messages/en/sprints.json` and add a new entry alphabetically within the `sprints_` prefix group. It belongs between `sprints_planned_label` and `sprints_remove_button` (or wherever the alphabetical slot lands — verify by skimming the file):

```json
"sprints_rail_section_label": "Sprints",
```

- [ ] **Step 2: Regenerate paraglide output**

Run from the repo root:

```bash
bun run --filter @projectproject/frontend paraglide:compile
```

Expected: no errors. New files appear under `packages/frontend/src/paraglide/messages/` for the new key.

- [ ] **Step 3: Typecheck**

```bash
bun run --filter @projectproject/frontend typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/messages/en/sprints.json packages/frontend/src/paraglide
git commit -m "feat(sprints): add rail section label translation"
```

---

## Task 2: Create the `RailBackLink` primitive

This is the shared back-row used at the top of any contextual rail. It renders a chevron + section label, wrapped in a TanStack `Link` to the parent route. Generic over route type via TanStack's `Link` props.

**Files:**
- Create: `packages/frontend/src/components/RailBackLink.tsx`

- [ ] **Step 1: Write the component**

Create `packages/frontend/src/components/RailBackLink.tsx`:

```tsx
import { Link, type LinkComponentProps } from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

type RailBackLinkProps = LinkComponentProps<"a"> & {
  label: string
}

export function RailBackLink({ label, className, ...linkProps }: RailBackLinkProps) {
  return (
    <Link
      {...linkProps}
      className={cn(
        "group/rail-back flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      <ChevronLeft className="size-4" strokeWidth={1.75} />
      <span>{label}</span>
    </Link>
  )
}
```

Notes for the implementer:
- We spread `LinkComponentProps<"a">` so callers pass `to`, `params`, `search`, etc. with full TanStack type-checking — no parallel typing.
- `hover:text-foreground` paired with `transition-colors` is required for the project-wide hover-asymmetry rule in `CLAUDE.md` ("Hover feel — instant in, eased out").
- Text size `text-[11px]` matches the existing rail section headers in `SprintRail` so the back row reads as peer chrome, not a button.
- No `active:scale-[0.97]` — the link's role is navigation, not "press feel"; treating it as a press would compete with the layer's crossfade. (The button press-feel rule in `CLAUDE.md` is about buttons; this is a row-style link.)

- [ ] **Step 2: Typecheck**

```bash
bun run --filter @projectproject/frontend typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/RailBackLink.tsx
git commit -m "feat(rail): add RailBackLink primitive"
```

---

## Task 3: Restructure `Sidebar` and remove the third-column rail from `<main>`

Three sub-changes in one file, committed together because they're inseparable type-and-layout-wise:

1. Pull the inner `<aside>` (and its width transition) out of `<main>`. `<main>` becomes a single-pane.
2. Reshape `Sidebar` into three zones: logo header (fixed height), stacking body (`flex-1, relative`), theme-switcher footer (fixed height).
3. Mount the slot inside the stacking body, with `AnimatePresence` driving crossfade+scale between the primary nav and the rail.

**Files:**
- Modify: `packages/frontend/src/routes/_authed/route.tsx`

- [ ] **Step 1: Update imports**

At the top of `packages/frontend/src/routes/_authed/route.tsx`, add:

```tsx
import { AnimatePresence, motion } from "motion/react"
```

Remove `cn` from the imports if it's no longer referenced after Step 3 (verify after editing).

- [ ] **Step 2: Replace the `Shell` function**

Replace the existing `Shell` function with:

```tsx
function Shell({ user }: { user: User }) {
  return (
    <div className="h-full p-3">
      <div className="grid h-full grid-cols-[14rem_1fr] grid-rows-[3.5rem_1fr] overflow-hidden rounded-2xl bg-background shadow-sm ring-1 ring-border/60">
        <Sidebar user={user} />
        <Topbar user={user} />
        <main className="flex min-h-0 overflow-hidden p-2 pt-0">
          <div className="min-w-0 flex-1 overflow-auto rounded-xl bg-muted/60">
            <div className="p-6">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
```

Differences from before:
- Inner `<aside>` for the rail is removed.
- `useSidebarSlotContent()` is no longer called here — it moves into `Sidebar`.

- [ ] **Step 3: Replace the `Sidebar` function**

Replace the existing `Sidebar` function with:

```tsx
function Sidebar({ user }: { user: User }) {
  const orgSlug = user.activeOrgSlug
  const slot = useSidebarSlotContent()

  return (
    <aside className="row-span-2 flex flex-col">
      <div className="flex h-14 items-center gap-3 px-4 text-foreground">
        <Logo className="size-8" />
        <Wordmark className="h-5 w-auto" />
      </div>
      <div className="relative min-h-0 flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          {slot ? (
            <motion.div
              key="rail"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute inset-0 overflow-y-auto px-3 py-2"
            >
              {slot}
            </motion.div>
          ) : (
            <motion.div
              key="nav"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute inset-0 overflow-y-auto"
            >
              <PrimaryNav orgSlug={orgSlug} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="p-3">
        <ThemeSwitcher />
      </div>
    </aside>
  )
}

function PrimaryNav({ orgSlug }: { orgSlug: string | null }) {
  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      <NavItem
        to="/"
        icon={LayoutDashboard}
        label={m.chrome_sidebar_dashboard()}
        exact
      />
      {orgSlug && (
        <NavItem
          to="/orgs/$orgSlug/projects"
          params={{ orgSlug }}
          icon={FolderKanban}
          label={m.chrome_sidebar_projects()}
        />
      )}
    </nav>
  )
}
```

Notes:
- `mode="popLayout"` makes exiting children leave the layout flow so the entering child can occupy the absolute-positioned slot cleanly without layout jitter.
- The footer (`<div className="p-3"><ThemeSwitcher /></div>`) is *outside* `AnimatePresence`, so the theme switcher stays visible at the column bottom in both states. This implements design choice "iii" from the spec.
- Padding moves: previously `nav` lived in `Sidebar` directly. Now `PrimaryNav` owns its own `px-3 py-2`. The rail layer applies `px-3 py-2` on its motion wrapper so both layers have matching horizontal rhythm.
- Outgoing-presence is handled by `AnimatePresence` — no manual `useEffect`/`useRef` trick needed.

- [ ] **Step 4: Typecheck**

```bash
bun run --filter @projectproject/frontend typecheck
```

Expected: passes.

- [ ] **Step 5: Visual smoke (do not commit yet)**

Start the dev server:

```bash
bun run --filter @projectproject/frontend dev
```

In the browser:
1. Navigate to a project that has at least one sprint.
2. Confirm the main content does *not* shift horizontally when entering `/sprints/*`.
3. Confirm primary nav fades out while the rail fades in (you should see the brief overlap, not a hard cut).
4. Confirm the logo header and theme switcher stay rock-still through the transition.

The back row is missing right now (added in Task 5). The rail will look mostly correct minus that header — that's expected.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/routes/_authed/route.tsx
git commit -m "feat(shell): move contextual rail into sidebar column

Stack the rail over the primary nav with AnimatePresence crossfade+scale
instead of opening a third column in main. Theme switcher and logo header
stay outside the stacking surface so they remain visible across states."
```

---

## Task 4: Add `RailBackLink` to `SprintRail` and drop its pill chrome

The rail no longer lives inside `<main>` with its own `bg-muted/60 rounded-xl p-2` pill — it sits flush in the sidebar column. We strip that wrapper from the rail's root and add the back row at the top.

**Files:**
- Modify: `packages/frontend/src/components/sprints/SprintRail.tsx`

- [ ] **Step 1: Update imports**

In `packages/frontend/src/components/sprints/SprintRail.tsx`, add:

```tsx
import { RailBackLink } from "@/components/RailBackLink"
```

- [ ] **Step 2: Update the `SprintRail` return**

Replace the `return` block in `SprintRail` (currently `return ( <div className="flex h-full flex-col gap-4"> ... </div> )`) with:

```tsx
  return (
    <div className="flex h-full flex-col gap-4">
      <RailBackLink
        to="/orgs/$orgSlug/projects/$slug"
        params={{ orgSlug, slug }}
        label={m.sprints_rail_section_label()}
      />
      <NewSprintForm orgSlug={orgSlug} slug={slug} />
      <div className="flex flex-col gap-5 overflow-y-auto">
        <Section
          label={m.sprints_active_label()}
          count={active.length}
          sprints={active}
          orgSlug={orgSlug}
          slug={slug}
        />
        <Section
          label={m.sprints_planned_label()}
          count={planned.length}
          sprints={planned}
          orgSlug={orgSlug}
          slug={slug}
        />
        <Section
          label={m.sprints_completed_label()}
          count={completed.length}
          sprints={completed}
          orgSlug={orgSlug}
          slug={slug}
          dim
        />
      </div>
    </div>
  )
```

Only the `<RailBackLink>` line is new; everything else stays as-is. The outer `<div>` keeps `flex h-full flex-col gap-4` — no pill chrome to drop here because `SprintRail` itself never had it (the chrome lived in `<main>`'s `<aside>` wrapper, which Task 3 already removed).

- [ ] **Step 3: Typecheck**

```bash
bun run --filter @projectproject/frontend typecheck
```

Expected: passes.

- [ ] **Step 4: Visual verification**

With the dev server running:
1. Visit `/orgs/$slug/projects/$slug/sprints` (or any sprint detail). The back row appears at the top of the rail: `‹ Sprints` in muted color.
2. Hover the back row — text goes from muted to foreground instantly, and eases back to muted ~150ms after leaving (CLAUDE.md hover rule).
3. Click the back row — the rail crossfades out and the primary nav crossfades in. Route lands on `/orgs/$slug/projects/$slug`.
4. Navigate back into sprints via the project page. Rail crossfades in.
5. Toggle theme — both layers handle light *and* dark cleanly (design context demands light/dark parity).

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/sprints/SprintRail.tsx
git commit -m "feat(sprints): add back-row to rail header"
```

---

## Task 5: Reduced-motion verification

`motion/react` respects `prefers-reduced-motion: reduce` by default for the *spring*/inertia animations, but explicit `transition` durations are still honored. We want a clean crossfade (no scale) under reduced motion.

**Files:**
- Modify: `packages/frontend/src/routes/_authed/route.tsx` — only the motion props on the two `motion.div`s edited in Task 3.

- [ ] **Step 1: Wrap the scale values in a reduced-motion-aware helper**

`motion/react` exposes `useReducedMotion()`. Update the imports in `route.tsx`:

```tsx
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
```

Inside `Sidebar`, before the `return`, add:

```tsx
const reduceMotion = useReducedMotion()
const scaleIn = reduceMotion ? 1 : 1.02
const scaleOut = reduceMotion ? 1 : 0.98
```

Then update the two `motion.div`s:

```tsx
<motion.div
  key="rail"
  initial={{ opacity: 0, scale: scaleIn }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: scaleIn }}
  transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
  className="absolute inset-0 overflow-y-auto px-3 py-2"
>
  {slot}
</motion.div>
```

```tsx
<motion.div
  key="nav"
  initial={{ opacity: 0, scale: scaleOut }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: scaleOut }}
  transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
  className="absolute inset-0 overflow-y-auto"
>
  <PrimaryNav orgSlug={orgSlug} />
</motion.div>
```

When `prefers-reduced-motion: reduce` is set, both scales collapse to `1` and only opacity moves.

- [ ] **Step 2: Typecheck**

```bash
bun run --filter @projectproject/frontend typecheck
```

Expected: passes.

- [ ] **Step 3: Verify in DevTools**

In Chrome DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion" → set to `reduce`. Open and close the rail. The scale step should disappear; you see a pure crossfade. Reset the emulation when done.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/routes/_authed/route.tsx
git commit -m "feat(shell): respect prefers-reduced-motion for rail crossfade"
```

---

## Task 6: Final end-to-end sweep

No code changes — verification only. If anything here fails, fix it inline and amend the relevant commit (or add a follow-up commit).

- [ ] **Step 1: Lint / format / typecheck the workspace**

```bash
bun run --filter @projectproject/frontend typecheck
```

Expected: passes.

If the repo has a formatter wired into pre-commit hooks, the previous commits already ran it. If you bypassed (don't), run it now.

- [ ] **Step 2: Manual interaction sweep**

In the dev server, in *both* light and dark themes, verify:

1. **No horizontal shift** anywhere on the shell when entering/leaving a sprint route.
2. **Logo header and theme switcher are immobile** during the crossfade.
3. **Back row hover** behaves per `CLAUDE.md`: instant darken on enter, ~150ms ease back on leave.
4. **Clicking the back row** lands on the project home and dismisses the rail.
5. **Refresh on a sprint detail page** — the rail mounts directly without the open animation flickering (AnimatePresence's `initial={false}` handles this; verify).
6. **Nested ticket route** (`/orgs/$slug/projects/$slug/sprints/$groupId` then click a ticket if applicable) — verify the rail behaves correctly when the sprint layout stays mounted vs. unmounts.
7. **Breadcrumb dismissal** — clicking the project name in the breadcrumb (any route that exits `/sprints/*`) dismisses the rail with the close animation.
8. **Direct deep-link** to a sprint URL from a fresh tab — rail appears without animation (initial render), no flicker, theme switcher and logo header present.

- [ ] **Step 3: Confirm no orphaned code**

Grep the frontend for now-dead references:

```bash
grep -rn "transition-\[width,margin\]" packages/frontend/src
grep -rn "pointer-events-none mr-0 w-0" packages/frontend/src
```

Both should return zero matches. If any results remain, they're leftover from the removed inner `<aside>` — remove them.

- [ ] **Step 4: Done**

If everything above passes, the feature is complete. Push and open the PR.

---

## Notes for the implementer

- **Why not change the slot API.** The spec considered passing `{ label, parentTo, render }` through `SidebarSlot`. We went simpler: a shared `<RailBackLink>` primitive that owners drop into their rail's render output. Same end-user result, zero API surface change, zero typing fights with TanStack `Link`'s generics. If we ever grow a second or third contextual rail and find ourselves copy-pasting `<RailBackLink>` plumbing, that's the moment to lift it into the slot API.
- **Why `motion/react`.** Already used in `SegmentedTabs`, `ColorPicker`, `inline-form`. Same dependency, same API. `AnimatePresence` with `mode="popLayout"` solves the outgoing-presence problem cleanly without a manual `useEffect` + `setTimeout` dance.
- **Conventions.** No comments in committed code. Every user-facing string flows through paraglide. The hover rule in `CLAUDE.md` (`transition-colors` + `hover:` is mandatory for hover-affected elements) applies to `RailBackLink`.
- **What `<main>` looks like after.** Single pane, no inner `<aside>`. If a future feature needs a *second* sidebar on the right of main, that's a separate design discussion — don't reintroduce the third-column pattern for it.
