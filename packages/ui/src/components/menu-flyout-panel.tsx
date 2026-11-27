import * as React from "react"
import { createPortal } from "react-dom"

import { placeFlyout, typeaheadIndex } from "../lib/menuFlyout"
import { cn } from "../lib/utils"
import {
  FlyoutFilterContext,
  FlyoutPanelContext,
  FlyoutRootContext,
  FlyoutSubContext,
  useFlyoutOpen,
  usePreparedAfterPaint,
  type PanelController
} from "./menu-flyout"
import { MenuHighlight, chosenRow } from "./menu-highlight"
import {
  MENU_ROW_INSET,
  PopupLayerContext,
  SUBMENU_GAP,
  menuSurfaceClass
} from "./menu-styles"

const ROW = "[role^=menuitem]:not([data-disabled])"
const INPUT = "[data-slot=dropdown-menu-input]"
const VIEWPORT_MARGIN = 5
const TYPEAHEAD_MS = 750

const flyoutPanelClass =
  "absolute top-0 left-0 invisible opacity-0 transition-[opacity,visibility] duration-80 ease-standard data-[open]:visible data-[open]:opacity-100 data-[open]:transition-none data-[closed]:pointer-events-none motion-reduce:transition-none"

const rowsOf = (panel: HTMLElement) =>
  Array.from(panel.querySelectorAll<HTMLElement>(ROW))

const labelOf = (row: HTMLElement) => row.dataset.label ?? row.textContent ?? ""

const ownerOf = (panel: HTMLElement) =>
  panel.querySelector<HTMLElement>(INPUT) ?? panel

// Where the panel goes beside its row, written straight to its style. Read
// while the panel is hidden (on resize or scroll), so opening it reads nothing.
function placePanel(panel: HTMLElement, triggerId: string) {
  const popup = panel.parentElement?.parentElement
  const trigger = document.getElementById(triggerId)
  if (!popup || !trigger) return false
  const popupBox = popup.getBoundingClientRect()
  const scale = popupBox.width / popup.offsetWidth || 1
  const size = { width: panel.offsetWidth, height: panel.scrollHeight }
  const placement = placeFlyout({
    popup: popupBox,
    trigger: trigger.getBoundingClientRect(),
    panel: size,
    viewport: {
      width: document.documentElement.clientWidth,
      height: window.innerHeight
    },
    gap: SUBMENU_GAP,
    inset: MENU_ROW_INSET,
    margin: VIEWPORT_MARGIN
  })
  const left =
    placement.side === "right"
      ? popup.offsetWidth + SUBMENU_GAP
      : -SUBMENU_GAP - size.width
  panel.style.left = `${left}px`
  panel.style.top = `${(placement.top - popupBox.top) / scale}px`
  panel.style.maxHeight = `${placement.maxHeight}px`
  return true
}

function createPanelController(
  panelRef: React.RefObject<HTMLElement | null>,
  options: Readonly<{
    filtered: boolean
    placed: () => boolean
    close: () => void
  }>
) {
  let current: HTMLElement | null = null
  let typed = ""
  let typedAt = 0
  const highlight = (row: HTMLElement | null, reveal = false) => {
    const panel = panelRef.current
    if (panel === null) return
    if (current !== null && !current.isConnected) current = null
    if (row !== current) {
      current?.removeAttribute("data-highlighted")
      row?.setAttribute("data-highlighted", "")
      current = row
      const owner = ownerOf(panel)
      if (row === null) owner.removeAttribute("aria-activedescendant")
      else owner.setAttribute("aria-activedescendant", row.id)
    }
    if (reveal) row?.scrollIntoView({ block: "nearest" })
  }
  const highlightFirst = () => {
    const panel = panelRef.current
    if (panel !== null) highlight(rowsOf(panel)[0] ?? null)
  }
  const step = (rows: ReadonlyArray<HTMLElement>, index: number) =>
    highlight(rows[(index + rows.length) % rows.length] ?? null, true)
  return {
    setOpen: (open) => {
      const panel = panelRef.current
      if (panel === null) return
      panel.toggleAttribute("data-open", open)
      panel.toggleAttribute("data-closed", !open)
      if (!open) return highlight(null)
      options.placed()
      if (options.filtered) highlightFirst()
    },
    highlight,
    highlightFirst,
    focusIn: () => {
      const panel = panelRef.current
      if (panel === null) return
      ownerOf(panel).focus({ preventScroll: true })
      if (options.filtered) return highlightFirst()
      highlight(chosenRow(panel) ?? rowsOf(panel)[0] ?? null, true)
    },
    onPointerMove: (event) => {
      const panel = panelRef.current
      if (panel === null || !(event.target instanceof Element)) return
      const row = event.target.closest<HTMLElement>(ROW)
      if (row !== null && panel.contains(row)) highlight(row)
      if (!panel.contains(document.activeElement))
        ownerOf(panel).focus({ preventScroll: true })
    },
    onPointerLeave: () => {
      if (!options.filtered) highlight(null)
    },
    onKeyDown: (event) => {
      const panel = panelRef.current
      if (panel === null || event.key === "Tab") return
      event.stopPropagation()
      const typing = event.target instanceof HTMLInputElement
      const rows = rowsOf(panel)
      const at = current === null ? -1 : rows.indexOf(current)
      const handled = () => event.preventDefault()
      switch (event.key) {
        case "ArrowDown":
          handled()
          return step(rows, at + 1)
        case "ArrowUp":
          handled()
          return step(rows, at < 0 ? -1 : at - 1)
        case "Home":
        case "End":
          if (typing) return
          handled()
          return step(rows, event.key === "Home" ? 0 : -1)
        case "Enter":
          handled()
          return current?.click()
        case " ":
          if (typing) return
          handled()
          return current?.click()
        case "ArrowLeft":
          if (typing && (event.target as HTMLInputElement).value !== "") return
          handled()
          return options.close()
        case "Escape":
          handled()
          return options.close()
      }
      if (typing || event.key.length !== 1) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      typed =
        event.timeStamp - typedAt > TYPEAHEAD_MS ? event.key : typed + event.key
      typedAt = event.timeStamp
      const index = typeaheadIndex(rows.map(labelOf), at, typed)
      if (index >= 0) highlight(rows[index] ?? null, true)
    }
  } satisfies PanelController
}

