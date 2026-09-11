# Project appearance settings — stepped icon and banner editors

Design handoff for the follow-up to T-136. Source of truth for the visuals is
the Paper file; this document records what the frames mean, what was decided,
and what they deliberately do not answer.

**Paper file:** <https://app.paper.design/file/01M25Z90P4R6S8J8XGB53RFXY9/1-0>
(variant D, the lane at worldX 5100. Variants A, B and C at 0 / 1700 / 3400 were
rejected and are kept only for reference.)

**Frames**

| Frame | Shows |
| --- | --- |
| `D · Settings settled` | General settings, nothing being edited |
| `D · Icon step 1` | *What is the icon?* — source choice, plus the no-storage state |
| `D · Icon step 2` | *Which part of the photo?* — crop |
| `D · Icon step 3` | *How should it sit in the tile?* — treatment, plus the cutout-failed state |
| `D · Banner editor` | Banner, both steps, plus the presets grid and no-storage state |

## Why

T-136 shipped custom project icons — sticker cutout with a tolerance, full
bleed, crop — alongside the banner work. The controls accreted as popovers: the
icon tile opens one, the accent colour opens a second, the emoji picker a third.
Each popover is `w-fit`, so the three controls disagree on width and the image
editor — the thing people actually came for — is the one squeezed hardest,
sharing its panel with a 320px-tall emoji grid. The banner editor is already
inline rather than a popover, so the section is split across two idioms. That
mismatch is what makes a simple task read as a complicated one.

## What changes

### Appearance becomes one section with live previews

The icon, accent colour and banner sit as three flat rows. Beside them, a
**How it renders** column shows the project as it actually appears at the sizes
it actually renders: the project header at 40px (`ProjectTile size="md"`),
project cards and list rows at 36px (`size="sm"`), and the sidebar at 16px
(`ProjectIconDisplay size={16}`). The 48px `size="lg"` tile is used only by the
settings editor this redesign replaces, so it is not a real surface. The
previews update live while editing. The 16px case is the one that matters — a
cutout that survives 40px often dies at 16px.

### Icon editing is a three-step inline form

Progressive disclosure, expanding in place inside the Appearance section. No
popover, no modal, no route. Completed steps collapse into a summary row with a
**Change** affordance, so nothing is hidden but only one thing asks for
attention at a time.

1. **What is the icon?** — `Emoji | Custom image` segmented tabs, then the
   dropzone. The emoji is the permanent fallback and is stated as such.
2. **Which part of the photo?** — crop. **This step is new work, not a
   re-presentation of a shipped control.** At head `ProjectIconUpload`
   hardcodes `ICON_CROP = { x: 0.5, y: 0.5, zoom: 1 }` for both treatments, and
   `ProjectIconDisplay` applies `crop` only to `full_bleed` — stickers ignore it.
   Making this step real needs the crop either baked into the composited sticker
   output or honoured on the sticker render path; pick one before building.
3. **How should it sit in the tile?** — `Sticker | Full bleed` segmented tabs,
   then the background-removal slider. `Apply` lives only here, so there is one
   call to action.

Crop before treatment is deliberate: removal strength is judged on the framed
result.

### Crop is shown, not described

The previous attempts satisfied "show the crop" with a slider labelled
`Position x 0.52 y 0.41`, which is a readout, not an interface. The new device
is a dimmed full source image with a bright squircle window over it, captioned
*"Bright square = what the tile shows"*. The window **is** the tile, so zooming
visibly shrinks the included region and dragging moves it. Slider ends read
`1× · whole photo` and `4× · a quarter of it`. The `x` / `y` values become a
plain-text readout, not the control — deliberately not mono: DESIGN.md's
Mono-For-Literals Rule reserves Geist Mono for strings a user could paste into
a terminal, and crop floats are UI state.

The banner reuses the same device with a 3:1 strip and
*"Bright strip = the 3:1 banner"*.

### Banner editing is two steps

1. **Which image?** — `Artwork | Upload` tabs. Artwork is the six built-in Monet
   presets as 3:1 thumbnails with titles.
2. **Which strip of the painting?** — the same crop device.

The header preview renders the banner as it actually appears: 3:1, 160px,
**20% opacity**, with the bottom fade. A preview at full opacity is lying.

### Copy changes

- `Cutout tolerance` → **Background removal**, with slider ends reading
  `Gentle · keeps more background` and `Aggressive · may eat the subject`
  instead of `0` / `160`.
- The project body field is labelled **Description**.

### Unchanged

The project key stays visible and non-editable, as it is today.

## Not in the designs

These are real gaps, not oversights to discover during implementation.

**Needs a design decision before building**

- **Dark mode.** Every frame is light. The dimmed-source crop device, the
  sticker's ground, and the banner fade all need a dark treatment.
- **Narrow viewports.** Every frame is 1440. The two-column Appearance layout
  needs a stacked story, and the real shell already hides the sidebar below
  `lg`.
- **The emoji picker itself.** Step 1 shows the `Emoji` tab but never the
  picking UI. Decide whether the search-and-grid goes inline in step 1 or stays
  a popover — the latter reintroduces exactly what this redesign removes.
- **The accent colour picker.** The row and its `Change` button appear in every
  frame; the picker is never opened. Same question as the emoji picker.
- **Re-entering an earlier step.** If you click `Change` on step 1 after
  finishing step 3, it is unspecified whether steps 2 and 3 reset or persist.

**Known missing, lower risk**

- **Member (read-only) view.** Only the owner view is drawn.
- **In-flight and loading states.** No skeletons, no `waiting` pulse, no upload
  or compression progress. The codebase convention is `animate-pulse` on the
  data that changed.
- **Error states beyond the two drawn.** Cutout-failed and no-storage are
  covered. Missing: file type rejected, over `ATTACHMENT_MAX_BYTES`, decode
  failure from `compressImage`, and network failure on apply.
- **Keyboard and a11y.** The crop device is drag-only in the frames. Today
  `ProjectBannerSettings` supports arrow-key nudging with shift for coarse
  steps; that must survive, along with focus order through the stepped form.
- **Motion.** No transitions specified for step expand and collapse. Use the
  existing `transitions.morph` / `transitions.fade` conventions.
- **Undo after Apply.** No path designed for changing your mind.
- **i18n.** Every string in the frames is an English literal. All of them need
  paraglide keys under the `project_` prefix in
  `packages/frontend/messages/en/projects.json`.

**Fidelity caveats**

- The display face in the frames is **Geist Mono standing in for Geist Pixel**,
  which Paper does not have. Anything in the display role will read differently
  in production.
- One frame's helper copy says the body is written to `README.md`. It is not —
  the project body is the markdown body of `project.md`. Use the real path in
  any copy derived from these frames.
