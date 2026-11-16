---
name: ProjectProject
description: A markdown-first project management tool for engineers on a homelab.
colors:
  background: "oklch(0.955 0 0)"
  background-dark: "oklch(0.145 0 0)"
  page: "oklch(0.982 0 0)"
  page-dark: "oklch(0.219 0 0)"
  field: "oklch(1 0 0)"
  field-dark: "oklch(0.18 0 0)"
  foreground: "oklch(0.145 0 0)"
  foreground-dark: "oklch(0.985 0 0)"
  muted: "oklch(0.945 0 0)"
  muted-dark: "oklch(0.269 0 0)"
  muted-foreground: "oklch(0.5 0 0)"
  muted-foreground-dark: "oklch(0.708 0 0)"
  card: "oklch(1 0 0)"
  card-dark: "oklch(0.205 0 0)"
  popover: "oklch(1 0 0)"
  popover-dark: "oklch(0.205 0 0)"
  accent: "oklch(0.945 0 0)"
  accent-dark: "oklch(0.269 0 0)"
  selected: "oklch(0.9 0 0)"
  selected-dark: "oklch(0.4 0 0)"
  hover: "oklch(0 0 0 / 4%)"
  hover-dark: "oklch(1 0 0 / 4%)"
  active: "oklch(0 0 0 / 7%)"
  active-dark: "oklch(1 0 0 / 10%)"
  tint: "oklch(0 0 0 / 8%)"
  tint-dark: "oklch(1 0 0 / 14%)"
  tint-hover: "oklch(0 0 0 / 6.5%)"
  tint-hover-dark: "oklch(1 0 0 / 11%)"
  border: "oklch(0.922 0 0)"
  border-dark: "oklch(1 0 0 / 10%)"
  input: "oklch(0.922 0 0)"
  input-dark: "oklch(1 0 0 / 15%)"
  ring: "oklch(0.58 0 0)"
  ring-dark: "oklch(0.556 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-dark: "oklch(0.704 0.191 22.216)"
  destructive-light: "oklch(0.95 0.02 27)"
  state-success: "oklch(0.7 0.16 135)"
  state-warning: "oklch(0.5 0.16 75)"
  state-warning-dark: "oklch(0.78 0.07 75)"
  state-info: "oklch(0.7 0.16 255)"
  state-merged: "oklch(0.7 0.16 285)"
  state-danger: "oklch(0.7 0.16 15)"
  tag-quiet-anchor: "oklch(0.78 0.07 0)"
  tag-loud-anchor: "oklch(0.7 0.16 0)"
typography:
  display:
    fontFamily: "Allo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "34px"
  title:
    fontFamily: "Allo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "22px"
  subtitle:
    fontFamily: "Allo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  body:
    fontFamily: "Allo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  caption:
    fontFamily: "Allo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  micro:
    fontFamily: "Allo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "14px"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontWeight: 400
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
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.foreground}"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.tint-hover}"
  button-tertiary-hover:
    backgroundColor: "{colors.hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.hover}"
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
    typography: "{typography.body}"
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
- **Background** (`oklch(0.955 0 0)` light / `oklch(0.145 0 0)` dark): the base layer. The app frame (sidebar, topbar) and recessed boxes sit on it.
- **Page** (`oklch(0.982 0 0)` / `oklch(0.219 0 0)` dark, `bg-page`): what every page sits on, one step up from the frame. It replaced the old `bg-region` mix: use the token, never mix one.

### Neutral

A single OKLCH grayscale ramp. Every UI surface, border, divider, and disabled treatment lives here.

- **Card** (`oklch(1 0 0)` / `oklch(0.205 0 0)` dark): raised content surface.
- **Popover** (same as Card): floating surface under menus and pickers. Every popup shares `popupSurfaceClass` (card fill, 60% hairline, no shadow, 19px squircle corners).
- **Muted** (`oklch(0.945 0 0)` / `oklch(0.269 0 0)` dark): wells and placeholders, one clear step off the page in both themes.
- **Muted Foreground** (`oklch(0.5 0 0)` / `oklch(0.708 0 0)` dark): secondary text, icon strokes at rest, placeholder text. Holds 4.5:1 on every surface, pressed rows included (lowest: 4.6:1 on the light frame under `--active`).
- **Accent** (`oklch(0.945 0 0)` / `oklch(0.269 0 0)` dark): the active item in a rail or sidebar. Not a hover fill — hover uses the overlays below.
- **Selected** (`oklch(0.9 0 0)` / `oklch(0.4 0 0)` dark): opaque selection fill for places that still need one. Menus mark their checked row with `--active` and segmented controls use a raised pill instead (see Surface context).

