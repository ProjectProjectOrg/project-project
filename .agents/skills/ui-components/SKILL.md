---
name: ui-components
description: Add, change, polish or document a design-system primitive in packages/ui (@pp/ui) and its page in the component gallery. Use for any work on packages/ui/src/components, a new shadcn or Fluid Functionalism component, a gallery page or demo, or the polish loop for a component.
---

# Maintaining `@pp/ui` and its gallery

`packages/ui` holds every design-system primitive the app uses, plus a gallery that documents them. The gallery is built from `@pp/ui` itself, modelled on Base UI's docs: one MDX page per component with plain React demo files.

## Where things live

| Path | What |
| --- | --- |
| `packages/ui/src/components/<name>.tsx` | The primitive, kebab-case. Imported in the app as `@pp/ui/<name>` |
| `packages/ui/src/lib/*`, `src/hooks/*` | Helpers (`cn`, `springs`, `typeScale`, `useFluidHover`, …), imported as `@pp/ui/lib/*` and `@pp/ui/hooks/*` |
| `packages/ui/src/editor/**` | The Markdown editor (Lexical) and everything in it: `lexical-editor.tsx`, read-only `markdown.tsx`, and folders per part (`slash-menu/`, `mentions/`, `blocks/` for sections, `attachments/`, `figma/`, `paper/`, `links/`). Imported as `@pp/ui/editor/<path>`; `.tsx` modules need an entry in `package.json` exports (regenerate them when adding one) |
| `packages/ui/src/editor/messages.ts`, `services.tsx` | The editor's strings (`provideEditorMessages(m)`, called once by the app; `m` from this module in editor code) and its app data (`EditorServicesProvider`: mention search, uploads, Figma links, link previews, navigation). The app's side is `apps/frontend/src/features/editor/AppEditorServices.tsx` |
| `packages/ui/src/styles/prose.css`, `blocks.css` | The Markdown body (`.prose-md`, `.lexical-content`) and sections (`.ticket-block`, the gutter), imported by `theme.css` |
| `packages/ui/src/styles/theme.css` | Every token: colours (light and `.dark`), state colours, type scale, radii, easings (`ease-standard`, `ease-spring`), fonts, global hover and press rules |
| `packages/ui/src/assets/` | Brand assets (the logo and wordmark), exposed as `@pp/ui/assets/*` |
| `packages/ui/docs/components/<name>/page.mdx` | The component's gallery page |
| `packages/ui/docs/editor/<name>/page.mdx`, `docs/editor/kit.tsx` | The Editor group's pages; every demo wraps itself in `<EditorKit>` (English messages and sample services). Sample attachments are served from `gallery/public/api/attachments/demo/` |
| `packages/ui/docs/patterns/<name>/page.mdx` | A pattern's page: a composition of primitives (Confirm button), in the gallery's Patterns group |
| `packages/ui/docs/components/<name>/demos/*.tsx` | Its demos, one default-exported component per file |
| `packages/ui/gallery/` | The gallery app itself: sidebar, search, theme switch, demo frame, accessibility check |
| `packages/ui/components.json` | shadcn CLI config; registry installs land in `packages/ui` |

