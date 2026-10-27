import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $applyNodeReplacement,
  $getNodeByKey,
  $isRootNode,
  DecoratorNode,
  createCommand,
  defineExtension,
  type LexicalCommand,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical"
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  type ReactElement
} from "react"

import { MarkdownSegment } from "@/features/editor/components/Markdown"
import {
  SourceRemovedNote,
  SyncedChip,
  SyncedChipAction,
  SyncedChipNote,
  managedInLabel,
  syncedChipLabel,
  syncedEditAction
} from "@/features/editor/components/SyncedBlock"
import { useDecoratorSelection } from "@/features/editor/hooks/useDecoratorSelection"
import { useBlockLookup } from "@/features/editor/lib/blockChrome"
import {
  splitLeadingHeading,
  syncedDisplayContent,
  syncedView,
  toggleTaskAtLine,
  type SyncedBlockMode,
  type SyncedView
} from "@/features/editor/lib/syncedContent"
import { m } from "@/paraglide/messages"

import {
  EditorBlocksContext,
  type EditorBlocksScope
} from "./editorBlocksContext"

export type DetachSyncedBlockPayload = Readonly<{
  key: NodeKey
  content: string
}>

export const DETACH_SYNCED_BLOCK_COMMAND: LexicalCommand<DetachSyncedBlockPayload> =
  createCommand("DETACH_SYNCED_BLOCK_COMMAND")

export type SerializedSyncedBlockNode = Spread<
  { blockType: string; snapshot: string; mode: SyncedBlockMode },
  SerializedLexicalNode
>

const INTERACTIVE_SELECTOR = "a, button, input, label"

export class SyncedBlockNode extends DecoratorNode<ReactElement> {
  __blockType: string
  __snapshot: string
  __mode: SyncedBlockMode

  static getType(): string {
    return "synced-block"
  }

  static clone(node: SyncedBlockNode): SyncedBlockNode {
    return new SyncedBlockNode(
      node.__blockType,
      node.__snapshot,
      node.__mode,
      node.__key
    )
  }

  static importJSON(serialized: SerializedSyncedBlockNode): SyncedBlockNode {
    return $createSyncedBlockNode(
      serialized.blockType,
      serialized.snapshot,
      serialized.mode
    ).updateFromJSON(serialized)
  }

  constructor(
    blockType: string,
    snapshot: string,
    mode: SyncedBlockMode = "synced",
    key?: NodeKey
  ) {
    super(key)
    this.__blockType = blockType
    this.__snapshot = snapshot
    this.__mode = mode
  }

  exportJSON(): SerializedSyncedBlockNode {
    return {
      ...super.exportJSON(),
      blockType: this.__blockType,
      snapshot: this.__snapshot,
      mode: this.__mode
    }
  }

  getBlockType(): string {
    return this.getLatest().__blockType
  }

  getSnapshot(): string {
    return this.getLatest().__snapshot
  }

  getMode(): SyncedBlockMode {
    return this.getLatest().__mode
  }

  setSnapshot(snapshot: string): this {
    const writable = this.getWritable()
    writable.__snapshot = snapshot
    return writable
  }

  getTextContent(): string {
    return this.getLatest().__snapshot
  }

  createDOM(): HTMLElement {
    const element = document.createElement("div")
    element.className = "ticket-block group/reveal whitespace-normal"
    element.dataset.blockType = this.__blockType
    element.dataset.sync = ""
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): false {
    return false
  }

  decorate(): ReactElement {
    return (
      <SyncedBlockView
        nodeKey={this.__key}
        blockType={this.__blockType}
        snapshot={this.__snapshot}
        mode={this.__mode}
      />
    )
  }
}

export function $createSyncedBlockNode(
  blockType: string,
  snapshot: string,
  mode: SyncedBlockMode = "synced"
): SyncedBlockNode {
  return $applyNodeReplacement(new SyncedBlockNode(blockType, snapshot, mode))
}

export function $isSyncedBlockNode(
  node: LexicalNode | null | undefined
): node is SyncedBlockNode {
  return node instanceof SyncedBlockNode
}

