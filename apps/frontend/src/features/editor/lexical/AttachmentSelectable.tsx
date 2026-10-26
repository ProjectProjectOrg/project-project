import type { AttachmentDensity } from "@pp/shared"
import type { NodeKey } from "lexical"
import { Maximize2, Minimize2, Trash2 } from "lucide-react"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion
} from "motion/react"
import { useLayoutEffect, useRef, type ReactNode } from "react"

import { useDecoratorSelection } from "@/features/editor/hooks/useDecoratorSelection"
import { standardEaseCss, transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { NodeOverlayAction } from "./NodeOverlayAction"

const INTERACTIVE_SELECTOR =
  "a, button, [data-attachment-action], [data-attachment-resize]"

const CONTENT_MORPH = { ...transitions.morph, opacity: transitions.fade }

const morphSizes = new WeakMap<HTMLElement, { width: number; height: number }>()

export function AttachmentSelectable({
  nodeKey,
  deletable,
  density,
  onToggleDensity,
  children
}: Readonly<{
  nodeKey: NodeKey
  deletable: boolean
  density: AttachmentDensity
  onToggleDensity?: () => void
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
      animation = element.animate(
        [
          { width: `${previous.width}px`, height: `${previous.height}px` },
          { width: `${next.width}px`, height: `${next.height}px` }
        ],
        { duration: transitions.morph.duration * 1000, easing: standardEaseCss }
      )
      animation.addEventListener("finish", unpin, { once: true })
    }

    const image = element.querySelector("img")
    if (previous !== undefined && image !== null && !image.complete) {
      element.style.width = `${previous.width}px`
      element.style.height = `${previous.height}px`
      element.style.overflow = "hidden"
      image.addEventListener("load", settle, { once: true })
      image.addEventListener("error", settle, { once: true })
      return () => {
        cancelled = true
        image.removeEventListener("load", settle)
        image.removeEventListener("error", settle)
        animation?.cancel()
        unpin()
      }
    }

    settle()
    return () => {
      cancelled = true
      animation?.cancel()
      unpin()
    }
  }, [density, reduceMotion])

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
      className="inline-block max-w-full align-middle"
      onMouseDown={selectOnPointer}
    >
      <span
        ref={wrapperRef}
        data-attachment-selected={isSelected ? "true" : undefined}
        className={cn(
          "group/hitbox relative inline-block max-w-full align-middle transition-shadow duration-150 focus-within:z-20 hover:z-20",
          compact ? "my-0.5 rounded-md" : "my-2 rounded-xl",
          isSelected
            ? "z-20 ring-2 ring-ring ring-offset-2 ring-offset-background"
            : "z-0 ring-0 ring-transparent"
        )}
      >
        <LayoutGroup id={morphId}>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              ref={contentRef}
              data-attachment-content="true"
              key={compact ? "compact" : "expanded"}
              layoutId={morphId}
              transition={CONTENT_MORPH}
              className="block"
            >
              {children}
            </motion.span>
          </AnimatePresence>
          {deletable ? (
            <NodeOverlayAction
              morphId={`${morphId}-remove`}
              slot={cn(overlaySlot, compact ? "right-full mr-1" : "-left-2")}
              label={m.editor_attachment_remove()}
              variant="overlay-destructive"
              onClick={remove}
            >
              <Trash2 strokeWidth={1.75} />
            </NodeOverlayAction>
          ) : null}
          {onToggleDensity === undefined ? null : (
            <NodeOverlayAction
              morphId={`${morphId}-density`}
              slot={cn(overlaySlot, compact ? "left-full ml-1" : "-right-2")}
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