The gallery (http://localhost:6006) starts with the app on `bun run dev` from the root, or alone with `bun run dev:gallery` (or `bun run gallery` in `packages/ui`).

## Rules for primitives

1. **No translations, no English defaults.** Every visible or spoken string is a prop (`closeLabel`, `cancelLabel`, `keyLabels`, …), required unless leaving it out renders nothing. The app passes its Paraglide messages. Never import `@/paraglide`, and never give a string prop a default. The editor is the one exception to "a prop": its code reads `m` from `editor/messages.ts`, which the app fills once; add a new editor string to `EditorMessages` and to the gallery's `docs/editor/messages.ts`.
2. **No app imports.** `packages/ui` never imports from `apps/frontend`. If a primitive needs app data (an error formatter, say), take a function prop such as `describeError`.
3. **Relative imports inside the package** (`../lib/utils`, `./button`). Only consumers use `@pp/ui/...`.
4. **Tokens, not values.** Colours, radii and easings come from `theme.css`. A new token goes in `theme.css` for both light and `.dark`, and in `DESIGN.md`.
5. **Variants over one-offs.** A second look for an existing primitive is a typed variant on it, never callsite classes (see `AGENTS.md`).
6. **Interaction standards.** Press scales to 97% over 100–150ms. Hover lands instantly and eases out over about 150ms (pair every hover class with a `transition-*`). Corners follow the house standards below (half the height, `--button-corner`). Motion follows `lib/springs.ts` and the theme easings, and reduced motion keeps only fades.
7. **Accessible by construction.** Use the Base UI part with the right role (`menuitemcheckbox`, not a checkbox inside a menu item). Give controls an accessible name, a visible focus ring and a hit area of at least 24×24.

## Adding a component from a registry

Run the CLI from `packages/ui`, so `components.json` there applies:

```sh
cd packages/ui
bunx shadcn@latest add <name>                # shadcn, Base UI flavour
bunx shadcn@latest add @fluid/<name>         # Fluid Functionalism
```

Then, before using it:

1. Move the file to `src/components/<name>.tsx` if the CLI put it elsewhere, and keep the kebab-case name.
2. Rewrite `@pp/ui/...` imports inside the new file to relative paths.
3. Replace hard-coded strings with required props (rule 1).
4. Restyle it with the theme tokens, squircle corners and the interaction standards above.
5. If it duplicates an existing primitive, merge it into that one instead (`AGENTS.md`, "One primitive per pattern").

## Gallery page template

Every component page follows the same order, taken from Base UI's docs:

```mdx
export const meta = {
  title: "Checkbox",
  group: "Primitives",
  description: "One or two sentences: what it is and where the app uses it.",
  sources: [
    { kind: "base-ui", name: "Checkbox", href: "https://base-ui.com/react/components/checkbox" },
    { kind: "shadcn", name: "checkbox", note: "starting point, fully restyled", href: "https://ui.shadcn.com/docs/components/checkbox" }
  ]
}

## Overview

<Demo name="overview" title="All states" />

## Usage

(a fenced tsx example as the app writes it, plus a props table)

## Rules

### One heading per design decision, with the reason

## Examples

<Demo name="in-a-form" title="Nested fields" />
```

- **`meta.sources`** lists what the component is built on. `kind` is `base-ui`, `shadcn`, `fluid` or `own`. Use `note` for how far it moved from the original ("starting point, fully restyled"). The page header renders these as "Built on" chips.
- **Overview is required.** One demo that shows every state at once: default, hover, pressed, focus, checked or selected, mixed, disabled, and any variant that changes the look. Pin hover, pressed and focus with `data-force="hover"`, `"hover active"` or `"focus"`; the gallery mirrors those pseudo-classes onto the attribute. Popups in an overview start open (`defaultOpen`) and get room with `className="min-h-96 place-items-start"` on the `Demo`.
- **Overview layout (precedent: Checkbox, Switch).** Two parts, top to bottom:
  1. A large live specimen: the real component at `[zoom:3]`, centred in a `flex justify-center gap-10 py-2` row, one per main state (for example off and on), fully interactive so people can click, press and drag it.
  2. A state grid of small `Cell`s (`w-24`, component above a `text-caption text-muted-foreground` caption) in `grid justify-items-center gap-y-6`. Give each row one family of states in the same column order, so columns line up: for example the first row off (Off, Hover, Pressed, Focus, Loading, Disabled) and the second row the same states on. Put `@container` on the overview root and size the grid with container queries and shrinkable columns, never viewport breakpoints: for example `grid-cols-[repeat(3,minmax(0,1fr))] @xl:grid-cols-[repeat(6,minmax(0,1fr))]`, so it fits a half-width window. Wide specimens (fields) stack to one column below `@2xl`.
  Anything that measures pointer movement must divide by the rendered scale (`getBoundingClientRect().width / offsetWidth`), so it works inside the zoomed specimen.
- **Usage** is a short, real example in app style: the import, the props the app passes (with Paraglide messages for strings), and a props table for the component's own props.
- **Rules** record each design decision and why, in plain sentences: sizes, motion timings, contrast. Update them in the same change as the code.
- **Demos** are plain components with literal English labels. They don't go through Paraglide, because the gallery isn't user-facing.

Every demo runs an axe check, and its badge must read "Accessible"; click the badge for the full list of rules that passed, failed or need review.

Headings get ids from their text, with a hover `#` that copies a link to the section. Renaming a heading changes its link.

Every page is also served as Markdown for agents, through `gallery/markdown.ts`: `/<page>.md` (for example `/components/checkbox.md`), the page URL with `Accept: text/markdown`, and an index at `/llms.txt`. Each `<Demo />` becomes its source in a `tsx` fence, so keep demos self-contained and readable. A `<Demo />` must start on its own line to be picked up. `/demo/components/<name>/<demo>` renders a demo alone; add `?theme=dark` for dark.

## The polish loop

One component at a time, with Wouter in the loop:

1. **Start.** Pick the next component from `packages/ui/queued/README.md`. Move its folder from `packages/ui/queued/<name>/` back to `packages/ui/docs/components/<name>/`, so the gallery lists it again.
2. **Prototype.** Show two to five directions as one HTML page in T3 (`html_preview` + `html_render`), using the app's real tokens, fonts and icons, light and dark side by side. A first-round prototype may already exist in `packages/ui/queued/prototypes/<name>.html`; check it against the house standards below before showing it, because it predates some of them.
3. **Discuss.** Wouter picks, mixes or asks for more variations. Apply only what he picks; iterate on the prototype first while it is still about the look.
4. **Apply** in `@pp/ui`, then fix every app call site in the same change (grep for the import). Merge look-alike primitives into one component with variants instead of keeping both.
5. **Document** the gallery page: Overview in the precedent layout, Usage with a props table, Rules (each decision and why), and Examples that port real app screens faithfully (read the app component and copy its structure, spacing and copy; don't invent a look).
6. **Check** in the gallery in T3's browser, light and dark, at full and half window width, and read each demo's axe badge (must pass AA). Then run the checks below.
7. **Update the queue** in `packages/ui/queued/README.md` and the status table below.

## House standards (apply to every component)

Set during the polish passes; a component that breaks one is not done.

- **Focus:** the `focus-ring` class (2px grey `--ring` outline, 2px offset, no animation). Never a coloured ring, never an animated offset.
- **Disabled:** `cursor-not-allowed`, and guard hover with `not-disabled:` so a disabled control never reacts. Loading controls show the `LogoLoader` (or its sweep), not a spinner.
- **Corners:** half the control's height, shaped with `[corner-shape:var(--button-corner)]` (`superellipse(1.5)`). Inputs, selects, badges and buttons of the same height share the same radius.
- **No dialogs:** there is no Dialog primitive. A page action opens a Popover on its trigger; a cmd+k action is a cmd+k page.
- **One side per container:** tooltips and hover cards in one container open on the same side, so moving between them glides instead of jumping across the trigger. Rows, section headers and board cards wrap themselves in `<HoverSide side="bottom">`; a content's own `side` is for a container that sets none.
- **Popups:** every floating panel wears the tooltip's raised skin (`--tooltip`, `--tooltip-edge`, no shadow): click-opened panels through `popupSurfaceClass` (menus add `menuSurfaceClass`'s 5px row inset), hovers (tooltips, `HoverCardContent`, `PopoverContent surface="hover"`) through the tooltip host, and anchors through `lib/popupAnchor`, so popup triggers keep their press scale. Menu and select triggers open on release (`lib/openOnRelease`), like the Popover.
- **Contrast:** check light and dark. Text holds 4.5:1 and control outlines and the focus ring 3:1 against the frame, page and muted wells.
- **Flat:** no borders and no drop shadows on controls. When something needs an edge, use the segmented tabs' hairline (`--segment-line`) or the bottom glow (`inset 0 -1px 2px var(--kbd-glow)`).
- **Colour:** build tints in oklch from one tone (`oklch(from var(--tone) L calc(c * k) h)`), never with an opacity of the tone or by mixing toward black, which greys the hue. Sheens use `color-mix(in oklab, fill, white/black n%)` on the fill itself (`.button-fill`, `.pp-badge`).
- **Fields:** text-entry surfaces and select triggers use `bg-field` (`--field`).
- **Hover and press only on interactive things.** A static element never changes on hover. Press scales to 97%.
- **Icon padding:** a leading or trailing icon takes about a quarter off the padding on its side (buttons: `iconLeft`/`iconRight`; badges: `has-[>svg:first-child]`).
- **Inline chips are centred on the text:** a badge, chip or code inside running text carries `inline-chip` (theme.css), which centres it on half the text's cap height, measured in the text's own font. Never nudge one with `align-[-4px]` or `align-middle`. When the chip sits in a wrapper (an editor node's selection span), the wrapper takes `inline-chip` and the chip's parent resets `[--chip-shift:0px]`. A leading logo or icon gets the same 12px box and inset as a trailing action, so both ends match.
- **Value changes:** when a control shows a value the user just changed (a select's chosen option, a toggle's label, a tooltip moving on), it plays through `TextSwap` (Scritto), which also animates the width. Pass plain text; an icon goes in `icon`.
- **No layout shift:** messages that appear under a control (errors, helper text) take a reserved grid cell or replace the description, so nothing moves.
- **Responsive:** every overview and example fits a half-width (50/50) window: `@container` queries and `minmax(0,1fr)` columns, never viewport breakpoints.
- **Theme CSS:** component CSS in `theme.css` that callers may need to override goes in `@layer components`, because unlayered CSS beats Tailwind utilities.

## Polish status

| Component | State |
| --- | --- |
| Checkbox, Dropdown menu, Avatar, Segmented tabs, Button, Switch, Input (+ input group), Select, Badge, Popover, Tooltip | Done (popups wear the tooltip skin since the surface pass): polished, documented, in the gallery |
| Confirm button | Done, in the gallery's Patterns group (compositions of primitives live in `docs/patterns/`); enter/exit motion still to tune |
| Command menu | Done: kept as designed; rows and their hover, press and disabled states match the dropdown items |
| Empty | Done: one variant, `intensity` (ink colour) and `animated`, random dither seed; every app empty state uses it |
| Kbd | Done: the only keycap (⌘K uses KbdShortcut), colours from currentColor, inset like an icon in buttons |
| Composer | Done, in Patterns: a card and a tray, parts own their spacing, `Composer.Surface` for inline use |
| Context menu | Done: the dropdown opened by right-click (shares rows, highlight, hold); menu shortcuts are Kbd keys |
| Date picker | Done: type a date or range (chrono-node via lib/parseDate), Calendar inside, two months for ranges; used by sprints and log time |
| Sidebar | In progress: rail on `--rail` (sliding bar, dithered project tiles), plain panel header, rows with gliding hover, row actions, live rows, the Pinned shelf with drag reorder; project switches don't animate, sub-pages slide; in the app and the gallery |
| Breadcrumbs | New: trail at the top of the page container; crumbs keyed by role, TextSwap for changed crumbs, blur in/out for added and removed ones; gallery page with a playground; used by the app |
| List row, Board card, List section | Polished: slot-based `ListRow` (+ `listGridClassName`, `ListRowTitle`), `BoardCard`, `ListSectionHeader`/`ListSectionBody` and `BoardColumn` with its parts, sharing `ItemLink`, `TicketKey`, `ProgressCount`, `StatusGlyph`, `chipClassName` and `lib/keepInPlace`; the app fills the slots and keeps data, drag and virtualization. Row polished (direction A, Tidy): parents before the title go through `ListRowCrumbs` (`@pp/ui/list-row-crumbs`: when the title would be cut the highest parent folds to its key, then the next; below an 8rem title the keys drop out), 40px rows, flat chips, priority bars, hover-only placeholders, 24px targets; the board card polished to match (14px corners, hover-only empty assignee), chips in one language (data vs label kinds, ChipSeparator), flagged cards get the warm wash, sub-tickets and ticket popovers are TicketLines (menu rows + MenuHighlight); section headers refined (40px bar, plain rolling count, chip detail, press, stuck shadow, fold at once (only the chevron turns), field-like creator) |
| Type | One face outside code: keys, branches, hashes and slugs are Allo with `tabular-nums`; Geist Mono only in code blocks, inline code and `<code>` values to paste |
| Tooltip, Hover card | Tooltip restyled: raised fill, light in light and dark in dark (`--tooltip`, `--tooltip-edge`), no more inverted ink. `@pp/ui/hover-card` (`HoverCard`, `HoverCardTrigger`, `HoverCardContent`) is drawn by the tooltip host, so a tooltip and a card glide and resize into each other; it keeps Base UI Preview Card's behaviour (hover and focus open, Escape and outside click close, `openOnClick`, no tooltip role) and replaces it; card content is portaled from where it's written (keeps its context), and React events stop at the card; gallery page with examples |
| Slider | Done (direction C): the field is the control (28px field, fill from the edge to the thumb, value inside on the right, label above, end labels under); the Switch's thumb (a 6×16 bar at rest, the 16px squircle on hover, 4px wider while dragged, the Switch's spring); the value springs to the thumb's other side when the thumb reaches it; on Base UI Slider, single value only |
| Selection bar | Done (in Patterns): `@pp/ui/selection-bar` (`SelectionBar`, `SelectionBarField`, `SelectionBarSeparator`, `SelectionBarStack`); the app shows a suggested next step and Actions (⌘K with the selection, where pages stage and apply a change); property fields with staging menus (`@pp/ui/selection-bar-menu`) remain for other compositions; select all with its count, a pending, success (Undo) or failed (Retry) result in the bar's place; toolbar with arrow keys, count announced, never covers the rows; the one popup-like surface with a drop shadow |
| Chip | Done: kept apart from Badge but with its look (direction B, Glass): 12px superellipse corners, the translucent `--chip-label` fill with `--chip-sheen` and `--chip-edge`, label chips lit at rest, data chips lit on hover or with a popup open, press to 97%, house focus ring; tags keep their dot |
| Board column | Done: the toned well (direction C: no border, `--surface-1`, the status tone washing in from the top via `boardColumnTone`, 22px squircle corners, count chip by the name, drop ring in the tone); a grip in every header for people who may reorder statuses (drag saves on release, arrow keys move one place), no reorder mode or banner; all board drag (column reorder, card drag, drop gap, card slide, edge and side scroll) lives in `@pp/ui/board-drag`, used by the sprint and backlog boards and the gallery overview. The card's ItemLink is a drag source of its own: Chromium won't start a drag from a press on a draggable="false" link inside a draggable card |
| Timeline | Done: one SVG rail through every `TimelineMark` (60% `--border`), indents (22px) reached with two `superellipse(1.5)` corners (`lib/timelineRail`), `TimelineRun` folds open right under their summary in either order with the rail easing into the indent, 20px marks and stacks, `TimelineIndent` for replies; the app keeps the activity data, run folding, actor marks and messages |
| Comment | Done: B bubbles on the timeline's rail (`Comment`, 4px corner by the mark, `--comment-bubble`), `CommentReplies` one step in, `CommentEarlier` folds like a run, `CommentReplyAction` opens `CommentReplyBox` in its place; the app keeps atoms, policies, menus, the edit in place (local state in CommentRow; InlineForm was removed) and the editor |
| Dialog | Removed: the app has no dialogs (PRODUCT.md, "Zero dialogs"); page actions use Popover, cmd+k actions are cmd+k pages |


## Checks

```sh
cd packages/ui && bun run typecheck && bun run lint && bun run test && bun run build-gallery
cd apps/frontend && bun run typecheck && bun run lint
```

A changed prop usually breaks app call sites. Fix them in the same change with the app's Paraglide messages, never by adding a default.