### Interaction overlays

Hover, pressed, and the secondary button are **translucent overlays**, not opaque greys, so they read correctly on any surface — the page, a settings group, a board card, a menu. `--overlay` direction flips per theme: black on light, white on dark.

- **Hover** (`--hover`, 4% black / 4% white): `bg-hover` for every hover fill — rows, tertiary and ghost buttons, select triggers, menu highlights, the segmented track.
- **Active** (`--active`, 7% / 10%): `bg-active` for pressed states and a menu's checked row.
- **Field hover and focus** (`--field-hover` 2.5% / 3%, `--field-focus` 1.5% / 2%): every field: Input and InputGroup, Select and other `field` buttons (over their `--field` fill, as an inset shadow), and bare fields in running text (composer titles and descriptions, the ticket title, in-place names). Lighter than a control's `--hover`, and focus (or an open picker) lighter still, so it reads as "you are here".
- **Tint** (`--tint` 8% / 14%, `--tint-hover` 6.5% / 11%): the see-through secondary button fill.

Never use `--muted` or `--accent` as a hover fill: on a raised surface they land at the surface's own tone and the hover disappears.
- **Border** (`oklch(0.922 0 0)` / `oklch(1 0 0 / 10%)` dark): hairline dividers and input strokes.
- **Ring** (`oklch(0.58 0 0)` / `oklch(0.556 0 0)` dark): focus ring, at least 3:1 against the frame, page and cards. Dithered graphics keep their own `--dither-front` (`0.708` light).
- **Control outlines** (`--checkbox-ring*`, `--prose-check-ring`, `--switch-thumb-off`): at least 3:1 against what they sit on (WCAG 1.4.11). The floor is about 43% black in light and 34% white in dark.

### Semantic State

A scarce vocabulary, used only when state needs to read at a glance.

- **Destructive** (`oklch(0.577 0.245 27.325)`): delete actions, validation failures, irreversible-action confirmations.
- **State Success** (`oklch(0.7 0.16 135)`): open PRs, passing checks.
- **State Warning** (`oklch(0.5 0.16 75)` / `oklch(0.78 0.07 75)` dark): pending review, attention-required.
- **State Info** (`oklch(0.7 0.16 255)`): in-flight branches, active sprints.
- **State Merged** (`oklch(0.7 0.16 285)`): merged-and-closed state.
- **State Danger** (`oklch(0.7 0.16 15)`): failed checks, blocked work.

Success, info, merged and danger sit on the tag wheel's outer ring (`L=0.7 C=0.16`) and keep the same value in both themes. Warning is the exception: amber at that lightness is unreadable on white, so light mode uses a darker, more saturated swatch. The values live in `packages/ui/src/styles/theme.css`.

### User-Assigned (Tag Wheel)

Defined in `packages/shared/src/colors.ts`. The colour picker (`TAG_COLOR_WHEEL`) offers 22 colours, laid out as a honeycomb:

- **Strong** — 12 swatches at `L=0.7 C=0.16`, every 30° from 15°: the default palette.
- **Soft** — 6 swatches at `L=0.78 C=0.07`, on the hues between the strong ones: quiet pastels for low-emphasis tags.
- **Neutral** — 4 greys at `L` 0.45, 0.66, 0.84 and 0.98.

`STORED_COLORS` also accepts the earlier 8-swatch soft ring, which saved tags, statuses and templates may still use. When a new feature needs categorical color the user controls (tags, statuses, labels, projects, future taxonomies), it pulls from `TAG_COLOR_WHEEL` — never an ad-hoc hex.

### Named Rules

**The OKLCH Rule.** All color tokens are authored in OKLCH. Never `#000`, never `#fff`, never a flat HSL. Every neutral is tinted toward the brand hue (chroma 0.005–0.01 baseline).

**The User-Assigned Color Rule.** Color in the chrome is reserved for state semantics and user-assigned categories. Designers do not introduce a brand hue, do not invent ad-hoc colors, and do not tint UI panels to "give them character."

**The One-Voice Destructive Rule.** Destructive red is the single chromatic UI exception. It stays scarce: delete affordances, validation errors, confirm-irreversible bands. Never a decorative fill.

## 3. Typography

