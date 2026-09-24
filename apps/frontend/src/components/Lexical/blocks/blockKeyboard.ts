import type { Transformer } from "@lexical/markdown"
import { IS_APPLE, mergeRegister } from "@lexical/utils"
import {
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DOWN_COMMAND,
  isExactShortcutMatch,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey
} from "lexical"

import {
  $blankBlockAtCaret,
  $findBlockAtSelection,
  $moveBlock,
  $removeBlock,
  type BlockDirection,
  type TopLevelBlockNode
} from "./blockCommands"

export type BlockKeyboardHandlers = Readonly<{
  transformers: ReadonlyArray<Transformer>
  onMoved: (
    node: TopLevelBlockNode,
    neighbour: LexicalNode | null,
    direction: BlockDirection
  ) => void
  onRemoved: (blockType: string) => void
  onOpenMenu: (key: NodeKey) => void
}>

const PRIMARY = IS_APPLE
  ? { metaKey: true, ctrlKey: false }
  : { metaKey: false, ctrlKey: true }

const MOVE_KEYS: ReadonlyArray<readonly [string, BlockDirection]> = [
  ["ArrowUp", "up"],
  ["ArrowDown", "down"]
]

export const moveShortcutDirection = (
  event: KeyboardEvent
): BlockDirection | null =>
  MOVE_KEYS.find(([key]) =>
    isExactShortcutMatch(event, key, {
      ...PRIMARY,
      shiftKey: true,
      altKey: false
    })
  )?.[1] ?? null

export const isOpenMenuShortcut = (event: KeyboardEvent): boolean =>
  isExactShortcutMatch(event, ".", {
    ...PRIMARY,
    shiftKey: false,
    altKey: false
  })

export const MOVE_UP_SHORTCUT = IS_APPLE ? "⌘⇧↑" : "Ctrl+Shift+↑"
export const MOVE_DOWN_SHORTCUT = IS_APPLE ? "⌘⇧↓" : "Ctrl+Shift+↓"
export const OPEN_MENU_SHORTCUT = IS_APPLE ? "⌘." : "Ctrl+."

export function registerBlockKeyboard(
  editor: LexicalEditor,
  handlers: BlockKeyboardHandlers
): () => void {
  const move = (node: TopLevelBlockNode, direction: BlockDirection) =>
    handlers.onMoved(node, $moveBlock(node, direction), direction)

  return mergeRegister(
    editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        const direction = moveShortcutDirection(event)
        const opens = direction === null && isOpenMenuShortcut(event)
        if (direction === null && !opens) return false
        const block = $findBlockAtSelection()
        if (block === null) return false
        event.preventDefault()
        if (direction !== null) move(block, direction)
        else handlers.onOpenMenu(block.getKey())
        return true
      },
      COMMAND_PRIORITY_HIGH
    ),
    editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        const block = $blankBlockAtCaret(handlers.transformers)
        if (block === null) return false
        event?.preventDefault()
        const blockType = block.getBlockType()
        $removeBlock(block)
        handlers.onRemoved(blockType)
        return true
      },
      COMMAND_PRIORITY_LOW
    )
  )
}
