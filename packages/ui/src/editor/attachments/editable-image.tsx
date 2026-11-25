import { attachmentDownloadSrc } from "@pp/shared"
import { useEffect, useRef, useCallback, useState, type ReactNode } from "react"
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
import { PopupHotkeyScope } from "../../components/popup-hotkey-scope"
import { cn } from "../../lib/utils"
import { m } from "../messages"
import { useImageZoom } from "./useImageZoom"

const imageActionClass =
  "size-8 justify-center rounded-[16px] p-0 has-[>svg:first-child]:pl-0 [&>svg]:size-3.5"

export function EditableImage({
  url,
  alt,
  filename,
  children,
  onExpand,
  onKeyboardExpand,
  onRemove
}: Readonly<{
  url: string
  alt: string
  filename: string
  children: ReactNode
  onExpand: () => void
  onKeyboardExpand: () => void
  onRemove: () => void
}>) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const viewer = useRef<HTMLDivElement>(null)
  const {
    zoom,
    viewport,
    scale,
    toggleZoom,
    animation,
    setZoom,
    reduceMotion
  } = useImageZoom()
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
        setViewerOpen(false)
        return
      }
      scale.current = 100
      flushSync(() => {
        setZoom(100)
        setViewerOpen(true)
      })
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
  const cancelExpand = useCallback(() => {
    window.clearTimeout(pendingExpand.current)
    pendingExpand.current = undefined
  }, [])
  useEffect(() => cancelExpand, [cancelExpand])
  const openViewer = (trigger: HTMLElement | null) => {
    cancelExpand()
    returnFocus.current = trigger
    changeViewer(true)
  }

  const fileActions = (
    <>
      <DropdownMenuItem
        render={
          <a
            aria-label={m.editor_attachment_download()}
            href={attachmentDownloadSrc(url)}
            download={filename}
          />
        }
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
        describeError={m.editor_embed_remove_failed}
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
            className="max-w-full min-w-0 shrink select-none group-data-[attachment-selected]/hitbox:inset-ring-1 group-data-[attachment-selected]/hitbox:inset-ring-ring active:scale-[0.97]"
            render={<button type="button" aria-label={filename} />}
            onClick={(event) => {
              cancelExpand()
              if (event.detail === 0) {
                onKeyboardExpand()
              } else if (event.detail === 1) {
                const trigger = event.currentTarget
                pendingExpand.current = window.setTimeout(() => {
                  if (document.activeElement === trigger) {
                    trigger
                      .closest<HTMLElement>('[contenteditable="true"]')
                      ?.focus({ preventScroll: true })
                  }
                  onExpand()
                }, 250)
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
            data-attachment-expanded-actions={children ? "" : undefined}
            className={cn(
              "opacity-0 group-focus-within/reveal:opacity-100 group-hover/reveal:opacity-100 group-data-[viewer-transition]/reveal:invisible aria-expanded:opacity-100 [@media(hover:none)]:opacity-100",
              children
                ? "image-control-reveal absolute -top-2 -right-2 z-10 [--reveal-y:3px] group-has-[[data-resizing]]/reveal:opacity-100"
                : "transition-opacity"
            )}
            render={
              children ? (
                <Badge
                  render={
                    <button
                      type="button"
                      aria-label={m.editor_attachment_actions()}
                    />
                  }
                  className={imageActionClass}
                />
              ) : (
                <button
                  type="button"
                  aria-label={m.editor_attachment_actions()}
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
          role="dialog"
          popover="manual"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              const buttons = event.currentTarget.querySelectorAll("button")
              const first = buttons[0]
              const last = buttons[buttons.length - 1]
              if (
                event.shiftKey &&
                (event.target === first || event.target === event.currentTarget)
              ) {
                event.preventDefault()
                last?.focus()
              } else if (!event.shiftKey && event.target === last) {
                event.preventDefault()
                first?.focus()
              }
            }
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              changeViewer(false)
            }
          }}
          aria-label={filename}
          className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-background p-4 text-foreground outline-none"
        >
          <PopupHotkeyScope open={viewerOpen}>
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
              render={
                <button
                  type="button"
                  aria-label={m.editor_attachment_exit_fullscreen()}
                />
              }
              className={cn(imageActionClass, "absolute top-4 right-4")}
              data-image-viewer-close=""
              onClick={() => changeViewer(false)}
            >
              <X aria-hidden="true" />
            </Badge>
          </PopupHotkeyScope>
        </div>,
        document.body
      )}
    </ContextMenu>
  )
}
