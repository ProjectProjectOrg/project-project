import type { AttachmentDensity } from "@pp/shared"
import type { NodeKey } from "lexical"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion
} from "motion/react"
import { useLayoutEffect, useRef, type ReactNode } from "react"

import { Maximize2, Minimize2, Trash2 } from "../../components/icons"
import { NodeOverlayAction } from "../../editor/node-overlay-action"
import { useDecoratorSelection } from "../../editor/use-decorator-selection"
import { standardEaseCss, transitions } from "../../lib/springs"
import { cn } from "../../lib/utils"
import { m } from "../messages"

const INTERACTIVE_SELECTOR =
  "a, button, [data-attachment-action], [data-attachment-resize], [data-attachment-player]"

const CONTENT_MORPH = { ...transitions.morph, opacity: transitions.fade }

const morphSizes = new WeakMap<HTMLElement, { width: number; height: number }>()

const pendingMedia = (element: HTMLElement) => {
  const image = element.querySelector("img")
  if (image !== null && !image.complete)
    return { target: image, ready: "load", rendersLater: false } as const
  const video = element.querySelector("video")
  if (video !== null && video.getBoundingClientRect().height === 0)
    return {
      target: video,
      ready: "loadedmetadata",
      rendersLater: true
    } as const
  return null
}

export function AttachmentSelectable({
  nodeKey,
  image = false,
  deletable,
  density,
  onToggleDensity,
  clipRadius,
  children
}: Readonly<{
  nodeKey: NodeKey
  image?: boolean
  deletable: boolean
  density: AttachmentDensity
  onToggleDensity?: () => void
  clipRadius?: number
  children: ReactNode
}>) {
  const { isSelected, remove, selectOnPointer } = useDecoratorSelection(
    nodeKey,
    { interactive: INTERACTIVE_SELECTOR }
  )

  const wrapperRef = useRef<HTMLSpanElement>(null)
  const contentRef = useRef<HTMLSpanElement>(null)
  const reduceMotion = useReducedMotion() ?? false

  useLayoutEffect(() => {
    const element = wrapperRef.current
    if (element === null) return undefined
    const previous = morphSizes.get(element)
    let animation: Animation | undefined
    let cancelled = false

    const unpin = () => {
      element.style.removeProperty("width")
      element.style.removeProperty("height")
      element.style.removeProperty("overflow")
      const content = contentRef.current
      content?.style.removeProperty("width")
      content?.style.removeProperty("height")
    }

    const settle = () => {
      if (cancelled) return
      unpin()
      const rect = element.getBoundingClientRect()
      const next = { width: rect.width, height: rect.height }
      morphSizes.set(element, next)
      if (previous === undefined || reduceMotion) return
      if (
        Math.abs(previous.width - next.width) < 0.5 &&
        Math.abs(previous.height - next.height) < 0.5
      ) {
        return
      }
      const content = contentRef.current
      if (content !== null) {
        content.style.width = `${next.width}px`
        content.style.height = `${next.height}px`
      }
      if (image) element.style.overflow = "clip"
      animation = element.animate(
        [
          { width: `${previous.width}px`, height: `${previous.height}px` },
          { width: `${next.width}px`, height: `${next.height}px` }
        ],
        { duration: transitions.morph.duration * 1000, easing: standardEaseCss }
      )
      animation.addEventListener("finish", unpin, { once: true })
    }

    const observer = new ResizeObserver(() => {
      morphSizes.set(element, element.getBoundingClientRect())
    })
    observer.observe(element)
    const media =
      density === "compact" || !contentRef.current
        ? null
        : pendingMedia(contentRef.current)
    if (previous !== undefined && media !== null) {
      element.style.width = `${previous.width}px`
      element.style.height = `${previous.height}px`
      element.style.overflow = "hidden"
      const onReady = media.rendersLater
        ? () => requestAnimationFrame(() => requestAnimationFrame(settle))
        : settle
      media.target.addEventListener(media.ready, onReady, { once: true })
      media.target.addEventListener("error", settle, { once: true })
      return () => {
        observer.disconnect()
        cancelled = true
        media.target.removeEventListener(media.ready, onReady)
        media.target.removeEventListener("error", settle)
        animation?.cancel()
        unpin()
      }
    }

    settle()
    return () => {
      observer.disconnect()
      cancelled = true
      animation?.cancel()
      unpin()
    }
  }, [density, image, reduceMotion])

  const compact = density === "compact"
  const overlaySlot = cn(
    "absolute flex h-8 items-center",
    compact
      ? "-top-1 before:absolute before:-inset-x-3 before:inset-y-0 before:content-['']"
      : "-top-2"
  )
  const morphId = `attachment-${nodeKey}`

  return (
    <span
      className={cn(
        "inline-chip inline-block max-w-full",
        compact && !image && "px-9"
      )}
      onMouseDown={selectOnPointer}
    >
      <span
        ref={wrapperRef}
        data-attachment-selected={isSelected ? "true" : undefined}
        className={cn(
          "group/hitbox relative inline-block max-w-full align-middle transition-shadow duration-150 [--chip-shift:0px] focus-within:z-20 hover:z-20",
          // The ring follows the attachment's own shape: a chip's
          // half-height squircle, or the 18px surface of a tile, image or video.
          compact
            ? "my-0.5 rounded-[10px] [corner-shape:var(--button-corner)]"
            : "my-2 rounded-[18px] corner-squircle",
          isSelected && !image
            ? "z-20 ring-2 ring-ring ring-offset-2 ring-offset-background"
            : "z-0 ring-0 ring-transparent"
        )}
      >
        <LayoutGroup id={morphId}>
          {image ? (
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={density}
                ref={contentRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transitions.morph}
                className="block max-w-full"
              >
                {children}
              </motion.span>
            </AnimatePresence>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                ref={contentRef}
                data-attachment-content="true"
                key={compact ? "compact" : "expanded"}
                layoutId={morphId}
                transition={CONTENT_MORPH}
                style={
                  clipRadius === undefined
                    ? undefined
                    : { borderRadius: clipRadius, overflow: "hidden" }
                }
                className="block"
              >
                {children}
              </motion.span>
            </AnimatePresence>
          )}
          {deletable && !image ? (
            <NodeOverlayAction
              morphId={`${morphId}-remove`}
              slot={cn(overlaySlot, compact ? "right-full mr-1" : "left-1")}
              label={m.editor_attachment_remove()}
              variant="overlay-destructive"
              onClick={remove}
            >
              <Trash2 strokeWidth={1.75} />
            </NodeOverlayAction>
          ) : null}
          {onToggleDensity === undefined || image ? null : (
            <NodeOverlayAction
              morphId={`${morphId}-density`}
              slot={cn(overlaySlot, compact ? "left-full ml-1" : "right-1")}
              label={
                compact
                  ? m.editor_attachment_view_rich()
                  : m.editor_attachment_view_compact()
              }
              variant="overlay"
              onClick={onToggleDensity}
            >
              {compact ? (
                <Maximize2 strokeWidth={1.75} />
              ) : (
                <Minimize2 strokeWidth={1.75} />
              )}
            </NodeOverlayAction>
          )}
        </LayoutGroup>
      </span>
    </span>
  )
}
