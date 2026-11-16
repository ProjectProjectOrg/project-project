import {
  $createRangeSelection,
  $getRoot,
  $setSelection,
  type LexicalEditor
} from "lexical"
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject
} from "react"
import { flushSync } from "react-dom"

import { hasModifier, ownsKeystrokes } from "../lib/keyboard"

export function useEditMode({
  editorRef,
  rootRef,
  initial = false
}: Readonly<{
  editorRef: RefObject<LexicalEditor | null>
  rootRef: RefObject<HTMLElement | null>
  initial?: boolean
}>) {
  const [editing, setEditing] = useState(initial)
  const wasEditingRef = useRef(editing)

  useEffect(() => {
    const wasEditing = wasEditingRef.current
    wasEditingRef.current = editing
    if (editing || !wasEditing) return
    const active = document.activeElement
    const lost =
      active === null ||
      active === document.body ||
      (rootRef.current?.contains(active) ?? false)
    if (lost) rootRef.current?.focus({ preventScroll: true })
  }, [editing, rootRef])

  const startEditing = useCallback(() => {
    const editor = editorRef.current
    if (editor === null) return
    const range = selectedRangeIn(editor.getRootElement())
    flushSync(() => {
      editor.setEditable(true)
      setEditing(true)
    })
    editor.update(
      () => {
        if (range === null) {
          $getRoot().selectEnd()
          return
        }
        const selection = $createRangeSelection()
        selection.applyDOMRange(range)
        $setSelection(selection)
      },
      { discrete: true }
    )
    editor.focus()
  }, [editorRef])

  const stopEditing = useCallback(() => {
    editorRef.current?.blur()
    setEditing(false)
  }, [editorRef])

  const startFromShortcut = useEffectEvent(startEditing)
  const stopFromEvent = useEffectEvent(stopEditing)

  useEffect(() => {
    if (editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "e" && event.key !== "E") return
      if (event.repeat || event.defaultPrevented || hasModifier(event)) return
      if (ownsKeystrokes(event.target)) return
      event.preventDefault()
      startFromShortcut()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [editing])

  useEffect(() => {
    if (!editing) return
    const app = document.getElementById("root")
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || !(app?.contains(target) ?? false)) return
      if (rootRef.current?.contains(target) ?? false) return
      stopFromEvent()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      if (!(event.target instanceof Node)) return
      if (!(rootRef.current?.contains(event.target) ?? false)) return
      stopFromEvent()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [editing, rootRef])

  return { editing, startEditing, stopEditing }
}

const selectedRangeIn = (root: HTMLElement | null): Range | null => {
  const selection = window.getSelection()
  if (root === null || selection === null || selection.isCollapsed) return null
  const range = selection.getRangeAt(0).cloneRange()
  if (!range.intersectsNode(root)) return null
  const bounds = document.createRange()
  bounds.selectNodeContents(root)
  if (range.compareBoundaryPoints(Range.START_TO_START, bounds) < 0)
    range.setStart(bounds.startContainer, bounds.startOffset)
  if (range.compareBoundaryPoints(Range.END_TO_END, bounds) > 0)
    range.setEnd(bounds.endContainer, bounds.endOffset)
  return range.collapsed ? null : range
}
