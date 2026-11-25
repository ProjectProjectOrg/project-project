import {
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode
} from "react"

import { cn } from "../lib/utils"
import { bareFieldClass } from "./input"
import { itemSurfaceClass } from "./item-link"
import { menuItemClass } from "./menu-styles"
import {
  TicketLine,
  TicketLines,
  useRowHighlight,
  type TicketLineProps
} from "./ticket-lines"
import { HoverSide } from "./tooltip"

/*
 * A ticket on a board: a raised card with its key (and parent) on top, the
 * assignee in the corner, a two-line title and a row of property chips.
 *
 *   <BoardCard
 *     link={<ItemLink render={<Link … />} aria-label="ATL-23 Fix login" />}
 *     meta={<TicketKey value="ATL-23" />}
 *     assignee={<AssigneeField … />}
 *     title="Fix login"
 *     properties={<>…chips…</>}
 *   >
 *     {sub-tickets}
 *   </BoardCard>
 *
 * Like the list row: flat chips, priority bars, and an empty assignee that
 * waits for the card's hover (`group/card`). The title always takes two lines of room, so every card in a column is one
 * height and the column reads as a grid. Anything after the properties (the
 * sub-ticket list) goes in `children`.
 */

type BoardCardProps = Omit<ComponentProps<"div">, "title"> &
  Readonly<{
    // An ItemLink stretched over the card, so a click anywhere opens it.
    link?: ReactNode
    // The key and, for a sub-ticket, its parent; muted caption text.
    meta?: ReactNode
    // Top right, a 24px avatar.
    assignee?: ReactNode
    title: ReactNode
    // The chip row; hidden when every chip in it renders nothing.
    properties?: ReactNode
    // Flagged: a wash of the warning tone fades out under the key and title.
    flagged?: boolean
  }>

export function BoardCard({
  link,
  meta,
  assignee,
  title,
  properties,
  flagged = false,
  className,
  children,
  ...props
}: BoardCardProps) {
  return (
    // Every hover in it opens below, tooltips and cards alike.
    <HoverSide side="bottom">
      <div
        data-slot="board-card"
        {...props}
        className={cn(
          "group/card group/reveal relative isolate flex flex-col rounded-(--card-radius) surface-3 px-3 pt-2.5 pb-1.5 text-left shadow-surface-1 transition outline-none [--card-radius:14px] [corner-shape:var(--button-corner)] not-in-data-keyboard-navigation:hover:surface-4 not-in-data-keyboard-navigation:hover:shadow-surface-1-hover in-data-keyboard-navigation:duration-0 has-[[data-item-link]:focus-visible]:surface-4 has-[[data-item-link]:focus-visible]:shadow-surface-1-hover has-[[data-item-link]:focus-visible]:duration-0 has-[[data-popup-open]]:surface-4 has-[[data-popup-open]]:shadow-surface-1-hover data-[popup-open]:surface-4 data-[popup-open]:shadow-surface-1-hover",
          itemSurfaceClass,
          // Over the fill as an image, so the hover's lift still shows.
          flagged &&
            "bg-[image:linear-gradient(to_bottom,var(--flag-wash),transparent_64px)]",
          className
        )}
        data-flagged={flagged || undefined}
      >
        {link}
        <div className="flex min-w-0 flex-col gap-2.5 pb-1">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex h-6 min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
              <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                {meta}
              </span>
              {assignee ? (
                // A 24px target around a 20px face; -mr-0.5 sets the face
                // as far from the card's right edge as from its top.
                <span
                  data-slot="board-assignee"
                  className="-mr-0.5 ml-auto flex shrink-0 items-center"
                >
                  {assignee}
                </span>
              ) : null}
            </div>
            <div className="min-h-[2lh] min-w-0 text-subtitle leading-snug font-semibold">
              <span className="line-clamp-2">{title}</span>
            </div>
          </div>
          {properties ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1 [&:not(:has(>:not(:empty)))]:hidden [&>:empty]:hidden">
              {properties}
            </div>
          ) : null}
        </div>
        {children}
      </div>
    </HoverSide>
  )
}

