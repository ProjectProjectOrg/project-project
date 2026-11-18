import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { parseFigmaUrl, type FigmaDensity, type FigmaRef } from "@pp/shared"
import {
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion
} from "motion/react"
import { useCallback, useLayoutEffect, useRef, type ReactElement } from "react"

import { Maximize2, Minimize2, Trash2 } from "../../components/icons"
import { NodeOverlayAction } from "../../editor/node-overlay-action"
import { useDecoratorSelection } from "../../editor/use-decorator-selection"
import { standardEaseCss, transitions } from "../../lib/springs"
import { cn } from "../../lib/utils"
import { m } from "../messages"
import type { TicketTarget } from "../services"
import { FigmaChip } from "./figma-chip"
import { FigmaEmbed } from "./figma-embed"

export interface FigmaPayload {
  readonly url: string
  readonly label: string
  readonly ref: FigmaRef | null
  readonly density?: FigmaDensity
  readonly request?: TicketTarget | null
}

export type SerializedFigmaNode = Spread<
  {
    url: string
    label: string
    density: FigmaDensity
  },
  SerializedLexicalNode
>

const INTERACTIVE_SELECTOR = "a, button, iframe, [data-figma-action]"

const OVERLAY_SLOT = "absolute flex h-8 items-center"

const CONTENT_MORPH = { ...transitions.morph, opacity: transitions.fade }

const morphSizes = new WeakMap<HTMLElement, { width: number; height: number }>()

export class FigmaNode extends DecoratorNode<ReactElement> {
  __url: string
  __label: string
  __ref: FigmaRef | null
  __density: FigmaDensity
  __request: TicketTarget | null

  static getType() {
    return "figma"
  }

  static clone(node: FigmaNode) {
    return new FigmaNode(
      {
        url: node.__url,
        label: node.__label,
        ref: node.__ref,
        density: node.__density,
        request: node.__request
      },
      node.__key
    )
  }

  constructor(payload: FigmaPayload, key?: NodeKey) {
    super(key)
    this.__url = payload.url
    this.__label = payload.label
    this.__ref = payload.ref
    this.__density = payload.density ?? "rich"
    this.__request = payload.request ?? null
  }

  createDOM() {
    const span = document.createElement("span")
    span.setAttribute("data-figma-kind", this.__ref?.kind ?? "unknown")
    span.style.display = "inline-block"
    span.style.verticalAlign = "middle"
    span.style.maxWidth = "100%"
    return span
  }

  updateDOM() {
    return false
  }

  isInline() {
    return true
  }

  getTextContent() {
    return this.__url
  }

  getUrl() {
    return this.getLatest().__url
  }

  getLabel() {
    return this.getLatest().__label
  }

  getRef() {
    return this.getLatest().__ref
  }

  getDensity() {
    return this.getLatest().__density
  }

  setDensity(density: FigmaDensity) {
    const writable = this.getWritable()
    writable.__density = density
  }

  setRequest(request: TicketTarget | null) {
    const writable = this.getWritable()
    writable.__request = request
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: "figma",
      version: 1,
      url: this.__url,
      label: this.__label,
      density: this.__density
    }
  }

  static importJSON(serialized: SerializedFigmaNode) {
    return $createFigmaNode({
      url: serialized.url,
      label: serialized.label,
      ref: parseFigmaUrl(serialized.url),
      density: serialized.density ?? "rich"
    })
  }

  decorate() {
    return (
      <FigmaSelectable
        nodeKey={this.getKey()}
        url={this.__url}
        label={this.__label}
        reference={this.__ref}
        density={this.__density}
        request={this.__request}
      />
    )
  }
}

function FigmaSelectable({
  nodeKey,
  url,
  label,
  reference,
  density,
  request
}: {
  nodeKey: NodeKey
  url: string
  label: string
  reference: FigmaRef | null
  density: FigmaDensity
  request: TicketTarget | null
}) {
  const [editor] = useLexicalComposerContext()
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

    const unpin = () => {
      element.style.removeProperty("width")
      element.style.removeProperty("height")
      element.style.removeProperty("overflow")
      const content = contentRef.current
      content?.style.removeProperty("width")
      content?.style.removeProperty("height")
    }

    unpin()
    const rect = element.getBoundingClientRect()
    const next = { width: rect.width, height: rect.height }
    morphSizes.set(element, next)

    const changed =
      previous !== undefined &&
      (Math.abs(previous.width - next.width) >= 0.5 ||
        Math.abs(previous.height - next.height) >= 0.5)

    if (changed && !reduceMotion) {
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

    return () => {
      animation?.cancel()
      unpin()
    }
  }, [density, reduceMotion])

  const toggleDensity = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!$isFigmaNode(node)) return
      node.setDensity(node.getDensity() === "compact" ? "rich" : "compact")
    })
  }, [editor, nodeKey])

  const compact = density === "compact"
  const morphId = `figma-${nodeKey}`
  const overlaySlot = cn(
    OVERLAY_SLOT,
    compact
      ? "-top-1 before:absolute before:-inset-x-3 before:inset-y-0 before:content-['']"
      : "-top-2"
  )

  return (
    <span
      className="inline-chip inline-block max-w-full"
      onMouseDown={selectOnPointer}
    >
      <span
        ref={wrapperRef}
        data-figma-selected={isSelected ? "true" : undefined}
        className={cn(
          "group/hitbox relative inline-block max-w-full align-middle transition-shadow duration-150 [--chip-shift:0px] focus-within:z-20 hover:z-20",
          // The ring follows the content's shape, like attachments'.
          compact
            ? "my-0.5 rounded-[10px] [corner-shape:var(--button-corner)]"
            : "my-2 rounded-[18px] corner-squircle",
          isSelected
            ? "z-20 ring-2 ring-ring ring-offset-2 ring-offset-background"
            : "z-0 ring-0 ring-transparent"
        )}
      >
        <LayoutGroup id={morphId}>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              ref={contentRef}
              data-figma-content="true"
              key={compact ? "compact" : "expanded"}
              layoutId={morphId}
              transition={CONTENT_MORPH}
              className="flex [--chip-shift:0px]"
            >
              {compact ? (
                <FigmaChip
                  request={request}
                  reference={reference}
                  url={url}
                  label={label}
                  morphId={morphId}
                />
              ) : (
                <FigmaEmbed
                  request={request}
                  reference={reference}
                  url={url}
                  label={label}
                  morphId={morphId}
                />
              )}
            </motion.span>
          </AnimatePresence>
          <NodeOverlayAction
            morphId={`${morphId}-remove`}
            slot={cn(overlaySlot, compact ? "right-full mr-1" : "-left-2")}
            label={m.figma_embed_remove()}
            variant="overlay-destructive"
            onClick={remove}
          >
            <Trash2 strokeWidth={1.75} />
          </NodeOverlayAction>
          {reference === null ? null : (
            <NodeOverlayAction
              morphId={`${morphId}-density`}
              slot={cn(overlaySlot, compact ? "left-full ml-1" : "-right-2")}
              label={
                compact ? m.figma_embed_expand() : m.figma_embed_collapse()
              }
              variant="overlay"
              onClick={toggleDensity}
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

export function $createFigmaNode(payload: FigmaPayload) {
  return $applyNodeReplacement(new FigmaNode(payload))
}

export function $isFigmaNode(
  node: LexicalNode | null | undefined
): node is FigmaNode {
  return node instanceof FigmaNode
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot!.invalidate()
  })
}
