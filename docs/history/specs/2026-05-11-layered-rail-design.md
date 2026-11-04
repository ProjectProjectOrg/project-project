# Layered contextual rail — design

## Problem

The contextual rail (currently used only by the sprints section) is rendered as a third column inside `<main>`. When a section that owns the rail mounts, the rail's outer `<aside>` animates its width from `0` to `14rem`, which shifts the main content rightward. The animation is smooth, but the horizontal jump still distracts and breaks the perception of a stable shell.

## Goal

Replace the third-column rail with a layered surface that lives **inside the primary sidebar column**. Opening the rail no longer changes any column widths in the shell; the rail crossfades over the primary nav within the same 14rem column.

## Concept

The sidebar column is split into three vertical zones:

1. **Logo header** (top, ~`h-14`) — always visible, never layered.
2. **Stacking body** (middle, fills remaining height) — holds two layers: the primary nav (Dashboard / Projects) and the contextual rail. Exactly one is active at a time; the other is transitioning in or out.
3. **Theme switcher footer** (bottom, ~`p-3`) — always visible, never layered.

The back affordance lives **inside the rail layer**, at its top, as a chevron + section label (e.g. `‹ Sprints`). It is a `Link` to the section's parent route. Navigating there exits the section, the slot owner unmounts, and the rail layer crossfades out to reveal the primary nav.

## Behavior

- **Open trigger:** route-driven. The section's layout (e.g. `SprintsLayout`) registers itself with `SidebarSlot` on mount; the rail layer fades in over the primary nav.
- **Close trigger:** the rail layer's chevron is a `Link` to the section's parent route (`/orgs/$orgSlug/projects/$slug` for sprints). Any other navigation that leaves the section (breadcrumbs, ticket links, primary nav re-entry) achieves the same effect — the slot owner unmounts.
- **Single contextual rail at a time.** The slot value is the last registered entry, matching today's behavior.
- **`main` no longer animates.** The `<aside>` and width transition inside `<main>` are removed.

## Motion

Crossfade with light scale between the two layers — no horizontal slide.

- **Open (primary nav → rail):**
  - Primary nav exits: `scale(1) opacity-1` → `scale(0.98) opacity-0`.
  - Rail enters: `scale(1.02) opacity-0` → `scale(1) opacity-1`.
- **Close (rail → primary nav):**
  - Rail exits: `scale(1) opacity-1` → `scale(1.02) opacity-0`.
  - Primary nav enters: `scale(0.98) opacity-0` → `scale(1) opacity-1`.
- **Duration:** `180ms` for both transform and opacity.
- **Easing:** `cubic-bezier(0.2, 0.8, 0.2, 1)` for both.
- **Transform origin:** `center`.
- **Pointer events:** the outgoing layer is `pointer-events-none` for the full transition so clicks never land on a fading layer.
- **Reduced motion (`prefers-reduced-motion: reduce`):** drop the scale, keep the opacity crossfade.

Implementation note: because the slot owner unmounts when the user leaves the section, the "rail exit" half of the close transition needs the slot's last content to linger for one transition duration after `slot` becomes `null`. Done with a small `usePresence`-style hook inside the stacking surface (track `current` and `outgoing` content; clear `outgoing` after `180ms`). No external dependencies.

## Rail surface

Today the rail wraps its content in `bg-muted/60 rounded-xl p-2` because it sits inside `<main>`. In the new home, the rail renders **flush within the sidebar column**, peer to the primary nav:

- Drop the outer `bg-muted/60 rounded-xl p-2` wrapper from `SprintRail`.
- The stacking surface (the middle zone of the sidebar column) provides padding identical to the primary nav (`px-3 py-2` rhythm).
- Internal layout of `SprintRail` (`flex flex-col gap-4`, the inline new-sprint form, the sections) is unchanged.

## Rail header

Top row of the rail layer:

```
‹  Sprints
```

