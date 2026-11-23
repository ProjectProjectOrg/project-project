import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useEffect } from "react"

// Chrome centres an off-screen caret on each keystroke; reveal only as far as needed.
const ROOM = 32

const scrollerOf = (element: HTMLElement) => {
  let canScroll: HTMLElement | null = null
  for (
    let node = element.parentElement;
    node !== null;
    node = node.parentElement
  ) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY !== "auto" && overflowY !== "scroll") continue
    if (node.scrollHeight > node.clientHeight) return node
    canScroll ??= node
  }
  return canScroll
}

const caretRect = () => {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) return null
  const rect = selection.getRangeAt(0).getBoundingClientRect()
  if (rect.height > 0) return rect
  const node = selection.focusNode
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  return element?.getBoundingClientRect() ?? null
}

const revealFrom = (root: HTMLElement, scroller: HTMLElement, from: number) => {
  const view = scroller.getBoundingClientRect()
  const editor = root.getBoundingClientRect()
  const shown = editor.height + ROOM * 2 <= view.height ? editor : caretRect()
  if (shown === null) return from
  const moved = scroller.scrollTop - from
  const below = shown.bottom + moved + ROOM - view.bottom
  const above = view.top - (shown.top + moved - ROOM)
  return below > 0 ? from + below : above > 0 ? from - above : from
}

const revealOnType = (event: Event) => {
  const root = event.currentTarget
  if (!(root instanceof HTMLElement)) return
  const scroller = scrollerOf(root)
  if (scroller === null) return
  const before = scroller.scrollTop
  requestAnimationFrame(() => {
    if (!root.isConnected) return
    const target = revealFrom(root, scroller, before)
    if (Math.abs(scroller.scrollTop - target) > 1) scroller.scrollTop = target
  })
}

const glideOnFocus = (event: Event) => {
  const root = event.currentTarget
  if (!(root instanceof HTMLElement)) return
  const scroller = scrollerOf(root)
  if (scroller === null) return
  const before = scroller.scrollTop
  requestAnimationFrame(() => {
    if (!root.isConnected) return
    const target = revealFrom(root, scroller, before)
    scroller.scrollTop = before
    if (Math.abs(target - before) <= 1) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    scroller.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" })
  })
}

// Lexical breaks lines on keydown, so Enter never reaches beforeinput.
const revealOnEnter = (event: KeyboardEvent) => {
  if (event.key === "Enter" && !event.metaKey && !event.ctrlKey)
    revealOnType(event)
}

export function CaretRevealPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(
    () =>
      editor.registerRootListener((root, previous) => {
        previous?.removeEventListener("beforeinput", revealOnType)
        previous?.removeEventListener("keydown", revealOnEnter)
        previous?.removeEventListener("focus", glideOnFocus)
        root?.addEventListener("beforeinput", revealOnType)
        root?.addEventListener("keydown", revealOnEnter)
        root?.addEventListener("focus", glideOnFocus)
      }),
    [editor]
  )
  return null
}
