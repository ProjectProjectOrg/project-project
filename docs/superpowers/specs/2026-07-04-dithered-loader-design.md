# Dithered Breathing-Fold Loader — Design

A reusable `<Loader />` preloader that animates the ProjectProject logo as a
"breathing fold" and runs it through a custom dithering shader modeled on
Paper's (Apache-2.0) `image-dithering`. Used everywhere in the app at varying
sizes; a `/dev/loader` debug page exists for fine-tuning.

## Concept & Motion

A fixed logo footprint — the perspective "book" silhouette, symmetric about the
horizontal centerline. A vertical **fold line** at normalized position
`P ∈ [0, 1]` sweeps horizontally in a calm, eased ping-pong (breathing rhythm,
`sin`-based so the loop is seamless, ~2–3s period).

`P` splits the footprint into two trapezoidal panels:

- The **fold-facing (inner) edge** has a constant short height `hShort`.
- The **outer edge** has a taller height `hTall`, pinned at the footprint edge.
- Panel height interpolates linearly across its width from `hShort` (at the
  fold) to `hTall` (at the outer edge). Everything is symmetric about the
  horizontal centerline (grows equally up and down).
- Each panel's **gradient runs white at the fold → dark at its outer edge**,
  normalized to that panel's current width so it always shows the full range.

Positions:

- `P → 0`: left panel vanishes (0 width); the right panel fills the whole
  footprint, bright at the left (fold) → dark at the right edge. This
  approximates the current static logo.
- `P = 0.5`: both panels are equal width — a symmetric, mirrored "open book,"
  brightest at the center fold, darkening to both outer edges.
- `P → 1`: mirror of the left extreme — right panel vanishes, left panel fills
  the footprint, bright at the right (fold) → dark at the left edge.

The `P = 0` and `P = 1` extremes are where the breathing eases to a stop and
reverses.

## Rendering Pipeline

Per animation frame:

1. **Geometry** — advance `P` from the breathing clock; compute the two panel
   trapezoid paths and their gradient stops.
2. **SVG layer** — build a parametric SVG from `P` (two `<path>` panels + two
   per-panel linear gradients). Derived from `docs/logo-reference.svg`,
   generalized so `P`, the heights, and the gradients are parameters.
3. **Rasterize** — draw the SVG into an offscreen `<canvas>` (via an `Image` /
   `drawImage`, or `OffscreenCanvas` where available).
4. **Dither pass** — a minimal WebGL mount running the vendored, lightly patched
   Paper `image-dithering` fragment shader, with the offscreen canvas
   re-uploaded as the `u_image` texture every frame.

The `requestAnimationFrame` loop drives steps 1–4 continuously until unmounted
or paused.

### Shader uniforms

Match the Paper source file that produced the logo look:

- `type = 2x2` (Bayer 2x2)
- `colorSteps = 2`
- `size = 20` (dither pixel size — but see Dither Density below)
- `originalColors = true`, `inverted = false`
- `colorBack = #00000000` (transparent — the loader composites over whatever is
  behind it)
- `colorFront = #94FFAF`
- `colorHighlight = #EAFF94`

## Component Boundaries

Each unit has one purpose and is independently understandable/testable.

- **`components/Loader/logo-geometry.ts`** — pure functions. Input: `P` (plus
  footprint/height constants). Output: SVG path strings and gradient stop
  offsets for both panels. No DOM, no side effects. Unit-testable.
- **`components/Loader/dither-shader.ts`** — the vendored + patched GLSL
  fragment shader string and its uniform types. Carries an Apache-2.0
  attribution header comment (the one deliberate exception to the project's
  no-comments rule, required by the license).
- **`components/Loader/DitherCanvas.tsx`** — owns the WebGL context, the
  offscreen SVG-raster canvas, and the `requestAnimationFrame` loop. Given a
  `render(P) → canvas source` and uniform props, it runs the pipeline. Handles
  context setup/teardown and resize.
- **`components/Loader/Loader.tsx`** — the public component. Composes geometry +
  `DitherCanvas`. Props: `size` (or `className`), `speed?`, `paused?`, and
  optional color overrides. Owns the breathing clock and reduced-motion
  handling.
- **`routes/dev.loader.tsx`** — debug page at `/dev/loader` exercising the
  loader across sizes, speeds, and on both light and dark backgrounds.

## Behavior Decisions

- **Palette: fixed signature look.** Transparent background plus the green /
  highlight from the Paper file, *not* theme-adaptive. It is the brand loader
  and should read consistently everywhere. Colors remain props so the debug
  page (and future callers) can override.
- **Dither density scales with rendered size.** The dither pixel size is
  proportional to the component's rendered size rather than fixed device
  pixels, so the dotted texture looks consistent from a full-screen splash down
  to a small inline spinner.
- **`prefers-reduced-motion`: park at center.** The fold parks at `P = 0.5`
  (symmetric open book) and the loop freezes — a fully static dithered mark,
  no sweep and no shimmer.
- **WebGL context budget.** Each `Loader` instance owns one WebGL context;
  browsers cap around 16 live contexts. This is fine for real usage (typically
  one loader at a time). The debug page keeps simultaneous instances to a
  modest handful.

## Testing

- **Unit tests** for `logo-geometry.ts` at `P = 0`, `0.5`, `1`:
  - `P = 0` and `P = 1` produce a zero-width panel and a full-footprint panel.
  - `P = 0.5` produces two equal-width, mirror-symmetric panels.
  - The fold-facing edge height is constant across all `P`.
  - Gradient stops span the full range regardless of panel width.
- **Visual verification** on `/dev/loader`. Per project preference, no
  Playwright / automated browser driving — the dev server stays running and a
  manual checklist is handed off for review.

## Out of Scope

- Wiring the loader into actual app load / route-transition sites. This design
  delivers the component and its debug page; adoption across the app is a
  follow-up.
- Theme-adaptive palettes and additional dither modes/presets. The props allow
  them, but only the fixed signature look is specified here.
