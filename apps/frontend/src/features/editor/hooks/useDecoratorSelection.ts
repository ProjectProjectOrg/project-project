import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection"
import { mergeRegister } from "@lexical/utils"
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ESCAPE_COMMAND,
  type NodeKey
} from "lexical"
import { useCallback, useEffect } from "react"

export const isInteractiveTarget = (
  target: EventTarget | null,
  selector: string
): boolean => target instanceof Element && target.closest(selector) !== null

type PointerSelectEvent = Readonly<{
  target: EventTarget | null
  preventDefault: () => void
}>

export type DecoratorSelectionOptions = Readonly<{
  interactive: string
  onRemove?: () => boolean
  removable?: boolean
}>

export type DecoratorSelection = Readonly<{
  isSelected: boolean
  select: () => void
  remove: () => void
  selectOnPointer: (event: PointerSelectEvent) => void
}>

export function useDecoratorSelection(
  nodeKey: NodeKey,
  { interactive, onRemove, removable = true }: DecoratorSelectionOptions
): DecoratorSelection {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)

  const select = useCallback(() => {
    clearSelection()
    setSelected(true)
  }, [clearSelection, setSelected])

  const remove = useCallback(() => {
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove()
    })
  }, [editor, nodeKey])

  const selectOnPointer = useCallback(
    (event: PointerSelectEvent) => {
      if (isInteractiveTarget(event.target, interactive)) return
      event.preventDefault()
      const root = editor.getRootElement()
      if (root && document.activeElement !== root)
        root.focus({ preventScroll: true })
      select()
    },
    [editor, interactive, select]
  )

  useEffect(() => {
    const onDelete = (event: KeyboardEvent | null) => {
      if (!removable) return false
      if (!isSelected || !$isNodeSelection($getSelection())) return false
      event?.preventDefault()
      if (onRemove !== undefined) return onRemove()
      remove()
      return true
    }

    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const element = editor.getElementByKey(nodeKey)
          const target = event.target
          if (!element || !(target instanceof Node)) return false
          if (!element.contains(target)) return false
          if (isInteractiveTarget(target, interactive)) return false
          event.preventDefault()
          select()
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      ),
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
  }, [
    editor,
    nodeKey,
    interactive,
    isSelected,
    select,
    clearSelection,
    remove,
    onRemove,
    removable
  ])

  return { isSelected, select, remove, selectOnPointer }
}
