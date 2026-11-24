import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ATTACHMENT_MIN_WIDTH, clampAttachmentWidth } from "@pp/shared"
import { $getNodeByKey, type NodeKey } from "lexical"
import { motion, type MotionProps } from "motion/react"
import { useRef, useState } from "react"

import {
  ATTACHMENT_IMAGE_CLASS,
  attachmentWidthStyle
} from "../../editor/attachment-image-style"
import { cn } from "../../lib/utils"
import { $isAttachmentNode } from "./attachment-node"

// An image attachment in the editor: sized to its saved width, resizable, and broken-aware.

export const contentWidth = (element: HTMLElement | null) => {
  if (element === null) return null
  const style = getComputedStyle(element)
  const inner =
    element.clientWidth -
    Number.parseFloat(style.paddingLeft) -
    Number.parseFloat(style.paddingRight)
  return Number.isFinite(inner) && inner > 0 ? inner : null
}

export function AttachmentImage({
  url,
  alt,
  width,
  nodeKey,
  onBroken
}: {
  url: string
  alt: string
  width: number | null
  nodeKey: NodeKey
  onBroken: () => void
}) {
  const [editor] = useLexicalComposerContext()
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const dragStart = useRef<{
    width: number
    container: number
    direction: number
  } | null>(null)

  const measure = (offsetX: number) => {
    const img = imgRef.current
    const start = dragStart.current
    if (!img || !start) return ATTACHMENT_MIN_WIDTH
    return clampAttachmentWidth({
      width: start.width + offsetX * start.direction,
      containerWidth: start.container
    })
  }

  const onPanStart = (direction: number) => {
    const img = imgRef.current
    if (!img) return
    const width = img.getBoundingClientRect().width
    setDragWidth(width)
    dragStart.current = {
      width,
      direction,
      container: contentWidth(editor.getRootElement()) ?? width
    }
  }

  const onPan: MotionProps["onPan"] = (_event, info) => {
    if (!dragStart.current) return
    setDragWidth(measure(info.offset.x))
  }

  const onPanEnd: MotionProps["onPanEnd"] = (_event, info) => {
    if (!dragStart.current) return
    const next = measure(info.offset.x)
    dragStart.current = null
    setDragWidth(null)
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isAttachmentNode(node)) node.setWidth(next)
    })
  }

  const effectiveWidth = dragWidth ?? width

  return (
    <span
      data-resizing={dragWidth !== null ? "" : undefined}
      className="relative block w-fit max-w-full"
    >
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        draggable={false}
        decoding="async"
        style={attachmentWidthStyle(effectiveWidth)}
        className={cn(
          ATTACHMENT_IMAGE_CLASS,
          "border border-transparent transition-colors group-data-[attachment-selected]/hitbox:border-ring! group-focus-within/editing:hitbox-hover:border-border"
        )}
        onError={onBroken}
      />
      {(["left", "right"] as const).map((side) => (
        <motion.span
          key={side}
          role="presentation"
          aria-hidden="true"
          data-attachment-resize="true"
          onPointerDown={(event) => event.preventDefault()}
          onPanStart={() => onPanStart(side === "left" ? -1 : 1)}
          onPan={onPan}
          onPanEnd={onPanEnd}
          className={cn(
            "absolute top-1/2 grid size-6 -translate-y-1/2 cursor-ew-resize touch-none items-center opacity-0 mix-blend-difference before:h-6 before:w-[3px] before:rounded-full before:bg-white before:opacity-40 before:transition-opacity hover:before:opacity-100 hitbox-hover:opacity-100 [@media(hover:none)]:opacity-100",
            side === "left"
              ? "left-0 justify-items-start pl-1 [--reveal-x:-3px]"
              : "right-0 justify-items-end pr-1 [--reveal-x:3px]",
            "image-control-reveal",
            dragWidth !== null && "opacity-100 before:opacity-100"
          )}
        />
      ))}
    </span>
  )
}

// pdf.js is loaded only when a PDF tile shows.