function SyncedBlockView({
  nodeKey,
  blockType,
  snapshot,
  mode
}: Readonly<{
  nodeKey: NodeKey
  blockType: string
  snapshot: string
  mode: SyncedBlockMode
}>) {
  const [editor] = useLexicalComposerContext()
  const $removeBlock = useCallback(() => {
    const node = $getNodeByKey(nodeKey)
    if (node === null) return false
    node.selectPrevious()
    node.remove()
    return true
  }, [nodeKey])
  const { isSelected, selectOnPointer } = useDecoratorSelection(nodeKey, {
    interactive: INTERACTIVE_SELECTOR,
    onRemove: $removeBlock
  })
  const scope = useContext(EditorBlocksContext)
  const morphId = useId()
  const view = syncedView(useBlockLookup(), blockType, snapshot, mode)

  useEffect(() => {
    const element = editor.getElementByKey(nodeKey)
    if (element === null) return
    const select = (event: MouseEvent) => {
      if (editor.isEditable()) selectOnPointer(event)
    }
    element.addEventListener("mousedown", select)
    return () => element.removeEventListener("mousedown", select)
  }, [editor, nodeKey, selectOnPointer])

  useEffect(() => {
    const element = editor.getElementByKey(nodeKey)
    if (element === null) return
    if (isSelected) element.dataset.selected = ""
    else delete element.dataset.selected
  }, [editor, isSelected, nodeKey])

  if (view.kind === "removed") {
    const { heading, rest } = splitLeadingHeading(view.content)
    return (
      <>
        {heading !== null && (
          <MarkdownSegment text={heading} morphId={`${morphId}-heading`} />
        )}
        <SourceRemovedNote />
        <MarkdownSegment text={rest} morphId={morphId} />
      </>
    )
  }

  const toggleTask =
    mode === "synced"
      ? (line: number) =>
          editor.update(() => {
            const node = $getNodeByKey(nodeKey)
            if ($isSyncedBlockNode(node))
              node.setSnapshot(toggleTaskAtLine(view.content, line))
          })
      : undefined

  return (
    <>
      <MarkdownSegment
        text={syncedDisplayContent(view, mode)}
        morphId={morphId}
        onToggleTask={toggleTask}
      />
      <SyncedChip
        label={syncedChipLabel(mode, view.definition.origin)}
        visible={isSelected}
      >
        {scope !== null && (
          <SyncedActions
            scope={scope}
            view={view}
            mode={mode}
            onDetach={() =>
              editor.dispatchCommand(DETACH_SYNCED_BLOCK_COMMAND, {
                key: nodeKey,
                content: view.content
              })
            }
          />
        )}
      </SyncedChip>
    </>
  )
}

function SyncedActions({
  scope,
  view,
  mode,
  onDetach
}: Readonly<{
  scope: EditorBlocksScope
  view: Extract<SyncedView, { kind: "live" }>
  mode: SyncedBlockMode
  onDetach: () => void
}>) {
  if (mode === "reference")
    return (
      <SyncedChipAction
        label={m.editor_synced_customize()}
        onClick={onDetach}
      />
    )
  const { origin, key } = view.definition
  const edit = syncedEditAction(
    scope.blocks.library,
    origin,
    scope.blocks.canEdit
  )
  return (
    <>
      {edit === "edit" && (
        <SyncedChipAction
          label={m.editor_synced_edit()}
          onClick={() => scope.blocks.onEditDefinition("block", key, origin)}
        />
      )}
      {edit === "managed" && <SyncedChipNote label={managedInLabel(origin)} />}
      <SyncedChipAction label={m.editor_synced_detach()} onClick={onDetach} />
    </>
  )
}

export function $liftNestedSyncedBlock(node: SyncedBlockNode): void {
  const outermost = node.getParents().findLast((parent) => !$isRootNode(parent))
  if (outermost !== undefined) outermost.insertAfter(node)
}

export const SyncedBlockExtension = defineExtension({
  name: "@pp/synced-block",
  nodes: [SyncedBlockNode],
  register: (editor) =>
    editor.registerNodeTransform(SyncedBlockNode, $liftNestedSyncedBlock)
})
