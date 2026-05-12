# Dither Button Variant — Design

## Summary

Add a new `variant="dither"` to the existing `Button` primitive in `packages/frontend/src/components/ui/button.tsx`. The variant renders a WebGL-dithered gradient (or dithered image) as the button's backdrop using `@paper-design/shaders-react`. Foreground (icons, text) sits above the shader canvas. The variant is intended for hero / one-off CTAs, not for use in lists.

## Motivation

Wouter wants a richer, more textural CTA treatment for moments where a single button needs visual weight (empty-state primary actions, hero promos, "Connect GitHub" entry points). Existing variants are flat by design; a dithered gradient gives a tactile, shader-driven surface without inventing a new component or breaking the shared `Button` API.

Decision: ship as a **variant on `Button`**, not a separate component. Rationale: it reuses the existing size/icon/loading/disabled/asChild machinery and stays in the same callsite vocabulary consumers already know.

## API

The variant adds three optional props that are only meaningful when `variant === "dither"`:

```ts
type DitherDirection = "r" | "l" | "t" | "b" | "tr" | "tl" | "br" | "bl"

interface DitherProps {
  ditherFrom?: string // CSS color; default "#000000"
  ditherTo?: string // CSS color; default "#ffffff"
  ditherDirection?: DitherDirection // default "r"
  ditherImage?: string // image URL; mutually exclusive with from/to
}
```

Typing is enforced via a discriminated overload on `ButtonProps`: these props only appear in autocomplete (and only typecheck) when `variant: "dither"`. Other variants keep their current API surface untouched.

`ditherImage` takes precedence over `ditherFrom` / `ditherTo` if both are passed at runtime. If neither is set, the gradient defaults to black → white on the horizontal axis (icon-side dark, text-side light), matching the spec example.

**Text color is not set by the variant.** Default `text-foreground` would be unreadable on the black side of the default gradient. Consumers own the text-color story via `className`, the same pattern `variant="chip"` already uses.

### Callsite shape

```tsx
<Button
  variant="dither"
  leadingIcon={Plus}
  ditherFrom="#0a0a0a"
  ditherTo="#6B97FF"
  className="text-white"
>
  Connect GitHub
</Button>
```

## Component shape

### Files

- **New:** `packages/frontend/src/components/ui/button-dither.tsx` — internal `<DitherBackdrop>` component. Not exported from the public `ui/button.tsx` barrel; lives next to it.
- **Modified:** `packages/frontend/src/components/ui/button.tsx` — add `"dither"` to the `variant` cva enum, extend `ButtonProps` with the discriminated dither props, and conditionally render `<DitherBackdrop>` when `variant === "dither"`.
- **New:** `packages/frontend/src/lib/use-in-viewport.ts` — small hook wrapping `IntersectionObserver` for the perf-gated shader mount (see Performance below).

### `<DitherBackdrop>`

Responsibilities:

1. Fill its containing button via `absolute inset-0 rounded-[inherit] pointer-events-none overflow-hidden`.
2. Render a **CSS gradient fallback** (`background-image: linear-gradient(...)`) as the base layer, mapping `ditherDirection` → CSS angle. This is the SSR-safe paint and the only visual until the shader mounts.
3. Once in viewport (`useInViewport`), mount Paper's shader on top:
   - `ditherImage` set → `<ImageDithering image={ditherImage} type="4x4" size={20} colorSteps={2} fit="cover" />`
   - otherwise → `<Dithering type="4x4" size={20} colorSteps={2} colorBack={ditherFrom} colorFront={ditherTo} ... />` with a `scale` / direction mapping that approximates the requested gradient direction.
4. Apply `"use client"` at the top of the file; the shader components are client-only.

The CSS fallback is intentionally **not removed** once the shader mounts — it sits underneath the canvas. If the WebGL context is lost (browser cap reached, tab throttling, GPU process crash) the page degrades to the CSS gradient automatically.

### Button render integration

In `button.tsx`, when `variant === "dither"`:

