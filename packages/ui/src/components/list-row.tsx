import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject
} from "react"

import type { ItemRect } from "../hooks/useFluidHover"
import { cn } from "../lib/utils"
import { FluidHoverHighlight } from "./fluid-hover-highlight"
import { itemLayerClass, itemSurfaceClass } from "./item-link"
import { HoverSide } from "./tooltip"

/*
 * A ticket in a list: one row of the list's grid, with a slot per column so
 * every row lines up. Each row is a subgrid of `listGridClassName`, which the
 * list sets on the element holding the rows.
 *
 *   <div className={listGridClassName}>
 *     <ListRow
 *       link={<ItemLink render={<Link … />} aria-label="ATL-23 Fix login" />}
 *       lead={<Checkbox … />}
 *       status={<StatusButton … />}
 *       priority={<PriorityButton … />}
 *       ticketKey={<TicketKey value="ATL-23" />}
 *       title={<ListRowTitle>Fix login</ListRowTitle>}
 *       trailing={<>…chips…</>}
 *       estimate={…}
 *       assignee={…}
 *     />
 *   </div>
 *
 * Columns, left to right: lead (the selection checkbox, revealed on hover),
 * status, priority, key, title (takes the rest), trailing (chips), estimate
 * and assignee. The CSS variables `--list-lead`, `--list-lead-gap`,
 * `--list-icon` and `--list-row-gap` (theme.css) size the leading columns, so
 * section headers can line up with them; `--ticket-key-width` (set by the
 * list) keeps keys of different lengths one width.
 */

// A row's height in px, for lists that lay rows out themselves (the
// virtualized backlog): 24px fields and 8px above and below.
export const listRowHeight = 40

// The title keeps at least 10rem; past that the chips' column gives way
// (it's as wide as the widest row's chips), so a row with many tags never
// squeezes the titles to nothing. The grid is the `list` container: below
// 48rem a row's tags fold into one chip (chipNarrowOnlyClass).
export const listGridClassName =
  "@container/list grid gap-y-1 grid-cols-[auto_auto_auto_auto_minmax(10rem,1fr)_minmax(0,auto)_auto_auto]"

const InHoverScopeContext = createContext(false)

// How far past a row the pointer still holds the highlight: the 4px gap
// between rows, but not a section header.
const HOVER_REACH = 6

type Hovered = Readonly<{ index: number; rect: ItemRect }>

const sameHovered = (a: Hovered | null, b: Hovered | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.index === b.index &&
    a.rect.top === b.rect.top &&
    a.rect.left === b.rect.left &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height)

const rowAt = (container: HTMLElement, x: number, y: number) => {
  const under = document.elementFromPoint(x, y)
  if (!under || !container.contains(under)) return null
  for (const dy of [0, -HOVER_REACH, HOVER_REACH]) {
    const row = document
      .elementFromPoint(x, y + dy)
      ?.closest<HTMLElement>('[data-slot="list-row"]')
    if (row && container.contains(row)) return row
  }
  return null
}

const openPopupRow = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(
    '[data-slot="list-row"]:is([data-popup-open], :has([data-popup-open]))'
  )

/*
 * The gliding hover for a list, like the sidebar's: one highlight that
 * slides from row to row under the pointer instead of each row lighting up
 * on its own. Wrap everything that holds rows (sections included); rows
 * inside it drop their own hover fill. It hides during arrow-key
 * navigation, where the focused row shows instead. While a row has a menu
 * or preview card open, the highlight stays on it when the pointer leaves
 * for the popup, so the row is never lit twice.
 * Only the row under the pointer is found and measured, at most once a
 * frame, so rows mounting as a virtual list scrolls cost nothing here.
 */
