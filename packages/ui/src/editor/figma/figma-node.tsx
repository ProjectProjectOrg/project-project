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
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useLayoutEffect, useRef, type ReactElement } from "react"

import { DropdownMenuItem } from "../../components/dropdown-menu"
import { Maximize2, Minimize2 } from "../../components/icons"
import { useDecoratorSelection } from "../../editor/use-decorator-selection"
import { cn } from "../../lib/utils"
import { EmbedMenu } from "../embed-menu"
import { m } from "../messages"
import type { TicketTarget } from "../services"
import { FigmaChip } from "./figma-chip"
import { FigmaEmbed } from "./figma-embed"
import { collapseDuration, figmaDisplayFade } from "./figmaMotion"

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

  const surface = useRef<HTMLSpanElement>(null)
  const paragraphHeight = useRef(0)
  const toggleDensity = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!$isFigmaNode(node) || node.getDensity() !== density) return
      if (density === "rich" && surface.current) {
        paragraphHeight.current =
          surface.current.closest("p")?.getBoundingClientRect().height ?? 0
        const rect = surface.current.getBoundingClientRect()
        Object.assign(surface.current.style, {
          position: "fixed",
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          margin: "0",
          pointerEvents: "none"
        })
      }
      node.setDensity(density === "compact" ? "rich" : "compact")
    })
  }, [density, editor, nodeKey])

  const reduceMotion = useReducedMotion()
  const compact = density === "compact"
  useLayoutEffect(() => {
    if (!compact && surface.current?.style.position === "fixed") {
      for (const property of [
        "position",
        "top",
        "left",
        "width",
        "height",
        "margin",
        "pointer-events"
      ]) {
        surface.current.style.removeProperty(property)
      }
    }
    const from = paragraphHeight.current
    paragraphHeight.current = 0
    const paragraph = surface.current?.closest("p")
    if (!compact || reduceMotion || !paragraph || !from) return undefined
    const to = paragraph.getBoundingClientRect().height
    const animation = paragraph.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      {
        duration: collapseDuration * 1000,
        easing: "ease-in-out"
      }
    )
    return () => animation.cancel()
  }, [compact, reduceMotion])
  const morphId = `figma-${nodeKey}`
  return (
    <span
      className="inline-chip inline-block max-w-full"
      onMouseDown={selectOnPointer}
    >
      <AnimatePresence initial={false} mode={compact ? "sync" : "wait"}>
        <motion.span
          ref={surface}
          key={density}
          initial="hidden"
          animate="visible"
          exit={compact || reduceMotion ? "exit" : "collapse"}
          variants={figmaDisplayFade}
          data-figma-selected={isSelected ? "true" : undefined}
          className={cn(
            "group/hitbox relative inline-block max-w-full align-middle transition-shadow duration-150 [--chip-shift:0px] focus-within:z-20 hover:z-20",
            // The ring follows the content's shape, like attachments'.
            compact
              ? "my-0.5 rounded-[10px] [corner-shape:var(--button-corner)]"
              : "my-2 rounded-[18px] corner-squircle",
            isSelected ? "z-20" : "z-0 ring-0 ring-transparent"
          )}
        >
          <EmbedMenu
            expanded={!compact}
            url={reference ? url : undefined}
            openLabel={m.figma_embed_open_in_figma()}
            onRemove={remove}
            action={
              reference && (
                <DropdownMenuItem onClick={toggleDensity}>
                  {compact ? <Maximize2 /> : <Minimize2 />}
                  {compact
                    ? m.editor_attachment_expand()
                    : m.editor_attachment_collapse()}
                </DropdownMenuItem>
              )
            }
          >
            <span
              data-figma-content="true"
              className="flex [--chip-shift:0px] group-data-[figma-selected]/hitbox:[&>.pp-badge]:inset-ring-1 group-data-[figma-selected]/hitbox:[&>.pp-badge]:inset-ring-ring"
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
            </span>
          </EmbedMenu>
        </motion.span>
      </AnimatePresence>
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
