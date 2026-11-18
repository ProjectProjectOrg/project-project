import { cn } from "../lib/utils"

/*
 * The small flat pill on ticket rows and board cards: tags, priority,
 * estimate, sub-ticket count, git, relations, the epic. A class, not a
 * component, because the app's chips are triggers of their own (menus,
 * previews, links) and take it as their className.
 *
 *   <button className={chipClassName({ interaction: "press" })}>…</button>
 *
 * Two kinds, one language: `data` chips are a 12px icon and the shortest
 * value (8, 2/5, 3, #141), plain; `label` chips are names (the epic, tags,
 * "+N") in a quiet filled pill, so names never read as numbers. Priority and
 * flag are data with no value: the icon alone.
 */

type ChipInteraction =
  // Static: a count or a label.
  | "none"
  // Reacts on hover, for chips that open a preview but don't act on click.
  | "hover"
  // Hover and a pointer: opens a menu or follows a link.
  | "press"

type ChipKind =
  // A value: an icon and the shortest form of it (8, 2/5, 3), plain.
  | "data"
  // A name (epic, tag, +N): a quiet filled pill, so it reads as a label.
  | "label"

type ChipShape =
  // Icon and text.
  | "label"
  // One icon, a 24px circle.
  | "icon"
  // An icon and a short number, as narrow as it can be.
  | "count"

// Flat: muted text with its icon and no outline, so the ticket's title
// leads. Corners at half the height, shaped like the badge's. The padding
// gives a hover fill room around the text.
const base =
  "inline-flex h-6 max-w-48 min-w-0 shrink-0 items-center gap-1.5 rounded-[12px] px-1.5 text-caption text-muted-foreground [corner-shape:var(--button-corner)]"

// The badge's light on a translucent fill (--chip-sheen, --chip-edge), so a
// chip reads on a hovered row and a flagged card's wash alike. Label chips
// wear it at rest; data chips only under the pointer or with a popup open.
const lit =
  "bg-(image:--chip-sheen) shadow-(--chip-edge) bg-(color:--chip-label)"
const litOnHover =
  "hover:bg-(image:--chip-sheen) hover:shadow-(--chip-edge) hover:bg-(color:--chip-label) data-[popup-open]:bg-(image:--chip-sheen) data-[popup-open]:shadow-(--chip-edge) data-[popup-open]:bg-(color:--chip-label)"

// Hover lands at once and eases out over 150ms.
const hover = cn(
  "focus-ring transition-[background-color,color,box-shadow,scale] duration-150 ease-out hover:text-foreground hover:duration-0 data-[popup-open]:text-foreground",
  litOnHover
)

const kindClass: Readonly<Record<ChipKind, string>> = {
  data: "chip-data",
  label: cn("chip-label px-2", lit)
}

// A label chip that reacts deepens its fill instead.
const labelHover =
  "hover:bg-(color:--chip-label-hover) data-[popup-open]:bg-(color:--chip-label-hover)"

const interactionClass: Readonly<Record<ChipInteraction, string>> = {
  none: "",
  hover,
  // The press lands: 97% over 100ms.
  press: cn("cursor-pointer active:scale-[0.97] active:duration-100", hover)
}

const shapeClass: Readonly<Record<ChipShape, string>> = {
  label: "",
  icon: "w-6 justify-center px-0",
  count: "min-w-6 justify-center gap-1 px-1.5 [&_svg]:size-3"
}

export function chipClassName({
  kind = "data",
  interaction = "none",
  shape = "label",
  className
}: Readonly<{
  kind?: ChipKind
  interaction?: ChipInteraction
  shape?: ChipShape
  className?: string
}> = {}) {
  return cn(
    base,
    interactionClass[interaction],
    shapeClass[shape],
    kindClass[kind],
    kind === "label" && interaction !== "none" && labelHover,
    className
  )
}

export type { ChipInteraction, ChipKind, ChipShape }

// The hairline between the state icons (priority, flag) and the numbers.
// It hides itself when no data chip follows, so it never dangles. (A child
// span keeps it from counting as an empty chip.)
export function ChipSeparator() {
  return (
    <span
      aria-hidden
      data-chip-sep=""
      className="mx-0.5 flex h-6 items-center [&:not(:has(+:is(.chip-data,fieldset)))]:hidden"
    >
      <span className="block h-3 w-px bg-border" />
    </span>
  )
}

/*
 * On a narrow list, a row's tags fold into one chip: every tag's dot and how
 * many there are, so the title keeps its room. The named chips (and their
 * "+N") take `chipWideOnlyClass`, the folded chip `chipNarrowOnlyClass`; both
 * measure the list grid (`listGridClassName` is the `list` container).
 *
 *   <button className={chipClassName({ kind: "label", className: chipNarrowOnlyClass })}>
 *     <ChipDots colors={tags.map((tag) => tag.color)} />5
 *   </button>
 */
export const chipWideOnlyClass = "hidden @3xl/list:inline-flex"
export const chipNarrowOnlyClass = "@3xl/list:hidden"

// Up to four tag dots side by side, 2px apart.
export function ChipDots({
  colors
}: Readonly<{ colors: ReadonlyArray<string | null | undefined> }>) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-0.5">
      {colors.slice(0, 4).map((color, index) => (
        <span
          // oxlint-disable-next-line react/no-array-index-key -- dots have no identity beyond their place; colours repeat
          key={index}
          className="size-2 rounded-full bg-muted-foreground"
          style={color ? { backgroundColor: color } : undefined}
        />
      ))}
    </span>
  )
}