- `ChevronLeft` from `lucide-react`, `size-4`, `strokeWidth={1.75}`.
- Label `Sprints`, sentence case, `text-muted-foreground` at the section-header size already used by the rail (`text-[11px]` group headers). The label is the section's name; the _current page_ is conveyed by the breadcrumbs in the topbar — the rail header is for orientation within the layer, not navigation state.
- Wrapped in a single `Link` to the section's parent route. Hit target = the row.
- Spacing: `flex items-center gap-2 px-2 py-1.5`. Hover lightens to `text-foreground` with `transition-colors` (matches the rest of the rail).
- Sits at the top of the rail's flex column, above the inline new-sprint form.

## SidebarSlot API

The slot value grows from a `ReactNode` to a small descriptor so the slot can render the back row without each owner re-implementing it.

```ts
type SlotEntry = {
  label: string
  parentTo: LinkProps // typed against TanStack Router
  render: () => ReactNode
}
```

- `useSidebarSlot(key, entry)` replaces today's `useSidebarSlot(key, render)`. Callers pass `{ label, parentTo, render }`.
- `useSidebarSlotContent()` returns the full entry (or `null`), so the consumer in the shell can render the back row + the rail body.
- Exact typing of `parentTo` will follow TanStack Router's `LinkProps` so route + params are type-safe at the slot boundary. Final shape is fixed during implementation.

This is the architectural seam. It's the only slot API change required for the layered model; no new packages or state libraries.

## Theme switcher

The footer zone of the sidebar column is **outside the stacking surface** and renders unconditionally. `ThemeSwitcher` stays exactly where it is today (bottom-anchored) and is visible regardless of which layer is active in the stacking body above it. Layered crossfade does not touch it.

## Files touched

- `packages/frontend/src/routes/_authed/route.tsx`
  - Remove the inner `<aside>` and `transition-[width,margin]` block from `<main>`.
  - Reshape `Sidebar` so the column has a fixed-height logo header, a `relative flex-1` stacking body, and a fixed-height theme-switcher footer.
  - Read the slot inside the stacking body. Render `<PrimaryNav>` as one layer and the slot's rail as the other. Drive crossfade + scale via state mirroring `slot` and one trailing copy for the exit phase.
- `packages/frontend/src/components/SidebarSlot.tsx`
  - Replace the `ReactNode` payload with the `SlotEntry` shape above.
  - Keep the key-based stack behavior so concurrent owners don't fight.
- `packages/frontend/src/components/sprints/SprintsLayout.tsx`
  - Pass `{ label, parentTo, render }` to `useSidebarSlot`. `label` reads from a new paraglide message; `parentTo` points at `/orgs/$orgSlug/projects/$slug`.
- `packages/frontend/src/components/sprints/SprintRail.tsx`
  - Drop the outer pill chrome. Rail's internal layout is unchanged.
- `packages/frontend/messages/en/sprints.json`
  - Add `sprints_rail_section_label` → `"Sprints"`. Insert in alphabetical order under the `sprints_` prefix group.

## Out of scope

- Generalizing the slot to a stack of layers (more than two). Today there is exactly one section that owns the rail; the slot stays single-entry-effective.
- Persisting "user dismissed the rail while still on the section." We chose pure route-driven (open Q2 → A).
- Animating the logo header or theme switcher.
- Touching `<main>`'s inner styling beyond removing the old `<aside>`.

## Accessibility

- The back row is a `Link` with visible text label; no aria-label needed.
- Reduced motion path keeps semantics intact (crossfade only).
- Focus management: when the rail enters, focus stays where the user put it (typically a primary-nav link they just clicked). No focus stealing.
- The outgoing layer being `pointer-events-none` prevents stale-focus pitfalls during transitions.

## Risks

- The "outgoing content" trick (keeping the last slot entry mounted for one transition duration after it unmounts) is the only non-trivial bit. If we don't handle it the close animation has no "from" content. Mitigated by a tiny internal hook in the shell; no external lib.
- The slot API change is a breaking change for any future caller, but today there is exactly one caller (`SprintsLayout`), so cost is bounded.
