/*
 * A hover card: opens when the pointer rests on its trigger (a link or a
 * button) or the trigger gets keyboard focus, and unlike a tooltip it can be
 * moved into and clicked, so it can hold lists of ticket links.
 *
 *   <HoverCard>
 *     <HoverCardTrigger render={<button …/>} openOnClick>2/5</HoverCardTrigger>
 *     <HoverCardContent className="w-72 p-1">…</HoverCardContent>
 *   </HoverCard>
 *
 * It's drawn by the tooltip host (tooltip.tsx), so there's one hover on
 * screen at a time, the same delay and warm-up, and moving between a
 * tooltip and a card glides and resizes instead of closing and opening.
 * What it keeps from Base UI's Preview Card, which it replaced: open on
 * hover after a delay and on keyboard focus, stay open while the pointer is
 * on it, Escape and a click outside close it, `openOnClick` opens it from
 * the keyboard and touch, and the popup has no tooltip role, so it doesn't
 * describe its trigger.
 *
 * It wears the tooltip's skin at a card's corners (hoverCardSurfaceClass).
 */
export {
  closeHoverCard,
  HoverCard,
  HoverCardContent,
  hoverCardSurfaceClass,
  HoverCardTrigger
} from "./tooltip"
