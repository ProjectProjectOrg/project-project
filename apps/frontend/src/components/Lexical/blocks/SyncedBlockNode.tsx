import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection"
import { mergeRegister } from "@lexical/utils"
import {
  $applyNodeReplacement,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $isRootNode,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ESCAPE_COMMAND,
  createCommand,
  defineExtension,
  type LexicalCommand,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical"
import { useContext, useEffect, useId, type ReactElement } from "react"

import { useBlockLookup } from "@/components/blocks/blockChrome"
import {
  SourceRemovedNote,
  SyncedChip,
  SyncedChipAction,
  SyncedChipNote,
  managedInLabel,
  syncedChipLabel,
  syncedEditAction
} from "@/components/blocks/SyncedBlock"
import {
  splitLeadingHeading,
  syncedView,
  toggleTaskAtLine,
  type SyncedView
} from "@/components/blocks/syncedContent"
import { MarkdownSegment } from "@/components/Markdown"
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
  { blockType: string; snapshot: string },
  SerializedLexicalNode
>

const INTERACTIVE_SELECTOR = "a, button, input, label"

const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null

export class SyncedBlockNode extends DecoratorNode<ReactElement> {
  __blockType: string
  __snapshot: string

  static getType(): string {
    return "synced-block"
  }

  static clone(node: SyncedBlockNode): SyncedBlockNode {
    return new SyncedBlockNode(node.__blockType, node.__snapshot, node.__key)
  }

  static importJSON(serialized: SerializedSyncedBlockNode): SyncedBlockNode {
    return $createSyncedBlockNode(
      serialized.blockType,
      serialized.snapshot
    ).updateFromJSON(serialized)
  }

  constructor(blockType: string, snapshot: string, key?: NodeKey) {
    super(key)
    this.__blockType = blockType
    this.__snapshot = snapshot
  }

  exportJSON(): SerializedSyncedBlockNode {
    return {
      ...super.exportJSON(),
      blockType: this.__blockType,
      snapshot: this.__snapshot
    }
  }

  getBlockType(): string {
    return this.getLatest().__blockType
  }

  getSnapshot(): string {
    return this.getLatest().__snapshot
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
      />
    )
  }
}

export function $createSyncedBlockNode(
  blockType: string,
  snapshot: string
): SyncedBlockNode {
  return $applyNodeReplacement(new SyncedBlockNode(blockType, snapshot))
}

export function $isSyncedBlockNode(
  node: LexicalNode | null | undefined
): node is SyncedBlockNode {
  return node instanceof SyncedBlockNode
}

function SyncedBlockView({
  nodeKey,
  blockType,
  snapshot
}: Readonly<{
  nodeKey: NodeKey
  blockType: string
  snapshot: string
}>) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)
  const scope = useContext(EditorBlocksContext)
  const morphId = useId()
  const view = syncedView(useBlockLookup(), blockType, snapshot)

  useEffect(() => {
    const element = editor.getElementByKey(nodeKey)
    if (element === null) return
    const select = (event: MouseEvent) => {
      if (isInteractiveTarget(event.target) || !editor.isEditable()) return
      event.preventDefault()
      const root = editor.getRootElement()
      if (root !== null && document.activeElement !== root)
        root.focus({ preventScroll: true })
      clearSelection()
      setSelected(true)
    }
    element.addEventListener("mousedown", select)
    return () => element.removeEventListener("mousedown", select)
  }, [clearSelection, editor, nodeKey, setSelected])

  useEffect(() => {
    const element = editor.getElementByKey(nodeKey)
    if (element === null) return
    if (isSelected) element.dataset.selected = ""
    else delete element.dataset.selected
  }, [editor, isSelected, nodeKey])

  useEffect(() => {
    const remove = (event: KeyboardEvent | null) => {
      if (!isSelected || !$isNodeSelection($getSelection())) return false
      event?.preventDefault()
      const node = $getNodeByKey(nodeKey)
      if (node === null) return false
      node.selectPrevious()
      node.remove()
      return true
    }
    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const element = editor.getElementByKey(nodeKey)
          const target = event.target
          if (element === null || !(target instanceof Node)) return false
          if (!element.contains(target) || isInteractiveTarget(target))
            return false
          event.preventDefault()
          clearSelection()
          setSelected(true)
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        remove,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(KEY_DELETE_COMMAND, remove, COMMAND_PRIORITY_LOW),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (!isSelected) return false
          clearSelection()
          return true
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [clearSelection, editor, isSelected, nodeKey, setSelected])

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

  const toggleTask = (line: number) =>
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isSyncedBlockNode(node))
        node.setSnapshot(toggleTaskAtLine(view.content, line))
    })

  return (
    <>
      <MarkdownSegment
        text={view.content}
        morphId={morphId}
        onToggleTask={toggleTask}
      />
      <SyncedChip
        label={syncedChipLabel(view.definition.origin)}
        visible={isSelected}
      >
        {scope !== null && (
          <SyncedActions
            scope={scope}
            view={view}
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
  onDetach
}: Readonly<{
  scope: EditorBlocksScope
  view: Extract<SyncedView, { kind: "live" }>
  onDetach: () => void
}>) {
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