**Body / UI Font:** Allo, at roundness 0 (`ROND` 0, crisp terminals) (with `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`)
**Mono Font:** Geist Mono (with `ui-monospace, SFMono-Regular, Menlo, monospace`)
**Character:** A single neutral sans (Allo) carries every UI surface — headings, buttons, labels, body, data — on a tight scale: the working sizes sit 1–2px apart, with one jump to the page title. Mono shows up the moment a value is a _literal_: IDs, branches, slugs, code, file paths, hashes.

### Hierarchy

Six roles, sizes / line heights in px, each with a compact size for dense places (comments, previews, popovers):

- **Display** (600, 28 / 34; compact 24 / 30): page titles.
- **Title** (600, 16 / 22; compact 15 / 20): section headings, a panel's title.
- **Subtitle** (600, 14 / 20; compact 13 / 18): sub-sections, a card's title.
- **Body** (400, 13 / 20; compact 12 / 18): running text, rows, controls. Prose blocks (`.prose-md`) cap line length at 65–75ch; data tables run denser.
- **Caption** (12 / 16; compact 11 / 14): meta, hints, chips.
- **Micro** (11 / 14; compact 10 / 12): counts, keys, the smallest labels.
- **Prose** (`.prose-md`): long-form markdown on the type roles. Body text is `body` at 80% foreground (`--prose-body`) so headings, bold and inline code carry the hierarchy at full foreground. Headings get 8px below and 20–24px above.
- **Mono** (Geist Mono, 400, at the size of the text around it): IDs, branches, slugs, code, anywhere "this is a literal."

Weights: 400 for text, 550 (`--font-weight-semibold`) for headings and anything selected, 700 only for emphasis inside text.

Inline links strengthen their underline on hover without a background fill; keyboard focus retains a visible outline. Favicons keep their original colors. Confirmed transparent monochrome symbols follow the active theme with a dark silhouette in light mode and a light silhouette in dark mode. Favicons have no backing tile or added padding.

### Named Rules

**The Sentence Case Rule.** No capitalized headings, subheadings, or labels — anywhere. No `uppercase`, no `tracking-wide` on rail dividers, section headers, popover titles, table column heads, pill labels, status indicators. The all-caps "Active / Planned / Completed / Tags / Recent / Status / Type" pattern is a Jira-DNA tell and is forbidden. Acronyms (PR, ID, URL) keep their natural casing inside otherwise sentence-case strings.

**The Mono-For-Literals Rule.** Geist Mono is reserved for content that is a literal token in another system — a branch name, a slug, an ID, a hash, a code fragment. Don't reach for it as a "techy" flavor; reach for it when the user could copy-paste the string into a terminal.

## 4. Elevation

The system is **flat by default**. No decorative drop shadows on rectangles, no glassmorphism, no layered glow. Depth is conveyed by:

1. **Tonal layering.** Three layers, in the same order in both themes: the frame (`--background`), the page one step up (`--page`), and cards, popups and fields above it (`--card`, `--field`). Light: `0.955 → 0.982 → white`. Dark: `0.145 → 0.219`, with cards at `0.205`. The steps are small on purpose.
2. **Hairline borders.** A single 1px `--border` separates surfaces that share tone.
3. **No shadows on popups.** Popovers, dropdowns, selects, context menus and hover cards share `popupSurfaceClass`: card fill plus the 60% hairline, nothing else. The hairline and the tonal step separate them from the page.

### The surface ladder

Tonal layering runs out of room in light mode: once a surface reaches `--card` there is nothing lighter than white to stack on top of it, so a card nested in a light container goes invisible. The `--surface-1` … `--surface-8` ladder (ported from `@fluid/surfaces`, re-authored in OKLCH) is the answer, available as `bg-surface-N` / `shadow-surface-N`.

**Both themes must layer the same way.** A container that recesses in dark recesses in light too, by a comparable perceptual amount. Concretely, against the page (`--page`: `0.219` dark, `0.982` light):

|                               | dark               | light              |
| ----------------------------- | ------------------ | ------------------ |
| page                          | `0.219`            | `0.982`            |
| `--surface-1` — recessed well | `0.205` (`-0.014`) | `0.955` (`-0.027`) |
| `--surface-3` — raised card   | `0.264` (`+0.045`) | `1.000` (`+0.018`) |

The container steps **down** off the page and the card steps **up** out of the container, in both themes. Light's upward step is necessarily smaller because white is a hard ceiling, but it stays the same order of magnitude — not the near-flat `0.003` that fluid's stock light ladder would give.

