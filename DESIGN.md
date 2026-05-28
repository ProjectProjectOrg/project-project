---
name: ProjectProject
description: A markdown-first project management tool for engineers on a homelab.
colors:
  background: "oklch(1 0 0)"
  background-dark: "oklch(0.145 0 0)"
  foreground: "oklch(0.145 0 0)"
  foreground-dark: "oklch(0.985 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-dark: "oklch(0.269 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  muted-foreground-dark: "oklch(0.708 0 0)"
  card: "oklch(1 0 0)"
  card-dark: "oklch(0.205 0 0)"
  popover: "oklch(1 0 0)"
  popover-dark: "oklch(0.205 0 0)"
  accent: "oklch(0.97 0 0)"
  accent-dark: "oklch(0.269 0 0)"
  selected: "oklch(0.9 0 0)"
  selected-dark: "oklch(0.4 0 0)"
  border: "oklch(0.922 0 0)"
  border-dark: "oklch(1 0 0 / 10%)"
  input: "oklch(0.922 0 0)"
  input-dark: "oklch(1 0 0 / 15%)"
  ring: "oklch(0.708 0 0)"
  ring-dark: "oklch(0.556 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-dark: "oklch(0.704 0.191 22.216)"
  destructive-light: "oklch(0.95 0.02 27)"
  state-success: "oklch(0.5 0.15 135)"
  state-warning: "oklch(0.5 0.16 75)"
  state-info: "oklch(0.5 0.18 255)"
  state-merged: "oklch(0.5 0.18 285)"
  tag-quiet-anchor: "oklch(0.78 0.07 0)"
  tag-loud-anchor: "oklch(0.7 0.16 0)"
typography:
  display:
    fontFamily: "Geist Pixel, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "12px"
  md: "14px"
  lg: "16px"
  xl: "20px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.foreground}"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-tertiary-hover:
    backgroundColor: "{colors.muted}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  input-default:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
    height: "32px"
    typography: "{typography.body}"
  card-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "16px"
  sidebar-link:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    typography: "{typography.label}"
  sidebar-link-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
---

# Design System: ProjectProject

## 1. Overview

**Creative North Star: "The engineer's quiet workshop."**

ProjectProject is a markdown-first PM tool for engineers running it on a homelab. The interface borrows from Linear: tight type, generous-but-not-wasteful spacing, fast feel, no chrome bloat. Everything that isn't load-bearing is removed; everything that remains is sharpened. This is not a tool that wants to be looked at, it is a tool that wants to be _used_, and to disappear under the keystrokes.

Two visual languages run in parallel and never compete. The UI itself is **clean, type-driven, neutral** — buttons, inputs, lists, popovers — and is rendered exclusively in tinted OKLCH grays. The graphic layer is **dithered** — the logo, empty-state illustrations, brand marks, marketing surfaces, hero blocks — and speaks in a two-grey 1-bit vocabulary. The UI is the silent floor; the dithering is the signature on top.

Light and dark are first-class peers. The user lives in either at any hour; both are reviewed for every surface. Choices that only work in one theme are not done.

**Key Characteristics:**
- Neutral OKLCH chrome; chromatic color is a _user-assigned_ signal (tags), never a designer flourish.
- Dithering as the brand thread, contained to graphics — never on functional controls.
- Density without noise: information dense at rest, progressive disclosure on hover.
- Linear-grade restraint; Jira / Azure DevOps / Trello aesthetics are the explicit anti-reference.
- Sentence case everywhere. No all-caps labels, ever.
- Interaction craft (press feel, hover asymmetry, optimistic mutations) is the floor.

## 2. Colors

A tinted OKLCH grayscale carries the entire chrome. Chromatic hues exist for two reasons only: state semantics (destructive, success, warning, info, merged) and user-assigned categorical color (the tag wheel).

### Primary

There is no chromatic brand primary. The visual "primary" is **foreground** — near-black in light mode, near-white in dark — used for type, primary buttons, and the dithered logo's foreground stop.

- **Foreground** (`oklch(0.145 0 0)` light / `oklch(0.985 0 0)` dark): body text, headings, primary button surface.
- **Background** (`oklch(1 0 0)` light / `oklch(0.145 0 0)` dark): page canvas, card surfaces in light, the recessed layer under cards in dark.

### Neutral

A single OKLCH grayscale ramp. Every UI surface, border, divider, and disabled treatment lives here.

- **Card** (`oklch(1 0 0)` / `oklch(0.205 0 0)` dark): raised content surface.
- **Popover** (same as Card): floating surface under menus and pickers.
- **Muted** (`oklch(0.97 0 0)` / `oklch(0.269 0 0)` dark): page background; subtle field fills.
- **Muted Foreground** (`oklch(0.556 0 0)` / `oklch(0.708 0 0)` dark): secondary text, icon strokes at rest, placeholder text.
- **Accent** (`oklch(0.97 0 0)` / `oklch(0.269 0 0)` dark): hover surface for rows, buttons, list items.
- **Selected** (`oklch(0.9 0 0)` / `oklch(0.4 0 0)` dark): the _active_ row in tabs, dropdowns, segmented controls — stronger than accent so selection reads at a glance.
- **Border** (`oklch(0.922 0 0)` / `oklch(1 0 0 / 10%)` dark): hairline dividers and input strokes.
- **Ring** (`oklch(0.708 0 0)` / `oklch(0.556 0 0)` dark): focus ring; also the foreground stop for dithered graphics (`--dither-front`).

### Semantic State

A scarce vocabulary, used only when state needs to read at a glance.

- **Destructive** (`oklch(0.577 0.245 27.325)`): delete actions, validation failures, irreversible-action confirmations.
- **State Success** (`oklch(0.5 0.15 135)`): merged PRs, completed checks.
- **State Warning** (`oklch(0.5 0.16 75)`): pending review, attention-required.
- **State Info** (`oklch(0.5 0.18 255)`): open PRs, in-flight branches.
- **State Merged** (`oklch(0.5 0.18 285)`): merged-and-closed state.

In dark mode the state hues collapse to a single quiet treatment (`oklch(0.78 0.07 <hue>)`) so they stay legible without burning through the dim surface.

### User-Assigned (Tag Wheel)

Defined in `packages/shared/src/colors.ts`. Two OKLCH rings at fixed L/C:

- **Inner ring** — 8 swatches at `L=0.78 C=0.07`: quiet pastels for low-emphasis tags.
- **Outer ring** — 13 swatches at `L=0.7 C=0.16`: the default tag palette.

When a new feature needs categorical color the user controls (tags, statuses, labels, future taxonomies), it pulls from `TAG_COLOR_WHEEL` — never an ad-hoc hex.

### Named Rules

**The OKLCH Rule.** All color tokens are authored in OKLCH. Never `#000`, never `#fff`, never a flat HSL. Every neutral is tinted toward the brand hue (chroma 0.005–0.01 baseline).

**The User-Assigned Color Rule.** Color in the chrome is reserved for state semantics and user-assigned categories. Designers do not introduce a brand hue, do not invent ad-hoc colors, and do not tint UI panels to "give them character."

**The One-Voice Destructive Rule.** Destructive red is the single chromatic UI exception. It stays scarce: delete affordances, validation errors, confirm-irreversible bands. Never a decorative fill.

## 3. Typography

**Body / UI Font:** Geist (with `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`)
**Mono Font:** Geist Mono (with `ui-monospace, SFMono-Regular, Menlo, monospace`)
**Display / Decorative Font:** Geist Pixel — load-bearing for empty-state graphics and brand marks; never used for body or running UI.

**Character:** A single neutral sans (Geist) carries every UI surface — headings, buttons, labels, body, data — with a tight `1.125–1.2` ratio between hierarchy steps. Mono shows up the moment a value is a _literal_: IDs, branches, slugs, code, file paths, hashes. Geist Pixel is reserved for the dithered brand thread and never bleeds into running text.

### Hierarchy

- **Display** (Geist Pixel, 400, 1rem, 1.0): decorative only — empty-state captions, brand marks, occasional pixel labels. Never headlines, never body.
- **Headline** (Geist, 600, 1.5rem, 1.25, tracking -0.01em): page H1.
- **Title** (Geist, 600, 1.125rem, 1.3): section H2; ticket / project titles in a header.
- **Body** (Geist, 400, 0.875rem (`text-sm`), 1.5): default text. Prose blocks (`.prose-md`) cap line length at 65–75ch; data tables run denser.
- **Label** (Geist, 500, 0.8125rem (`text-[13px]`), 1.2): nav items, button text, form labels, chip text.
- **Mono** (Geist Mono, 400, 0.8125rem, 1.4): IDs, branches, slugs, code, anywhere "this is a literal."

### Named Rules

**The Sentence Case Rule.** No capitalized headings, subheadings, or labels — anywhere. No `uppercase`, no `tracking-wide` on rail dividers, section headers, popover titles, table column heads, pill labels, status indicators. The all-caps "Active / Planned / Completed / Tags / Recent / Status / Type" pattern is a Jira-DNA tell and is forbidden. Acronyms (PR, ID, URL) keep their natural casing inside otherwise sentence-case strings.

**The Mono-For-Literals Rule.** Geist Mono is reserved for content that is a literal token in another system — a branch name, a slug, an ID, a hash, a code fragment. Don't reach for it as a "techy" flavor; reach for it when the user could copy-paste the string into a terminal.

**The Pixel-Stays-In-Graphics Rule.** Geist Pixel is decorative-only. It supports the dithered brand thread on graphic surfaces (empty states, loading frames, brand marks). It never carries body, labels, or nav.

## 4. Elevation

The system is **flat by default**. No decorative drop shadows on rectangles, no glassmorphism, no layered glow. Depth is conveyed by:

1. **Tonal layering.** The page sits on `--muted`; cards rise to `--card` (light surfaces in light mode; near-black on near-blacker in dark). The contrast is small on purpose.
2. **Hairline borders.** A single 1px `--border` separates surfaces that share tone.
3. **Modest shadow on floating UI only.** Popovers, dropdowns, menus — anything that lifts off a surface — gets a soft small shadow (`shadow-sm` / `shadow-md`). Never on a permanent rectangle.

### Named Rules

**The Flat Rectangles Rule.** Permanent surfaces (page, panels, cards, list rows) are flat. Shadows are reserved for elements that _lift_ off the surface — popovers, dropdowns, menus, drag previews. If a card has a shadow at rest, the shadow is wrong.

**The No Decorative Lift Rule.** Drop shadows on rectangles to "give them depth" — the Jira/Trello tell — are forbidden. Depth comes from tone and hairline borders.

## 5. Components

### Buttons

The single primitive lives in `components/ui/button.tsx`, exposing variants `primary | secondary | destructive | tertiary | ghost | chip | dither` and sizes `xs | sm | md | lg | icon-*`. Shape is shared across the app via a `useShape()` context — round-rectangle by default; the same primitive can adopt other corner shapes without per-callsite styling.

- **Primary:** `bg-foreground text-background`, hover dims to `/90`, active to `/80`. Always pairs with `active:scale-[0.97]` and `transition-all duration-100`.
- **Tertiary:** transparent + hairline border + foreground text; hover fills with `--muted`.
- **Ghost:** transparent, `muted-foreground` text; hover swaps text to full foreground and fills with `--muted`. Default for icon-only chrome.
- **Destructive:** `bg-destructive text-destructive-foreground`; reserved for delete and irreversible-action confirms.
- **Chip:** inline, height-auto, `rounded-md`, tight padding — used in filter pills, segmented tabs, status chips on rows.
- **Dither:** the brand-thread variant — animated dithered backdrop. Reserved for hero / marketing surfaces, not chrome.
- **Sizes:** `xs` (h-5, 11px), `sm` (h-7, 12px), `md` (h-8, 13px, default), `lg` (h-9, 14px). Icon sizes match by height.

**Press feel:** every button scales to **97%** on `:active` with a **100–150ms** transform transition. Icon-only buttons compress the icon, not the chrome.

**Focus:** `focus-visible:ring-1 focus-visible:ring-[#6B97FF]` — the single intentional chromatic accent in chrome.

### Inputs

- **Style:** `--background` fill, 1px `--input` stroke, `rounded-md` (~14px). Padding `4px 8px`, height `32px` to match `md` button.
- **Focus:** stroke shifts to `--ring`, no glow.
- **Disabled:** `cursor-not-allowed opacity-70`.
- **Inline form pattern:** many inputs are inline-editable cells inside rows, not standalone form fields. The same input primitive composes inside `StatusEditorRow`, ticket title cells, etc.

### Cards / Containers

- **Corner Style:** `rounded-lg` (16px) for content cards, `rounded-md` (14px) for inline list rows.
- **Background:** `--card`.
- **Border:** 1px `--border`.
- **Internal Padding:** `16px` for content cards, `8–12px` for list rows.
- **Shadow:** none at rest. Never nest cards.

### Status / Tag Chips

- **Style:** colored icon glyph (16×16) at the user-assigned hue from the tag wheel, paired with a sentence-case label in `text-foreground`. No filled pill background, no border in the chip's resting state — the icon's color carries the signal.
- **Density:** chips sit at `gap-1.5` from their label; never stacked four-high on a row.

### Navigation (Settings Rail, Sidebar)

- **Style:** flat list of links, `rounded-lg` (16px) tap target, `8px 12px` padding.
- **Default:** `muted-foreground` text.
- **Hover:** `bg-accent/60`, text flips to `foreground`.
- **Active:** `bg-accent`, `font-medium`, `foreground` text. No vertical accent stripe, no colored border.
- **Press:** `active:scale-[0.97]` like every other clickable.

### Dithered Brand Surfaces

The brand mark is built from two greys (`--dither-front` and `--dither-back`) on the surface color, rendered as stepped Bayer-matrix shading. The same vocabulary extends to:
- Empty-state illustrations
- Loading frames (where the dither animates between two stops)
- Marketing / landing surfaces
- The `Button variant="dither"` backdrop
- Decorative section breaks on long-form pages

It never appears on functional controls.

### Named Rules

**The Press Scale Rule.** Every clickable button — primary, tertiary, ghost, chip, icon, sidebar link — scales to 97% on `:active` with a 100–150ms transform transition. The press needs to _land_. The only exception is when another animation already conveys the press (an inline-form trigger that morphs).

**The Hover Asymmetry Rule.** Hover (and Radix `[data-highlighted]` / `[data-selected]`) state changes are **instant on enter** and **ease out at ~150ms on exit**. Implemented as a single global rule in `styles.css`. Hover-affected elements must declare a `transition-colors` / `transition-opacity` class — without it, both directions snap.

**The Variant-Over-Local Rule.** When a one-off styled version of an existing component appears at a callsite, the response is to add a variant to the primitive, not to re-skin the component locally. Local styles compound; typed variant props keep the design language singular.

## 6. Do's and Don'ts

### Do
- **Do** use OKLCH for every color token; tint neutrals toward the brand hue (chroma 0.005–0.01).
- **Do** carry hierarchy with type weight, size, and whitespace — not borders, not chrome, not color.
- **Do** keep the dithered language in graphics (empty states, brand marks, marketing) and the clean type-driven language in chrome (buttons, inputs, rows, menus).
- **Do** use `Geist Mono` the moment a value is a literal: branches, slugs, IDs, hashes, code.
- **Do** review every surface in both light and dark before calling it done.
- **Do** pull categorical color from `TAG_COLOR_WHEEL` (`packages/shared/src/colors.ts`) when adding user-assigned color affordances.
- **Do** pair every hover-driven state change with a `transition-colors` (or `transition-opacity` / `transition-all`) class so the global asymmetric-hover rule has something to override.
- **Do** scale every clickable to 97% on `:active` with `transition-transform duration-100` (or 150ms).
- **Do** use sentence case for every heading, subheading, label, column head, pill text, and section divider.
- **Do** extend a primitive with a typed variant when you find yourself re-skinning it locally.

### Don't
- **Don't** ship anything that signals Jira, Azure DevOps, or Trello aesthetics. No colored sidebars, no tinted region panels, no multi-color status badges scattered through every list, no decorative drop shadows on rectangles, no avatars-and-metadata stacked four rows high.
- **Don't** introduce a brand hue. The chrome has no chromatic primary; chromatic color is user-assigned signal only.
- **Don't** invent ad-hoc colors when the tag wheel covers the space.
- **Don't** use `#000`, `#fff`, or any pure-grayscale HSL.
- **Don't** use `uppercase` / `tracking-wide` on labels, section headers, pill text, table column heads, or status indicators. Sentence case only.
- **Don't** use `Geist Pixel` outside of graphic surfaces (empty states, brand marks, decorative moments). Never in body, labels, nav, or running UI.
- **Don't** put drop shadows on permanent rectangles. Shadows are for elements that lift off the surface (popovers, menus, drag previews).
- **Don't** nest cards. If a card is inside a card, one of them is wrong.
- **Don't** reach for a modal as the first answer. Inline and progressive disclosure first; the project rule is zero dialogs (see PRODUCT.md).
- **Don't** use a `border-left` or `border-right` > 1px as a colored accent stripe on cards, rows, callouts, or alerts. Replace with full hairline border, background tint, or leading icon.
- **Don't** use gradient text (`background-clip: text` + gradient). Emphasis through weight and size.
- **Don't** use glassmorphism decoratively.
- **Don't** dither functional UI controls. The dithering is the signature; the chrome is silent so the signature can carry weight.
- **Don't** write decorative animations that don't convey state. Motion in product UI is for feedback, state change, loading, and reveal — nothing else.
