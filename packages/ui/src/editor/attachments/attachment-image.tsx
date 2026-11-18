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

export const contentWidth = (element: HTMLElement | null): number | null => {
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

  const dragStart = useRef<{ width: number; container: number } | null>(null)

  const measure = (offsetX: number): number => {
    const img = imgRef.current
    const start = dragStart.current
    if (!img || !start) return ATTACHMENT_MIN_WIDTH
    return clampAttachmentWidth({
      width: start.width + offsetX,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      containerWidth: start.container
    })
  }

  const onPanStart = () => {
    const img = imgRef.current
    if (!img) return
    const width = img.getBoundingClientRect().width
    dragStart.current = {
      width,
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
    <span className="relative block w-fit max-w-full">
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        decoding="async"
        style={attachmentWidthStyle(effectiveWidth)}
        className={cn(
          ATTACHMENT_IMAGE_CLASS,
          "border border-transparent transition-colors group-focus-within/editing:hitbox-hover:border-border"
        )}
        onError={onBroken}
      />
      <motion.span
        role="presentation"
        aria-hidden="true"
        data-attachment-resize="true"
        onPanStart={onPanStart}
        onPan={onPan}
        onPanEnd={onPanEnd}
        className="invisible absolute top-1/2 right-0 hidden h-8 max-h-[60%] w-1.5 translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-foreground/40 opacity-0 transition-all group-focus-within/editing:visible before:absolute before:-inset-x-2 before:inset-y-0 before:content-[''] hover:bg-foreground/80 sm:block hitbox-hover:opacity-100"
      />
    </span>
  )
}

// pdf.js is loaded only when a PDF tile shows.
