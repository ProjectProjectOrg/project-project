import { RegistryContext } from "@effect/atom-react"
import { isKeyboardNavigating } from "@pp/ui/lib/keyboard"
import { HoverDelegate } from "@pp/ui/tooltip"
import { useRouter } from "@tanstack/react-router"
import {
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react"

import {
  pointAnchor,
  useTicketContextMenu
} from "@/features/tickets/components/ticket-menu/useTicketContextMenu"
import { previewCard } from "@/features/tickets/components/ticket-preview/TicketPreview"
import { keyLabels } from "@/lib/keyLabels"

import {
  FieldMenu,
  isFieldMenu,
  RowGitMenu,
  RowPreview,
  RowScope,
  RowTicketMenu,
  type FieldMenuState,
  type PreviewState,
  type Target
} from "./RowMenus"
import { createRowSources, RowSources, useFollowRow } from "./rowSources"
import { toggleRowSelection, useSelectionStore } from "./TicketSelection"

const fieldAnchor = (field: FieldMenuState, ticketRow: Element) =>
  (field.anchor.isConnected
    ? field.anchor
    : ticketRow.querySelector<HTMLElement>(
        `[data-row-menu="${field.kind}"]`
      )) ?? field.row

const rowTarget = (
  sources: ReturnType<typeof createRowSources>,
  element: Element
) => {
  const ticketRow = element.closest("[data-ticket-id]")
  const source = ticketRow === null ? undefined : sources.get(ticketRow)
  const row = ticketRow?.querySelector<HTMLElement>('[data-slot="list-row"]')
  if (source === undefined || !row) return null
  return { source, row, anchor: row } satisfies Target
}

type MenuAt = Parameters<ReturnType<typeof useTicketContextMenu>["showAt"]>[0]

const TICKET_PREVIEW_DELAY_MS = 550
const PRELOAD_DELAY_MS = 50

const inTextField = (target: Element) =>
  target.closest("input, textarea, select, [contenteditable='true']") !== null

export function RowControls({
  root,
  children
}: Readonly<{ root: RefObject<HTMLElement | null>; children: ReactNode }>) {
  const [sources] = useState(createRowSources)
  const registry = use(RegistryContext)
  const store = useSelectionStore()
  const router = useRouter()
  const [field, setField] = useState<FieldMenuState | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [menuTarget, setMenuTarget] = useState<Target | null>(null)
  const [gitTarget, setGitTarget] = useState<Target | null>(null)
  const ticketMenu = useTicketContextMenu()
  const gitMenu = useTicketContextMenu()
  useMarkOpen(field?.open ? field.anchor : null, true)
  useMarkOpen(preview?.open ? preview.anchor : null, false)
  useMarkOpen(ticketMenu.open ? (menuTarget?.row ?? null) : null, false)
  useMarkOpen(gitMenu.open ? (gitTarget?.anchor ?? null) : null, false)

  useFollowRow(sources, field, setField, fieldAnchor)
  useFollowRow(sources, menuTarget, setMenuTarget)
  useFollowRow(sources, gitTarget, setGitTarget)

  const toggle = (target: Target, extend: boolean) => {
    if (store !== null)
      toggleRowSelection(
        registry,
        store,
        target.source.key,
        target.source.update.remove,
        extend
      )
  }
  const openTicketMenu = (target: Target, at: MenuAt) => {
    setPreview(null)
    setMenuTarget(target)
    ticketMenu.showAt(at)
  }
  const openGitMenu = (target: Target, chip: HTMLElement, at: MenuAt) => {
    setPreview(null)
    setGitTarget({ ...target, anchor: chip })
    gitMenu.showAt(at)
  }
  const hidePreview = () =>
    setPreview((current) =>
      current?.open ? { ...current, open: false } : current
    )
  useRowEvents(root, {
    targetOf: (element) => rowTarget(sources, element),
    preload: ({ source }) =>
      void router
        .preloadRoute({
          to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
          params: { ...source.project.params, id: source.ticket.id },
          search: source.search ?? {}
        })
        .catch(() => undefined),
    click: (event, target, element) => {
      if (element.closest("[data-row-select]") !== null) {
        toggle(target, event.shiftKey)
        return
      }
      const opener = element.closest<HTMLElement>("[data-row-menu]")
      const kind = opener?.dataset.rowMenu
      if (
        opener !== null &&
        isFieldMenu(kind) &&
        !opener.matches(":disabled")
      ) {
        setPreview(null)
        setField((current) => ({
          ...target,
          anchor: opener,
          kind,
          open: true,
          id: (current?.id ?? 0) + 1
        }))
        return
      }
      const link = element.closest<HTMLAnchorElement>("a[href]")
      const href = link?.getAttribute("href")
      if (
        !link ||
        !href?.startsWith("/") ||
        link.target !== "" ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      event.preventDefault()
      void router.navigate({
        href,
        state: link.matches("[data-item-link], [data-row-title]")
          ? { ticketTitle: target.source.ticket.title }
          : undefined
      })
    },
    contextMenu: (event, target, element) => {
      event.preventDefault()
      const at = pointAnchor(event.clientX, event.clientY)
      const chip = element.closest<HTMLElement>("[data-git-chip]")
      if (chip === null) openTicketMenu(target, at)
      else openGitMenu(target, chip, at)
    },
    keyDown: (event, target, element) => {
      if (
        (event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")) &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault()
        event.stopPropagation()
        const chip = element.closest<HTMLElement>("[data-git-chip]")
        if (chip === null) openTicketMenu(target, target.row)
        else openGitMenu(target, chip, chip)
        return
      }
      if (event.key !== " " || event.metaKey || event.ctrlKey || event.altKey)
        return
      const select = element.matches("[data-row-select]")
      if (!select && (event.shiftKey || !element.matches("[data-item-link]")))
        return
      event.preventDefault()
      if (event.repeat) return
      if (select) {
        toggle(target, event.shiftKey)
      } else {
        setPreview((current) =>
          current?.open && current.source.key === target.source.key
            ? { ...current, open: false }
            : previewAt(target)
        )
      }
    },
    hoverTitle: (target) =>
      setPreview((current) =>
        current?.open && current.source.key !== target.source.key
          ? { ...current, open: false }
          : current
      ),
    showPreview: (target) =>
      setPreview((current) =>
        current?.open && current.source.key === target.source.key
          ? current
          : previewAt(target)
      ),
    hidePreview
  })

  return (
    <RowSources value={sources}>
      {children}
      <HoverDelegate
        root={root}
        side="bottom"
        keyLabels={keyLabels()}
        card={(trigger) => previewCard(registry, trigger)}
      />
      {field !== null && (
        <RowScope source={field.source}>
          <FieldMenu
            key={field.id}
            menu={field}
            onOpenChange={(open) =>
              setField((current) => current && { ...current, open })
            }
          />
        </RowScope>
      )}
      {preview !== null && (
        <RowScope source={preview.source}>
          <RowPreview preview={preview} onClose={hidePreview} />
        </RowScope>
      )}
      {menuTarget !== null && (
        <RowScope source={menuTarget.source}>
          <RowTicketMenu
            key={menuTarget.source.key}
            source={menuTarget.source}
            context={ticketMenu}
          />
        </RowScope>
      )}
      {gitTarget !== null && (
        <RowScope source={gitTarget.source}>
          <RowGitMenu
            key={gitTarget.source.key}
            target={gitTarget}
            context={gitMenu}
          />
        </RowScope>
      )}
    </RowSources>
  )
}

type RowEvents = Readonly<{
  targetOf: (element: Element) => Target | null
  preload: (target: Target) => void
  click: (event: MouseEvent, target: Target, element: Element) => void
  contextMenu: (event: MouseEvent, target: Target, element: Element) => void
  keyDown: (event: KeyboardEvent, target: Target, element: Element) => void
  hoverTitle: (target: Target) => void
  showPreview: (target: Target) => void
  hidePreview: () => void
}>

function useRowEvents(root: RefObject<HTMLElement | null>, events: RowEvents) {
  const latest = useRef(events)
  useLayoutEffect(() => {
    latest.current = events
  })
  useEffect(() => {
    const element = root.current
    if (element === null) return undefined
    let preloadRow: Element | null = null
    let preloadTimer: number | undefined
    let title: Element | null = null
    let previewTimer: number | undefined
    const elementOf = (event: Event) =>
      event.target instanceof Element ? event.target : null
    const inRow = (
      event: Event,
      run: (target: Target, element: Element) => void
    ) => {
      const element = elementOf(event)
      const target = element === null ? null : latest.current.targetOf(element)
      if (element !== null && target !== null) run(target, element)
    }
    const onClick = (event: MouseEvent) => {
      if (!event.defaultPrevented)
        inRow(event, (target, at) => latest.current.click(event, target, at))
    }
    const onContextMenu = (event: MouseEvent) =>
      inRow(event, (target, at) => {
        if (!inTextField(at)) latest.current.contextMenu(event, target, at)
      })
    const onKeyDown = (event: KeyboardEvent) =>
      inRow(event, (target, at) => {
        if (!event.defaultPrevented && !inTextField(at))
          latest.current.keyDown(event, target, at)
      })
    const onMouseDown = (event: MouseEvent) => {
      if (event.shiftKey && elementOf(event)?.closest("[data-row-select]"))
        event.preventDefault()
    }
    const onPointerOver = (event: PointerEvent) => {
      const target = elementOf(event)
      if (target === null) return
      const row = target.closest("[data-ticket-id]")
      if (row !== preloadRow) {
        window.clearTimeout(preloadTimer)
        preloadRow = row
        const found = latest.current.targetOf(target)
        if (found !== null)
          preloadTimer = window.setTimeout(
            () => latest.current.preload(found),
            PRELOAD_DELAY_MS
          )
      }
      if (event.pointerType === "touch") return
      const hovered = target.closest("[data-row-title]")
      if (hovered === null || hovered === title) return
      title = hovered
      window.clearTimeout(previewTimer)
      const found = latest.current.targetOf(hovered)
      if (isKeyboardNavigating(hovered) || found === null) return
      latest.current.hoverTitle(found)
      previewTimer = window.setTimeout(
        () => latest.current.showPreview(found),
        TICKET_PREVIEW_DELAY_MS
      )
    }
    const onPointerOut = (event: PointerEvent) => {
      const next =
        event.relatedTarget instanceof Node ? event.relatedTarget : null
      if (preloadRow !== null && !(next && preloadRow.contains(next))) {
        window.clearTimeout(preloadTimer)
        preloadRow = null
      }
      if (title === null || (next && title.contains(next))) return
      const left = title
      title = null
      window.clearTimeout(previewTimer)
      if (!isKeyboardNavigating(left)) latest.current.hidePreview()
    }
    const onFocusIn = (event: FocusEvent) => {
      const target = elementOf(event)
      const found = target?.matches("[data-item-link]")
        ? latest.current.targetOf(target)
        : null
      if (found) latest.current.preload(found)
    }
    element.addEventListener("click", onClick)
    element.addEventListener("contextmenu", onContextMenu)
    element.addEventListener("keydown", onKeyDown)
    element.addEventListener("mousedown", onMouseDown)
    element.addEventListener("pointerover", onPointerOver)
    element.addEventListener("pointerout", onPointerOut)
    element.addEventListener("focusin", onFocusIn)
    return () => {
      window.clearTimeout(preloadTimer)
      window.clearTimeout(previewTimer)
      element.removeEventListener("click", onClick)
      element.removeEventListener("contextmenu", onContextMenu)
      element.removeEventListener("keydown", onKeyDown)
      element.removeEventListener("mousedown", onMouseDown)
      element.removeEventListener("pointerover", onPointerOver)
      element.removeEventListener("pointerout", onPointerOut)
      element.removeEventListener("focusin", onFocusIn)
    }
  }, [root])
}

const previewAt = (target: Target) =>
  ({
    ...target,
    anchor:
      target.row.querySelector<HTMLElement>("[data-row-title]") ?? target.row,
    open: true
  }) satisfies PreviewState

function useMarkOpen(element: HTMLElement | null, expanded: boolean) {
  useLayoutEffect(() => {
    if (element === null) return undefined
    element.setAttribute("data-popup-open", "")
    if (expanded) element.setAttribute("aria-expanded", "true")
    return () => {
      element.removeAttribute("data-popup-open")
      if (expanded) element.removeAttribute("aria-expanded")
    }
  }, [element, expanded])
}