Fluid ships light as two hairline steps then flat white, leaning on shadow for everything above `--surface-3`. That suits a shadow-driven system; it does not suit ours, because our dark mode separates tonally and the two themes would stop behaving alike. The light values here are widened deliberately so they don't.

Use the ladder when a surface must sit on another surface — board columns and their cards. A standalone card on the page canvas still uses `--card` plus a hairline `--border`; don't reach for the ladder where a single tonal step already reads.

`--shadow-1` is `0 0 0 1px` at 6% black with no offset and no blur: it is a **hairline drawn as a ring**, not a lift. Preferring it over a real `border` keeps the element borderless in layout terms — no box-sizing shift, no extra px in a dense row — which is why board cards use it.

### Surface context

Components that **elevate** read the surface level they sit on instead of hard-coding one (`useSurface()` / `SurfaceProvider` from `lib/surfaceContext`, class lookups from `lib/surfaceClasses`, both from `@fluid`). The page is level 1; a container that raises itself re-provides its own level so anything inside keeps stepping up.

- **`SettingsGroup`** uses `--card` and provides level 1. In dark that is a recessed well (`0.205`, the same value as `--surface-1`), so the controls inside lift out of it instead of stacking a card on the already-raised page. In light it is a white card: a grey well on the light page reads muddy, so this is the one deliberate exception to layering both themes the same way.
- **Segmented pill:** the `bg-tint` fill with a 1px `--segment-line` hairline (5% ink in light, 6% in dark), no shadow; the inline and rail pills keep their raised surface fill with the same hairline. Track and pill use squircle corners at a full radius, concentric (18px around 14px for the default variant), and the track sizes to its options.
- **Dragged list row:** substrate + 1 while it is being dragged.
- **Menus and popovers** keep `--card` with the 60% hairline (`popupSurfaceClass`) and no shadow. A deliberate choice: the card fill reads better here than a substrate + 2 lift.

Everything that only changes state on hover or press uses the overlays instead and needs no surface level.

### Named Rules

**The Flat Rectangles Rule.** Permanent surfaces (page, panels, cards, list rows) are flat. Shadows are reserved for elements that _lift_ off the surface — popovers, dropdowns, menus, drag previews. If a card has a shadow at rest, the shadow is wrong. A zero-offset, zero-blur ring (`--shadow-1`) is not a shadow for the purposes of this rule — it is a hairline, and it is allowed at rest. `--shadow-2` and above add real offset and blur, so they stay off permanent rectangles.

**The No Decorative Lift Rule.** Drop shadows on rectangles to "give them depth" — the Jira/Trello tell — are forbidden. Depth comes from tone and hairline borders.

## 5. Components