export function ListHoverScope({
  className,
  children
}: Readonly<{ className?: string; children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null)
  const ids = useRef(new WeakMap<Element, number>())
  const nextId = useRef(0)
  const point = useRef<Readonly<{ x: number; y: number }> | null>(null)
  const frame = useRef(0)
  const sessionRef = useRef(0)
  const litRow = useRef<HTMLElement | null>(null)
  const [hovered, setHovered] = useState<Hovered | null>(null)

  const track = useCallback(() => {
    frame.current = 0
    const container = ref.current
    const at = point.current
    if (!container) return
    const row = (at && rowAt(container, at.x, at.y)) ?? openPopupRow(container)
    if (litRow.current !== row) {
      litRow.current?.removeAttribute("data-hover-highlight")
      row?.setAttribute("data-hover-highlight", "")
      litRow.current = row
    }
    if (!row) {
      setHovered(null)
      return
    }
    let index = ids.current.get(row)
    if (index === undefined) {
      nextId.current += 1
      index = nextId.current
      ids.current.set(row, index)
    }
    const box = container.getBoundingClientRect()
    const scale =
      container.offsetWidth > 0 ? box.width / container.offsetWidth : 1
    const r = row.getBoundingClientRect()
    const next = {
      index,
      rect: {
        top: (r.top - box.top) / scale,
        left: (r.left - box.left) / scale,
        width: r.width / scale,
        height: r.height / scale
      }
    }
    setHovered((current) => (sameHovered(current, next) ? current : next))
  }, [])

  const schedule = useCallback(() => {
    if (frame.current === 0) frame.current = requestAnimationFrame(track)
  }, [track])

  useEffect(() => {
    const container = ref.current
    const root = container?.closest("[data-scroll-root]") ?? window
    const onScroll = () => {
      if (point.current) schedule()
    }
    root.addEventListener("scroll", onScroll, { passive: true })
    const popups = new MutationObserver(schedule)
    if (container) {
      popups.observe(container, {
        subtree: true,
        attributeFilter: ["data-popup-open"]
      })
    }
    return () => {
      root.removeEventListener("scroll", onScroll)
      popups.disconnect()
      cancelAnimationFrame(frame.current)
      litRow.current?.removeAttribute("data-hover-highlight")
    }
  }, [schedule])

  const itemRects: Array<ItemRect | undefined> = []
  if (hovered !== null) itemRects[hovered.index] = hovered.rect
  const hover = {
    activeIndex: hovered?.index ?? null,
    itemRects,
    isMeasured: true,
    sessionRef
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the highlight's pointer tracking; the rows are links of their own
    <div
      ref={ref}
      data-slot="list-hover-scope"
      onMouseEnter={() => {
        sessionRef.current += 1
      }}
      onMouseMove={(event) => {
        point.current = { x: event.clientX, y: event.clientY }
        schedule()
      }}
      onMouseLeave={() => {
        point.current = null
        schedule()
      }}
      className={cn("relative", className)}
    >
      <FluidHoverHighlight
        hover={hover}
        className="rounded-[20px] [corner-shape:var(--button-corner)] in-data-keyboard-navigation:invisible"
      />
      <InHoverScopeContext value={true}>{children}</InHoverScopeContext>
    </div>
  )
}

type ListRowProps = Omit<ComponentProps<"div">, "title" | "ref"> &
  Readonly<{
    // The row's element, for anchoring popups to it.
    ref?: RefObject<HTMLDivElement | null>
    // An ItemLink stretched over the row, so a click anywhere opens it.
    link?: ReactNode
    lead?: ReactNode
    status?: ReactNode
    priority?: ReactNode
    ticketKey?: ReactNode
    title: ReactNode
    trailing?: ReactNode
    estimate?: ReactNode
    assignee?: ReactNode
    // Picked in a multi-select: a tinted fill instead of the hover.
    selected?: boolean
    // "embedded" drops the row's own hover and corners, for a row inside
    // another surface that already has them (the dashboard's cards).
    variant?: "standalone" | "embedded"
    // Disables the row's controls (status, priority, estimate, assignee), for
    // someone who can only look.
    disabled?: boolean
  }>

