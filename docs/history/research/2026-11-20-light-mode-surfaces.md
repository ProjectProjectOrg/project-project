# Light mode surfaces (2026-11-20)

Light mode didn't layer the way dark does. Dark shows height by lightness: frame `0.145`, page `0.219`, popup `0.29`, a popup opened from a popup `0.33`. Light had the page at `0.982`, and everything above it (cards, popups, nested popups, surfaces 3 to 8) was `1.0`, so they read as one surface and only their hairlines told them apart.

## What other systems do

- **Material 3** dropped elevation overlays for tone-based "surface containers": the base is the lightest, and containers step *down* from it. Height is shown by shadow, not tone.
- **Linear** generates both themes from a base colour, an accent and a contrast value in LCH, with separate elevations for background, panels, dialogs and modals; in light the contrast adjustment runs the other way.
- **Atlassian and most dark-mode guides**: dark lifts surfaces with lightness because shadows vanish on dark; light uses shadows, sometimes with tone. Inverting one theme to get the other is the common mistake.

Sources: [Linear: how we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui), [Material: tone-based surfaces](https://material.io/blog/tone-based-surface-color-m3), [Atlassian elevation](https://atlassian.design/foundations/elevation).

## Directions compared in the app

Each was a set of token overrides, switchable live in the app and compared against dark:

1. **Headroom** (chosen): today's light with the base lowered about `0.015` (rail `0.912`, frame `0.94`, page `0.968`) so cards and popups step up to `0.99` and a nested popup to `0.996`. Nothing lands on pure white.
2. **Matched steps**: the same perceptual distance between layers as dark (page `0.945`). The closest match to dark; reads as a grey desk.
3. **Cool slate**: Headroom's ladder in a faint blue-grey (hue 255, chroma `0.009`), ink included.
4. **Warm paper**: Headroom's ladder in a faint warm hue (80), softer ink.
5. **Lit from above**: white page, containers and fields recessed below it, popups lifted by a soft shadow with a shaded bottom edge (dark's top light, translated). Breaks the no-shadow rule for popups.

Headroom was picked because it keeps light's direction (up is lighter), keeps the chrome neutral, and needs no shadows. Popups first sat at pure white; that read too bright, so the top of the ladder stops at `0.99`.