Icons are Hugeicons (free set, stroke rounded) behind one module, `@pp/ui/icons`: every icon the app uses is exported there once, under a plain name (`Plus`, `X`, `GitBranch`), and `lucide-react` is banned. A missing icon is added to that module, by picking the closest Hugeicons glyph or drawing one on its 24px grid with `icon()`. Strokes are 1.5, set in `theme.css` (`svg[data-icon]`) so a width on the svg (a highlighted row's 2) reaches every shape. Filled status dots keep their zero-width stroke.

### Buttons

The single primitive lives in `packages/ui/src/components/button.tsx`, exposing variants `primary | secondary | tertiary | destructive | ghost | dither`, plus two special cases: `toolbar` (pairs with the gliding fluid-hover highlight, so it has no hover fill of its own) and `overlay` (an opaque background-coloured button for actions on images and media; `tone="destructive"` turns its hover red). Layout-only variants (`appearance-row`, `selection-card`, `dropzone`, `artwork-option`, `image-option`) are separate. Anything else is a ghost with a `className`, not a new variant and sizes `xs | sm | md | lg | icon-*`. Shape: corners at half the button's height (`xs` 10px … `lg` 18px) with `corner-shape: var(--button-corner)` (`superellipse(1.5)`, between a squircle and a pill), baked into the primitive so callsites never set it.

Filled variants (primary, secondary, destructive) share `.button-fill` in the theme: a faint vertical sheen made from the fill's own colour with `color-mix(in oklab)` (`--button-sheen-top` / `--button-sheen-bottom`), shown at rest, gone on hover, a little stronger on press. An optional edge in the fill's colour (`--button-edge`) is off. No borders, no shadows.

- **Primary:** foreground fill, background text; hover mixes 10% background in, press 18%.
- **Secondary:** see-through `--button-secondary` (5% black / 11% white), stronger on hover and press. It takes on whatever surface it sits on.
- **Tertiary:** a tile one step up the surface ladder (`surface + 2`), no border, foreground text; hover and press lay `--hover` / `--active` over it. For row actions in settings groups (Disconnect, Change, Refresh). Directly on the page (no `SurfaceProvider`) that step is too faint, so it takes `--button-tertiary`, half of secondary's tint (2.5% / 5%).
- **Ghost:** transparent, no fill at rest; `bg-hover` on hover. `tone="muted"` (default) has `muted-foreground` text that turns full foreground on hover — default for icon-only chrome and page chrome like Back. `tone="strong"` has full foreground text — for inline triggers that show a value, such as ticket fields (status, sprint, assignee). Fields switch to muted while they are empty. At `md` ghost uses 10px padding (8px on the icon side), tighter than filled buttons. A ghost with `aria-pressed` shows the pressed state (`bg-active`, full foreground text), which covers toggles.
- **Destructive:** tonal — `--destructive` text on `--destructive-light`, deepening by 10% / 16% on hover / press; reserved for delete and irreversible-action confirms.
- **Dither:** the brand-thread variant — animated dithered backdrop. Reserved for hero / marketing surfaces, not chrome.
- **Sizes:** `xs` (h-5, 11px), `sm` (h-7, 12px), `md` (h-8, 13px, default), `lg` (h-9, 14px). Icon sizes match by height.

**Press feel:** every button scales to **97%** on `:active` with a **100–150ms** transform transition. Icon-only buttons compress the icon, not the chrome.

**Focus (every interactive component):** the `focus-ring` class from the `@pp/ui` theme — a 2px `--ring` (grey) outline standing 2px off the element, following its corners. It does not move on press. No glow, no box-shadow ring.

**Disabled:** `cursor-not-allowed` at 50% opacity, with hover and press styles switched off. **Loading** is disabled too but stays at full strength with `cursor-progress` and the logo loader in place of the label.

**Icon padding:** a button with a leading or trailing icon gets ¾ of the text-side padding on the icon side (`md` 12px vs 16px, `sm` 9px vs 12px, `lg` 15px vs 20px; chips 8px vs 10px), so the content reads as centred.

### Value changes

**The Text Swap Rule.** When a control shows a value the user just changed, the change plays through `TextSwap` (`@pp/ui/text-swap`, built on [Scritto](https://scrit.to)): the letters the old and new value share stay put, the rest roll out and in glyph by glyph, and the control's width eases to fit. An icon beside the value crossfades with it (`icon`). Normal changes run on `transitions.morph` (260ms); a tooltip moving to the next button uses `speed="fast"` (`transitions.presence`, 180ms). Scritto shows the value to screen readers as a labelled image, which isn't announced when it changes, so a line whose change should be read out passes `announce`. This covers every select value (`SelectTrigger` does it on its own), toggle labels like Subscribe, renamed tags and tooltip labels.

### Inputs

- **Style:** `--field` fill (`bg-field`: white in light, `oklch(0.18 0 0)` in dark, just below the page so a field reads as a shallow well), 1px `--border` stroke. Variants `default` and `bare`; sizes `sm` / `md` / `lg` at 28 / 32 / 36px, the same heights as Button, with corners at half the height in `--button-corner`. Every field-like control (Select and dropdown triggers, textareas, date pickers) uses the same `--field` fill.
- **Focus:** the shared `focus-ring` (2px `--ring` outline, 2px off the field); red on `aria-invalid`.
- **Disabled:** `cursor-not-allowed` at 50% opacity.
- **Inline form pattern:** many inputs are inline-editable cells inside rows, not standalone form fields. The same input primitive composes inside `StatusEditorRow`, ticket title cells, etc.

### Cards / Containers

- **Corner Style:** `rounded-lg` (16px) for content cards, `rounded-md` (14px) for inline list rows.
- **Background:** `--card`.
- **Border:** 1px `--border`.
- **Internal Padding:** `16px` for content cards, `8–12px` for list rows.
- **Shadow:** none at rest. Never nest cards.

### Board keyboard navigation

Sprint and backlog boards have one Tab entry point and remember the last focused card. Up and Down move within a column; Up from the first card reaches its header. Left and Right move between columns, including empty and collapsed columns. Home and End reach the first and last loaded cards in a column. Enter opens the focused ticket or activates the header action. F2 enters the card’s controls, where Tab follows their visual order; Escape returns to the card. Column retry actions are available through F2 on the header. Shift+F10 opens the ticket context menu. Popup controls keep their own keyboard behavior, and leaving the board never traps focus. Reorder mode keeps its existing controls.

### Menus and Pickers

Two primitives share one look. Pick by where the trigger lives, not by how many options there are:

- **`Select`** (`packages/ui/src/components/select.tsx`, Base UI Select): field-style pickers — forms, settings rows, the View options panel (`OptionPicker`), Jira mapping. Real `combobox`/`option` roles, anchored to its trigger, flips at the viewport edge, typeahead, `multiple` when needed. The trigger is the bordered field look; `selectedLabel` overrides what it shows.
- **`DropdownMenu`** (Base UI Menu): actions, and pickers opened from an inline chip, button, or hitbox (ticket fields, role badges, org switcher, toolbar filters), plus pickers that mix choices with actions (Status's "Manage statuses", Estimate's "Clear"). Choices are `DropdownMenuRadioItem` / `DropdownMenuCheckboxItem`, never a plain item with a hand-drawn `<Check>`.

Shared rules, all from `packages/ui/src/components/menu-styles.ts`:

- **Chrome:** popup 19px squircle (`corner-shape: var(--button-corner)`, concentric with the 14px row highlight 5px in), `border-border/60`, `bg-card`, `p-1`, no shadow. Rows `rounded-md`, 36px (`leading-5`), whatever the app shape is.
- **Rows are flush, fills are inset.** No layout gap between rows, so the hover highlight glides from one to the next. Each row's fill is clipped 1px inside a transparent `border-y`, and `MenuHighlight` insets the same 1px, which leaves an even 2px visual gap between a hovered and a selected row.
- **The highlight lives in the scroller.** `MenuHighlight` is positioned inside whichever element scrolls, so it moves with its row natively instead of being re-measured. The popup hosts one; a scrolling `DropdownMenuList` hosts its own, and each host tracks only its own items.
- **Selected:** `bg-active` plus a check in a trailing slot every row reserves, so nothing shifts when the selection moves.
- **Trailing meta** (counts, shortcuts): `menuItemMetaClass` with `data-menu-meta`. Plain muted tabular numbers, right-aligned, sitting just before the check slot so they line up as a column.
- **Reset options** ("All types", "Any sprint", "Don't move"): `separated` on the item renders the menu's own separator after it. Don't hand-place separators for this. A separator that ends up first or last in its list hides itself.
- **Filtering:** `<DropdownMenu filterable>` with `DropdownMenuInput`, `DropdownMenuList`, and `DropdownMenuEmpty` (Base UI 1.9 menu filtering). The input sits inside the popup padding like a row. Give items a `label` when their children aren't plain text.
- **Icon grids:** `IconGridPicker` (`packages/ui/src/components/icon-grid-picker.tsx`) on `Popover`.

### Status / Tag Chips

- **Style:** colored icon glyph (16×16) at the user-assigned hue from the tag wheel, paired with a sentence-case label in `text-foreground`. No filled pill background, no border in the chip's resting state — the icon's color carries the signal.
- **Density:** chips sit at `gap-1.5` from their label; never stacked four-high on a row.

### Navigation (Sidebar, Settings Rail)

- **Shape:** the sidebar is two columns from `@pp/ui/sidebar`: a 56px rail of places on the left and a panel beside it. The app composes them in `components/shell/sidebar/`; don't hand-roll nav links.
- **Rail:** the logo on top opens the organization switcher. Then Dashboard, a separator, one tinted tile per project you can see (sorted by name, the tile's tint built from the project colour) and New project, which opens the cmd+k create-project page. Search (cmd+k) and your avatar sit at the foot. Every item shows its name as an ink tooltip on the right. Clicking a project tile keeps the section you are in (Backlog, Sprints, About, a settings section).
- **Active Bar:** the active rail item gets a 3px foreground bar on the rail's left edge that slides between items. This is the one approved exception to "no vertical accent stripe": it marks a place on the rail, never a row, card or callout. Dashboard is active on the org dashboard and All projects; a project's tile is active on any route inside that project, settings included.
- **Panel:** a header with the scope's name (a project's header carries its colour as a dither wash and shows the running sprint with its countdown, or the project key), then the rows. A project shows Backlog, Sprints, About and Settings; the Dashboard shows Overview, All projects, Settings and every project's pins under a caption per project. When the scope changes the panel slides its content up or down, following the rail.
- **Rows:** 32px, `muted-foreground` text; one `bg-hover` highlight per panel glides between rows (`useFluidHover` + `FluidHoverHighlight`); the current page gets the `bg-accent` fill and semibold text. Only one row is active at a time: a pinned row for the page you are on wins over the place it was opened from. A row that swaps the panel to a sub-page (Settings) shows a trailing chevron.
- **Pinned:** a project's panel ends with its pins (tickets with their status icon and id, sprints with their state icon). The ticket or sprint you are on but haven't pinned shows first as a live row, outlined and with its pin button always visible; pinning turns it into a pinned row in place with a short accent flash. Hover a pinned row to unpin it. Pin and unpin are instant.
- **Project rows** are places, never items: Backlog, Sprints, then About. While a sprint is running, Sprints has one sub-row beside a guide line: Current, the running sprint's board with its countdown. A ticket page lights the row it was opened from: a ticket link from a sprint (board or list) carries `sprint` in its search, which also puts the sprint in the breadcrumb; any other ticket lights Backlog.
- **Settings** is a sidebar mode, not a page rail: on any settings route the panel swaps to `SettingsSidebar` (`components/shell/settings/SettingsSidebar.tsx`), built from `SettingsRailNav` / `SettingsRailLink` in `SettingsRail.tsx`, sliding forward in and back out. The rail stays. Settings pages render no nav of their own.
- **Account menu:** the avatar at the foot of the rail opens the one user menu: Settings, Theme, Send feedback, Copy version, Sign out. There is no top-right avatar menu.
- **Press:** `active:scale-[0.97]` like every other clickable.

### Settings Pages

**A setting lives where its scope is.**

- **Profile** is just you, everywhere: account, preferences, connections that act as you, agent tokens.
- **Organization** is shared setup every project relies on, managed by admins: members, integrations (GitHub App, storage with its files, email), the ticket types every project shares.
- **Project** is how this project works, managed by PMs: appearance, team, workflow, ticket types on top of the organization's, and integration *links* (which repo, which board). A project screen never sets up a shared service; when a prerequisite is missing it points to where that service is set up.

Every settings area — organization, project, profile — uses the same rail and the same page anatomy (`components/shell/settings/`):

- **`SettingsLayout`:** the one layout for every settings area. A page route declares its title and one-line description with `settingsPage(title, description)` in its loader (which also sets the crumb); the layout shows the deepest one, then sections at `gap-8`. A page without one (an integration detail with its own header) shows none. Full width up to `96rem`, then centered, so ultra-wide screens settle into a column without squeezing layouts designed for width.
- **`SettingsSection`:** a 13px/500 title and optional 12px muted description, outside the group. Optional when a section is a single obvious row.
- **`SettingsGroup`:** the only container on a settings page — `--card` (recessed in dark, white in light), 1px `--border`, `rounded-lg`, hairline dividers, no shadow. Lists (statuses, members, agents) and appearance cards use the same surface.
- **`SettingsRow`:** label and description left, control right, `min-h-14`. `layout="stacked"` puts a wide control (editor, credential form) underneath. Controls that need an accessible name read the row's ids via `useSettingsRow()`. A failed save shows as a one-line error inside the row, never a full `ErrorPage` — that is reserved for failed reads.
- **Controls size themselves.** The page never caps width to tame a control; an input inside a row gets its own width.
- **Hover only on click targets.** A row you can't click (a status row, an informational row) has no hover fill; its controls carry their own.

### Composers

A composer (new ticket, sub-ticket, new sprint, archive, flag, feedback) is a popover form in two zones. The card holds the writing: an optional context line, the title, the body. Below it, a tray tinted `--composer-tray` (halfway between `--card` and `--background`) holds everything that isn't writing: field chips (28px), then a row with a hint at the start and the actions at the end. Text starts 16px in throughout; the tray's buttons sit 6px from its edges, and the popover's 20px corners are concentric with them. Parts own their spacing (`@pp/ui/composer`); call sites never pad them.

### Dithered Brand Surfaces

The brand mark is built from two greys (`--dither-front` and `--dither-back`) on the surface color, rendered as stepped Bayer-matrix shading. The same vocabulary extends to:

- Empty states: every `Empty` sits in a dithered well with a random seed, so no two wells look alike. Its density is fixed; `intensity` only changes the ink: `--dither-front-subtle` (55% toward `--dither-back`), `--dither-front`, or `--dither-front-strong` (25% toward `--foreground`). Empty states use an icon tile, never a custom illustration.
- Loading frames (where the dither animates between two stops)
- Marketing / landing surfaces
- The `Button variant="dither"` backdrop
- Decorative section breaks on long-form pages
- Generated member avatars: a member without a photo gets a dithered orb seeded by their user id (`packages/ui/src/lib/orbAvatar.ts`, rendered by `@pp/ui/member-avatar`). Its five tones are three tag-wheel swatches at 20–56% opacity: the member's own swatch for highlights, an accent 90–240° away for the body, and a third hue for the deepest shadow. Being translucent over the surface, it reads as pastel in light mode and as deep tones in dark mode. Initials use the accent hue at L 0.3 (light) or L 0.97 (dark), at least 5:1 on every tone in both themes. Initials (two letters) show from 24px up; in a stack they centre in the part the cutout leaves visible. Below 24px the orb shows alone, so a 16px or 20px avatar must always have the member's name next to it; where there's no room for the name, use 24px or larger. Avatars are squircles (`corner-shape: squircle`, circle fallback) with a lit edge: a 1px `--avatar-edge` hairline plus an `--avatar-lit` top highlight, no drop shadow. Stacks cut a squircle gap out of each avatar (`--avatar-squircle` mask) so the translucent orbs never show through each other.

It never appears on functional controls.

### Named Rules

**The Press Scale Rule.** Every clickable button — primary, tertiary, ghost, chip, icon, sidebar link — scales to 97% on `:active` with a 100–150ms transform transition. The press needs to _land_. The only exception is when another animation already conveys the press (an inline-form trigger that morphs).

**The Hover Asymmetry Rule.** Hover (and Radix `[data-highlighted]` / `[data-selected]`) state changes are **instant on enter** and **ease out at ~150ms on exit**. Implemented as a single global rule in `styles.css`. Hover-affected elements must declare a `transition-colors` / `transition-opacity` class — without it, both directions snap.

**The Relative States Rule.** Hover, pressed, and secondary fills are overlays (`bg-hover`, `bg-active`, `bg-tint`); only things that elevate read the surface level. A fixed grey for a state is wrong the moment the control lands on a different surface.

**The Variant-Over-Local Rule.** When a one-off styled version of an existing component appears at a callsite, the response is to add a variant to the primitive, not to re-skin the component locally. Local styles compound; typed variant props keep the design language singular.

**The Hide-or-Disable Rule.** A control the viewer's role can never use is not rendered. A control the viewer may use in principle but that the current state blocks (a completed sprint, the last PM, a pending save) is rendered disabled. Role gates read from `useProjectActor` / `useOrgActor`; nothing else decides who may do what.

**The One Ticket Row Rule.** A ticket in a list is always the shared ticket row, wherever the list lives — backlog, sprint, epic grouping, an epic's sub-tickets, the dashboard. It looks and behaves the same everywhere: status, priority, ID, epic prefix and title, git, estimate, sprint, assignee, context menu (right-click or Shift+F10). Keyboard focus starts on the whole row, then follows its controls from left to right. A list may leave out only what its container already says (the epic prefix inside that epic's own list or section); it never drops a control or builds its own row. New row behaviour goes into the row, so every list gets it at once.

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
- **Don't** put drop shadows on permanent rectangles. Shadows are for elements that lift off the surface (popovers, menus, drag previews).
- **Don't** nest cards. If a card is inside a card, one of them is wrong.
- **Don't** use a modal dialog. The project rule is zero dialogs apart from the cmd+k menu (see PRODUCT.md): cmd+k actions stay in cmd+k, and page buttons and menus open popovers. Inline and progressive disclosure first.
- **Don't** use a `border-left` or `border-right` > 1px as a colored accent stripe on cards, rows, callouts, or alerts. Replace with full hairline border, background tint, or leading icon.
- **Don't** use gradient text (`background-clip: text` + gradient). Emphasis through weight and size.
- **Don't** use glassmorphism decoratively.
- **Don't** dither functional UI controls. The dithering is the signature; the chrome is silent so the signature can carry weight.
- **Don't** write decorative animations that don't convey state. Motion in product UI is for feedback, state change, loading, and reveal — nothing else.
