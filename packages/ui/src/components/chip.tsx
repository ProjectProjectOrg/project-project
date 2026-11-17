import { cn } from "../lib/utils"

/*
 * The small flat pill on ticket rows and board cards: tags, priority,
 * estimate, sub-ticket count, git, relations, the epic. A class, not a
 * component, because the app's chips are triggers of their own (menus,
 * previews, links) and take it as their className.
 *
 *   <button className={chipClassName({ interaction: "press" })}>…</button>
 */

type ChipInteraction =
  // Static: a count or a label.
  | "none"
  // Reacts on hover, for chips that open a preview but don't act on click.
  | "hover"
  // Hover and a pointer: opens a menu or follows a link.
  | "press"

type ChipShape =
  // Icon and text.
  | "label"
  // One icon, a 24px circle.
  | "icon"
  // An icon and a short number, as narrow as it can be.
  | "count"

// Flat: muted text with its icon and no outline, so the ticket's title
// leads. The padding gives a hover fill room around the text.
const base =
  "inline-flex h-6 max-w-48 min-w-0 shrink-0 items-center gap-1.5 rounded-full px-1.5 text-caption text-muted-foreground"

const hover =
  "transition-colors outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[popup-open]:bg-hover data-[popup-open]:text-foreground"

const interactionClass: Readonly<Record<ChipInteraction, string>> = {
  none: "",
  hover,
  press: cn("cursor-pointer", hover)
}

const shapeClass: Readonly<Record<ChipShape, string>> = {
  label: "",
  icon: "w-6 justify-center px-0",
  count: "min-w-6 justify-center gap-1 px-1.5 [&_svg]:size-3"
}

export function chipClassName({
  interaction = "none",
  shape = "label",
  className
}: Readonly<{
  interaction?: ChipInteraction
  shape?: ChipShape
  className?: string
}> = {}) {
  return cn(base, interactionClass[interaction], shapeClass[shape], className)
}

export type { ChipInteraction, ChipShape }