/*
 * A card's sub-tickets, listed under its chips:
 *
 *   <BoardCardSubTickets>
 *     <BoardCardSubTicket
 *       status={<TicketStatusIcon … />}
 *       ticketKey="ATL-24"
 *       keyWidth="6ch"
 *       title="Announce focus changes"
 *       render={<Link to="…" />}
 *     />
 *     <BoardCardSubTicketsMore onClick={…}>Show 2 more</BoardCardSubTicketsMore>
 *   </BoardCardSubTickets>
 *
 * Each line is a menu row, literally: `menuItemClass` and the menu's gliding
 * `MenuHighlight`, so sub-tickets hover, press and read like the items of a
 * dropdown (36px rows, the title in body text, muted until highlighted).
 */

export function BoardCardSubTickets({
  className,
  children,
  ...props
}: ComponentProps<"ul">) {
  return (
    <div
      data-slot="board-card-sub-tickets"
      className={cn("border-t border-border/60 pt-1.5", className)}
    >
      {/* The rows bleed into the card's padding, like a menu's into its
          popup's: the highlight sits 4px from the card's edge. */}
      <TicketLines className="-mx-2" {...props}>
        {children}
      </TicketLines>
    </div>
  )
}

// A sub-ticket on the card: a TicketLine.
export const BoardCardSubTicket = TicketLine
export type BoardCardSubTicketProps = TicketLineProps

// How many sub-tickets a collapsed list shows: the first `preview`, unless
// that would hide just one; a "Show 1 more" line is as tall as the ticket it
// hides, so then every line shows.
export const subTicketsShown = (total: number, preview = 3) =>
  total - preview >= 2 ? preview : total

// The row that shows the rest of a long list ("Show 3 more").
export function BoardCardSubTicketsMore({
  className,
  onClick,
  children,
  ...props
}: ComponentProps<"button">) {
  const highlight = useRowHighlight()
  return (
    <li className="z-20 col-span-full grid">
      <button
        type="button"
        draggable={false}
        {...highlight}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation()
          onClick?.(event)
        }}
        className={cn(menuItemClass, "justify-center", className)}
        {...props}
      >
        {children}
      </button>
    </li>
  )
}

// A note in place of the lines: loading, or failed to load.
export function BoardCardSubTicketsNote({
  loading = false,
  children
}: Readonly<{ loading?: boolean; children: ReactNode }>) {
  return (
    <li
      className={cn(
        "col-span-full px-2 py-2 text-caption text-muted-foreground",
        loading && "animate-pulse"
      )}
    >
      {children}
    </li>
  )
}

type BoardDraftCardProps = ComponentProps<"textarea"> &
  Readonly<{
    meta?: ReactNode
    error?: ReactNode
    note?: ReactNode
  }>

export function BoardDraftCard({
  meta,
  error,
  note,
  className,
  ...props
}: BoardDraftCardProps) {
  const card = useDraftCardFadeIn()
  return (
    <div
      ref={card}
      data-slot="board-draft-card"
      className="relative flex flex-col gap-1 rounded-(--card-radius) bg-surface-3 px-3 pt-2.5 pb-3 shadow-surface-1 [--card-radius:14px] [corner-shape:var(--button-corner)]"
    >
      {meta ? (
        <div className="flex h-6 min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
          {meta}
        </div>
      ) : null}
      <textarea
        rows={2}
        className={cn(
          "block [field-sizing:content] min-h-[calc(2lh+0.5rem)] resize-none text-subtitle leading-snug font-semibold text-foreground outline-none placeholder:text-muted-foreground",
          bareFieldClass,
          className
        )}
        {...props}
      />
      {error ? (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
      {note ? (
        <output className="block text-caption text-muted-foreground">
          {note}
        </output>
      ) : null}
    </div>
  )
}

const DRAFT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"

function useDraftCardFadeIn() {
  const card = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    card.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 160,
      easing: DRAFT_EASE
    })
  }, [])
  return card
}

export type { BoardCardProps, BoardDraftCardProps }
