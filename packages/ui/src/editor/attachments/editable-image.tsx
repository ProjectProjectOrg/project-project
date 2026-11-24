import { attachmentDownloadSrc } from "@pp/shared"
import { animate, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { flushSync, createPortal } from "react-dom"

import { Badge } from "../../components/badge"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent
} from "../../components/context-menu"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuConfirmItem
} from "../../components/dropdown-menu"
import {
  Download,
  Image as ImageIcon,
  Maximize,
  Maximize2,
  MoreHorizontal,
  Minimize2,
  Trash2,
  X
} from "../../components/icons"
import { chipIconActionClass } from "../../components/morph-icon-link"
import { cn } from "../../lib/utils"
import { m } from "../messages"

const imageActionClass =
  "size-8 justify-center rounded-[16px] p-0 has-[>svg:first-child]:pl-0 [&>svg]:size-3.5"

export function EditableImage({
  url,
  alt,
  filename,
  children,
  onExpand,
  onRemove
}: Readonly<{
  url: string
  alt: string
  filename: string
  children: ReactNode
  onExpand: () => void
  onRemove: () => void
}>) {
  const viewer = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(100)
  const viewport = useRef<HTMLDivElement>(null)
  const scale = useRef(100)
  const zoomAt = (next: number, clientX: number, clientY: number) => {
    const el = viewport.current
    if (!el) return
    const value = Math.min(400, Math.max(100, next))
    const ratio = value / scale.current
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const left = (el.scrollLeft + x) * ratio - x
    const top = (el.scrollTop + y) * ratio - y
    scale.current = value
    flushSync(() => setZoom(value))
    el.scrollTo(left, top)
  }

  const animation = useRef<ReturnType<typeof animate<number>> | null>(null)
  const reduceMotion = useReducedMotion()
  const toggleZoom = (x: number, y: number) => {
    animation.current?.stop()
    const target = scale.current > 100 ? 100 : 200
    if (reduceMotion) {
      zoomAt(target, x, y)
      return
    }
    animation.current = animate(scale.current, target, {
      duration: 0.18,
      ease: "easeOut",
      onUpdate: (value) => zoomAt(value, x, y)
    })
  }

  const source = useRef<HTMLSpanElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const fullImage = useRef<HTMLImageElement>(null)
  const changeViewer = (open: boolean) => {
    const panel = viewer.current
    if (!panel || open === panel.matches(":popover-open")) return
    animation.current?.stop()
    const change = () => {
      if (!open) {
        if (
          document.activeElement instanceof HTMLElement &&
          panel.contains(document.activeElement)
        )
          document.activeElement.blur()
        panel.hidePopover()
        return
      }
      scale.current = 100
      flushSync(() => setZoom(100))
      panel.showPopover()
      viewport.current?.scrollTo(0, 0)
      panel.focus({ preventScroll: true })
    }
    const restoreFocus = () => {
      if (
        !open &&
        !panel.matches(":popover-open") &&
        document.activeElement === document.body
      ) {
        returnFocus.current?.focus({ preventScroll: true })
      }
    }
    if (!document.startViewTransition) {
      change()
      restoreFocus()
      return
    }
    const inline = source.current?.querySelector("img")
    const full = fullImage.current
    const from = open ? inline : full
    const to = open ? full : inline
    const shared = !reduceMotion && from && to
    const origin = source.current
    origin?.setAttribute("data-viewer-transition", "")
    if (
      open &&
      document.activeElement instanceof HTMLElement &&
      origin?.contains(document.activeElement)
    )
      document.activeElement.blur()
    if (shared) from.style.viewTransitionName = "attachment-photo"
    const transition = document.startViewTransition({
      types: ["attachment-viewer"],
      update: () => {
        if (shared) {
          from.style.removeProperty("view-transition-name")
          to.style.viewTransitionName = "attachment-photo"
        }
        change()
      }
    })
    void transition.finished.finally(() => {
      origin?.removeAttribute("data-viewer-transition")
      from?.style.removeProperty("view-transition-name")
      to?.style.removeProperty("view-transition-name")
      restoreFocus()
    })
  }
  const pendingExpand = useRef<number | undefined>(undefined)
  const cancelExpand = () => {
    window.clearTimeout(pendingExpand.current)
    pendingExpand.current = undefined
  }
  useEffect(() => cancelExpand, [])
  const openViewer = (trigger: HTMLElement | null) => {
    cancelExpand()
    returnFocus.current = trigger
    changeViewer(true)
  }

  useEffect(() => {
    const el = viewport.current
    if (!el) return
    let gestureStart = 0
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      animation.current?.stop()
      event.preventDefault()
      if (!gestureStart)
        zoomAt(
          scale.current * Math.exp(-event.deltaY / 100),
          event.clientX,
          event.clientY
        )
    }
    const gesture = (event: Event) => {
      animation.current?.stop()
      event.preventDefault()
      if (event.type === "gestureend") {
        gestureStart = 0
        return
      }
      if (event.type === "gesturestart") gestureStart = scale.current
      if (
        "scale" in event &&
        typeof event.scale === "number" &&
        event instanceof MouseEvent
      )
        zoomAt(gestureStart * event.scale, event.clientX, event.clientY)
      else if ("scale" in event && typeof event.scale === "number") {
        const rect = el.getBoundingClientRect()
        zoomAt(
          gestureStart * event.scale,
          "clientX" in event && typeof event.clientX === "number"
            ? event.clientX
            : rect.left + rect.width / 2,
          "clientY" in event && typeof event.clientY === "number"
            ? event.clientY
            : rect.top + rect.height / 2
        )
      }
    }
    el.addEventListener("wheel", wheel, { passive: false })
    const events = ["gesturestart", "gesturechange", "gestureend"]
    for (const name of events)
      el.addEventListener(name, gesture, { passive: false })
    return () => {
      animation.current?.stop()
      el.removeEventListener("wheel", wheel)
      for (const name of events) el.removeEventListener(name, gesture)
    }
  }, [])
  const fileActions = (
    <>
      <DropdownMenuItem
        render={<a href={attachmentDownloadSrc(url)} download={filename} />}
      >
        <Download aria-hidden="true" />
        {m.editor_attachment_download()}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuConfirmItem
        icon={<Trash2 aria-hidden="true" />}
        label={m.editor_attachment_remove()}
        confirmLabel={m.editor_attachment_remove_confirm()}
        busyLabel={m.editor_attachment_removing()}
        onConfirm={onRemove}
        describeError={m.editor_attachment_remove_confirm}
      />
    </>
  )
  const items = (
    <>
      <DropdownMenuItem onClick={onExpand}>
        {children ? <Minimize2 /> : <Maximize2 />}
        {children
          ? m.editor_attachment_collapse()
          : m.editor_attachment_expand()}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() =>
          requestAnimationFrame(() =>
            openViewer(
              source.current?.querySelector<HTMLElement>(
                '[data-slot="dropdown-menu-trigger"]'
              ) ?? null
            )
          )
        }
      >
        <Maximize aria-hidden="true" />
        {m.editor_attachment_fullscreen()}
      </DropdownMenuItem>
      {fileActions}
    </>
  )
  return (
    <ContextMenu>
      <ContextMenuTrigger
        onDoubleClick={(event) => {
          if (children && event.target instanceof HTMLImageElement)
            openViewer(
              source.current?.closest<HTMLElement>(
                '[contenteditable="true"]'
              ) ?? null
            )
        }}
        render={
          <span
            ref={source}
            className="group/reveal relative inline-flex max-w-full items-center gap-1"
          />
        }
      >
        {children || (
          <Badge
            size="xs"
            className="max-w-full min-w-0 shrink select-none active:scale-[0.97]"
            render={<button type="button" />}
            onClick={(event) => {
              cancelExpand()
              if (event.detail === 0) {
                onExpand()
              } else if (event.detail === 1) {
                pendingExpand.current = window.setTimeout(onExpand, 250)
              }
            }}
            onDoubleClick={(event) => openViewer(event.currentTarget)}
            onBlur={cancelExpand}
            title={m.editor_attachment_expand()}
          >
            <ImageIcon aria-hidden="true" />
            <span className="truncate">{filename}</span>
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={m.editor_attachment_actions()}
            className={cn(
              "opacity-0 group-focus-within/reveal:opacity-100 group-hover/reveal:opacity-100 group-data-[viewer-transition]/reveal:invisible aria-expanded:opacity-100 [@media(hover:none)]:opacity-100",
              children
                ? "image-control-reveal absolute -top-2 -right-2 z-10 [--reveal-y:3px] group-has-[[data-resizing]]/reveal:opacity-100"
                : "transition-opacity"
            )}
            render={
              children ? (
                <Badge
                  render={<button type="button" />}
                  className={imageActionClass}
                />
              ) : (
                <button
                  type="button"
                  className={cn(
                    chipIconActionClass,
                    "size-5 rounded-[10px] bg-foreground/10 text-foreground [corner-shape:var(--button-corner)] before:absolute before:-inset-0.5 hover:bg-foreground/15"
                  )}
                />
              )
            }
          >
            <MoreHorizontal className="size-4" strokeWidth={2.25} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">{items}</DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">{items}</ContextMenuContent>
      {createPortal(
        <div
          ref={viewer}
          popover="manual"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              changeViewer(false)
            }
          }}
          aria-label={filename}
          className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-background p-4 text-foreground outline-none"
        >
          <div
            ref={viewport}
            className="size-full overflow-auto overscroll-contain"
          >
            <button
              type="button"
              aria-label={
                zoom > 100
                  ? m.editor_attachment_zoom_out()
                  : m.editor_attachment_zoom_in()
              }
              style={{ width: `${zoom}%`, height: `${zoom}%` }}
              className={cn(
                "[container-type:size] grid place-items-center",
                zoom > 100 ? "cursor-zoom-out" : "cursor-zoom-in"
              )}
              onClick={(event) => {
                const rect = viewport.current?.getBoundingClientRect()
                if (rect)
                  toggleZoom(
                    event.detail ? event.clientX : rect.left + rect.width / 2,
                    event.detail ? event.clientY : rect.top + rect.height / 2
                  )
              }}
            >
              <img
                ref={fullImage}
                onLoad={(event) => {
                  const img = event.currentTarget
                  img.style.setProperty(
                    "--image-aspect",
                    String(img.naturalWidth / img.naturalHeight)
                  )
                }}
                src={url}
                alt={alt || filename}
                loading={children ? "eager" : "lazy"}
                draggable={false}
                className="h-auto w-[min(100cqw,calc(100cqh*var(--image-aspect,1)))]"
              />
            </button>
          </div>
          <Badge
            data-image-viewer-zoom=""
            className="pointer-events-none absolute top-4 left-4 h-8 rounded-[16px] px-2.5 tabular-nums"
          >
            {Math.round(zoom)}%
          </Badge>
          <Badge
            render={<button type="button" />}
            className={cn(imageActionClass, "absolute top-4 right-4")}
            data-image-viewer-close=""
            aria-label={m.editor_attachment_exit_fullscreen()}
            onClick={() => changeViewer(false)}
          >
            <X aria-hidden="true" />
          </Badge>
        </div>,
        document.body
      )}
    </ContextMenu>
  )
}