- The cva `dither` variant contributes only structural classes: `relative overflow-hidden bg-transparent` (no text-color, no hover/active bg — those would fight the shader).
- The existing `transition-all duration-100 active:scale-[0.97]` wrapper behavior is preserved (it lives on the root, above the dither stack).
- The existing `disabled:opacity-50` rule still applies and gracefully dims the whole stack.
- The existing `focus-visible:ring-1 focus-visible:ring-[#6B97FF]` ring is preserved on the root.
- Render order inside the button:
  1. `<DitherBackdrop ... />` (absolute, z-0)
  2. Existing leading icon / `<Slottable>{children}</Slottable>` / trailing icon, wrapped in `<span className="relative z-10 inline-flex items-center gap-[inherit]">…</span>` so they layer above the canvas.
- The `loading` and `isIconOnly` branches keep their current behavior; both work the same way (icon-only-with-dither is allowed and just produces a square dithered patch).

## Interaction states

First cut is **static shader, normal button feedback**:

- Hover: no shader change. The button's underlying `transition-all` still runs, but since the dither variant contributes no hover bg class, the only hover effect is the implicit press-feel readiness.
- Active: `active:scale-[0.97]` press (inherited from the cva root). The shader scales with the button — visually correct.
- Focus-visible: existing ring.
- Disabled: existing `opacity-50` + `pointer-events-none`.
- Loading: existing spinner overlay still works; it sits above the dither layer thanks to its own `absolute inset-0` stacking.

Out of scope for v1: hover-reactive `size` shifts, animated `speed`-driven drift, configurable `type` (`"2x2" | "4x4" | "8x8"`), per-call `colorSteps`. All are documented as future props in "Out of scope" below.

## Performance

Each rendered Paper shader instance consumes one WebGL context. Browsers cap at roughly 16 contexts per document. To keep the variant safe even if misused:

- **Viewport gating:** `<DitherBackdrop>` uses `useInViewport` (returns `inView: boolean` from an `IntersectionObserver` with a small root margin so the shader is mounted slightly before scrolling in). Only mounts the shader when `inView === true`. Off-screen → CSS gradient only.
- **Unmount on exit:** when `inView` flips back to `false`, the shader unmounts and releases its context. The CSS fallback remains visible underneath, so scrolling back and forth doesn't flash.
- **Documented guidance:** in the spec's usage section, call out that this variant is intended for hero CTAs and one-offs. It is safe to put one per visible viewport region; it is not safe to put one per row in a list.

No memoization or shared-context tricks beyond that for v1. If we ever need more, we revisit.

## Dependency

New workspace dependency: `@paper-design/shaders-react` (≥ 0.0.76, the version shown in Wouter's example).

Installed into `packages/frontend` only. Approved.

## i18n

No user-facing strings introduced. The variant accepts standard `Button` children, which callsites already wrap in `m.*` per the CLAUDE.md i18n rules.

## Testing

- Type-check passes with the discriminated overload (passing `ditherFrom` on `variant="primary"` is a TS error).
- Manual smoke: a sandbox route or one existing CTA temporarily switched to `variant="dither"` confirms the shader renders, scales with size variants, presses correctly, and degrades to the CSS gradient when the canvas is off-screen.
- No new unit tests — the variant is a visual primitive with no logic worth asserting in isolation.

## Out of scope (future props)

- `ditherHoverSize` / hover-reactive dither
- `ditherSpeed` for animated drift
- `ditherType: "2x2" | "4x4" | "8x8"` and `ditherColorSteps`
- Storybook / playground route (this repo has none)
- Server-side rasterized fallback richer than the CSS gradient

## Files touched

- `packages/frontend/package.json` — add `@paper-design/shaders-react` dep.
- `packages/frontend/src/components/ui/button.tsx` — add `"dither"` cva variant, extend `ButtonProps` with discriminated dither props, render `<DitherBackdrop>` when active.
- `packages/frontend/src/components/ui/button-dither.tsx` — new `<DitherBackdrop>` component.
- `packages/frontend/src/lib/use-in-viewport.ts` — new `IntersectionObserver` hook.