export function FlyoutPanel({
  className,
  lazy,
  children
}: Readonly<{
  className: string | undefined
  lazy: boolean
  children: React.ReactNode
}>) {
  const root = React.use(FlyoutRootContext)
  const sub = React.use(FlyoutSubContext)
  if (root === null || sub === null)
    throw new Error("FlyoutPanel needs a FlyoutSub")
  const { level, layer, placers } = root
  const query = React.use(FlyoutFilterContext)?.query
  const prepared = usePreparedAfterPaint()
  const [used, setUsed] = React.useState(false)
  const mounted = used || (prepared && !lazy)
  const active = useFlyoutOpen(sub.id, !mounted)
  if (active && !used) setUsed(true)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const placedRef = React.useRef(false)
  const [controller] = React.useState(() =>
    createPanelController(panelRef, {
      filtered: sub.filtered,
      placed: () => {
        const panel = panelRef.current
        if (panel === null || placedRef.current) return true
        placedRef.current = placePanel(panel, sub.triggerId)
        return placedRef.current
      },
      close: () => {
        if (!level.release(sub.id, "instant")) return
        sub.trigger.current?.focus({ preventScroll: true })
      }
    })
  )
  const show = mounted || active
  React.useLayoutEffect(() => {
    if (!show) return undefined
    const slot = sub.panel
    slot.current = controller
    controller.setOpen(level.active() === sub.id)
    return () => {
      slot.current = null
    }
  }, [show, sub, controller, level])
  React.useLayoutEffect(() => {
    if (level.active() === sub.id) controller.highlightFirst()
  }, [query, level, sub.id, controller])
  React.useEffect(() => {
    const panel = panelRef.current
    if (!show || panel === null) return undefined
    const place = () => {
      placedRef.current = placePanel(panel, sub.triggerId)
    }
    placers.add(place)
    const resizes =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place)
    resizes?.observe(panel)
    return () => {
      placers.delete(place)
      resizes?.disconnect()
    }
  }, [show, placers, sub.triggerId])
  if (!show || layer === null) return null
  return createPortal(
    <div
      ref={panelRef}
      id={sub.panelId}
      role={sub.filtered ? "dialog" : "menu"}
      aria-labelledby={sub.triggerId}
      tabIndex={-1}
      data-slot="dropdown-menu-sub-content"
      data-flyout-panel=""
      data-closed=""
      className={cn(menuSurfaceClass, flyoutPanelClass, className)}
      onPointerMove={controller.onPointerMove}
      onPointerLeave={controller.onPointerLeave}
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
      }}
      onKeyDown={controller.onKeyDown}
    >
      <FlyoutPanelContext value={controller}>
        <PopupLayerContext value={true}>
          <MenuHighlight restOnFirst />
          {children}
        </PopupLayerContext>
      </FlyoutPanelContext>
    </div>,
    layer
  )
}
