import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
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
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement
} from "react"

import { DropdownMenuItem } from "../../components/dropdown-menu"
import { Pencil } from "../../components/icons"
import { Input } from "../../components/input"
import { useDecoratorSelection } from "../../editor/use-decorator-selection"
import { cn } from "../../lib/utils"
import { EmbedMenu } from "../embed-menu"
import { m } from "../messages"
import { PaperChip } from "./paper-chip"

export interface PaperPayload {
  readonly url: string
  readonly label: string
}

export type SerializedPaperNode = Spread<
  {
    url: string
    label: string
  },
  SerializedLexicalNode
>

const INTERACTIVE_SELECTOR = "a, button, input, [data-paper-action]"

export class PaperNode extends DecoratorNode<ReactElement> {
  __url: string
  __label: string

  static getType() {
    return "paper"
  }

  static clone(node: PaperNode) {
    return new PaperNode({ url: node.__url, label: node.__label }, node.__key)
  }

  constructor(payload: PaperPayload, key?: NodeKey) {
    super(key)
    this.__url = payload.url
    this.__label = payload.label
  }

  createDOM() {
    const span = document.createElement("span")
    span.setAttribute("data-paper-design", "true")
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

  setLabel(label: string) {
    this.getWritable().__label = label
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: "paper",
      version: 1,
      url: this.__url,
      label: this.__label
    }
  }

  static importJSON(serialized: SerializedPaperNode) {
    return $createPaperNode({
      url: serialized.url,
      label: serialized.label
    })
  }

  decorate() {
    return (
      <PaperSelectable
        nodeKey={this.getKey()}
        url={this.__url}
        label={this.__label}
      />
    )
  }
}

function PaperSelectable({
  nodeKey,
  url,
  label
}: {
  nodeKey: NodeKey
  url: string
  label: string
}) {
  const [editor] = useLexicalComposerContext()
  const resolvedLabel = label.trim() || m.editor_paper_default_name()
  const [editing, setEditing] = useState(false)
  const { isSelected, select, remove, selectOnPointer } = useDecoratorSelection(
    nodeKey,
    { interactive: INTERACTIVE_SELECTOR, removable: !editing }
  )
  const [draft, setDraft] = useState(resolvedLabel)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const commitLabel = useCallback(() => {
    const next = draft.trim() || m.editor_paper_default_name()
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isPaperNode(node)) node.setLabel(next)
    })
    setEditing(false)
  }, [draft, editor, nodeKey])

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === "Enter") {
      event.preventDefault()
      commitLabel()
    } else if (event.key === "Escape") {
      event.preventDefault()
      setDraft(resolvedLabel)
      setEditing(false)
    }
  }

  const startEditing = () => {
    select()
    setDraft(resolvedLabel)
    setEditing(true)
  }

  return (
    <span
      className="inline-chip inline-block max-w-full"
      onMouseDown={selectOnPointer}
    >
      <span
        data-paper-selected={isSelected ? "true" : undefined}
        className={cn(
          "group/hitbox relative my-0.5 inline-flex max-w-full rounded-[10px] align-middle transition-shadow duration-150 [--chip-shift:0px] [corner-shape:var(--button-corner)] focus-within:z-20 hover:z-20",
          isSelected ? "z-20" : "z-0 ring-0 ring-transparent"
        )}
      >
        {editing ? (
          <Input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitLabel}
            onKeyDown={handleInputKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
            maxLength={200}
            aria-label={m.editor_paper_name_input_label()}
            className="max-w-[50vw]"
            style={{
              width: `${Math.min(Math.max(draft.length + 1, 12), 40)}ch`
            }}
          />
        ) : (
          <EmbedMenu
            url={url}
            openLabel={m.editor_paper_open()}
            onRemove={remove}
            action={
              <DropdownMenuItem
                onClick={() => requestAnimationFrame(startEditing)}
              >
                <Pencil />
                {m.editor_embed_rename()}
              </DropdownMenuItem>
            }
          >
            <PaperChip url={url} label={resolvedLabel} />
          </EmbedMenu>
        )}
      </span>
    </span>
  )
}

export function $createPaperNode(payload: PaperPayload) {
  return $applyNodeReplacement(new PaperNode(payload))
}

export function $isPaperNode(
  node: LexicalNode | null | undefined
): node is PaperNode {
  return node instanceof PaperNode
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot!.invalidate()
  })
}