export function ListRow({
  link,
  lead,
  status,
  priority,
  ticketKey,
  title,
  trailing,
  estimate,
  assignee,
  selected = false,
  variant = "standalone",
  disabled = false,
  className,
  ref,
  ...props
}: ListRowProps) {
  // In a ListHoverScope the gliding highlight is the hover; on its own the
  // row fills itself.
  const inHoverScope = use(InHoverScopeContext)
  const ownHover = inHoverScope
    ? "in-data-keyboard-navigation:not-data-selected:has-[[data-popup-open]]:bg-hover in-data-keyboard-navigation:not-data-selected:data-[popup-open]:bg-hover"
    : "not-in-data-keyboard-navigation:hover:bg-hover not-data-selected:has-[[data-popup-open]]:bg-hover not-data-selected:data-[popup-open]:bg-hover"
  return (
    // Every hover in it opens below, tooltips and cards alike.
    <HoverSide side="bottom">
      <div
        ref={ref}
        data-slot="list-row"
        data-selected={selected || undefined}
        {...props}
        className={cn(
          "group/reveal relative col-span-full grid grid-cols-subgrid items-center gap-x-(--list-row-gap) py-2 pr-3 pl-(--list-pad-start) text-left outline-none",
          itemSurfaceClass,
          variant === "standalone" && ownHover,
          variant === "standalone" &&
            "isolate rounded-[20px] transition-colors [corner-shape:var(--button-corner)] in-data-keyboard-navigation:duration-0 has-[[data-item-link]:focus-visible]:duration-0 not-data-selected:has-[[data-item-link]:focus-visible]:bg-hover data-selected:bg-foreground/6",
          // The link reaches into the gap between rows, so the rows have no
          // dead strip between them.
          "[&>[data-item-link]]:before:absolute [&>[data-item-link]]:before:inset-x-0 [&>[data-item-link]]:before:-inset-y-0.5 [&>[data-item-link]]:before:content-['']",
          className
        )}
      >
        {link}
        <span
          className={cn(
            itemLayerClass,
            "box-content flex w-(--list-lead) justify-center pr-[calc(var(--list-lead-gap)-var(--list-row-gap))]"
          )}
        >
          {lead}
        </span>
        <fieldset disabled={disabled} className="contents">
          <span
            className={cn(
              itemLayerClass,
              "flex w-(--list-icon) justify-center"
            )}
          >
            {status}
          </span>
          <span className={cn(itemLayerClass, "inline-flex")}>{priority}</span>
          {/* The key reads at the title's size, like a parent's key before
            the title (ListRowCrumbs), so the row keeps one text size. */}
          <span className="shrink-0 text-body [&>[data-slot=ticket-key]]:text-body">
            {ticketKey}
          </span>
        </fieldset>
        <div className="col-start-5 row-start-1 flex min-w-0 items-center self-stretch pl-1">
          {title}
        </div>
        {/* Squeezed, chips that no longer fit wrap onto a second line that
          is clipped away, so whole chips drop out instead of being cut in
          half. The 4px padding on every side keeps focus rings inside the clip. */}
        <div className="-m-1 flex h-8 min-w-0 flex-wrap items-center justify-end gap-1 overflow-hidden p-1 [&>fieldset>span:empty]:hidden">
          {trailing}
        </div>
        <fieldset disabled={disabled} className="contents">
          <div className="flex justify-end">{estimate}</div>
          <div className="hidden justify-end sm:flex">{assignee}</div>
        </fieldset>
      </div>
    </HoverSide>
  )
}

// The title text: one line, truncated, in the row's weight.
export function ListRowTitle({
  variant = "default",
  className,
  ...props
}: ComponentProps<"span"> &
  Readonly<{
    variant?: "default" | "quiet"
  }>) {
  return (
    <span
      data-slot="list-row-title"
      className={cn(
        "min-w-0 truncate text-body",
        variant === "default" ? "font-semibold" : "font-normal",
        className
      )}
      {...props}
    />
  )
}

export type { ListRowProps }
