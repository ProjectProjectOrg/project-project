import { mergeRegister } from "@lexical/utils"
import type { Library } from "@pp/shared"
import {
  COMMAND_PRIORITY_CRITICAL,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalEditor
} from "lexical"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject
} from "react"

import { useCommandMenu } from "../../components/command-menu"
import { cn } from "../../lib/utils"
import { SlashMenu, type SlashMenuModel } from "./slash-menu"
import {
  fitSlashMenu,
  placeSlashMenu,
  SLASH_MENU_FULL_REM,
  SLASH_MENU_LIST_REM,
  slashMenuBounds,
  slashMenuSpan,
  type SlashMenuFit,
  type SlashMenuPlacement
} from "./slash-menu-fit"
import type { SlashTab } from "./slash-menu-items"

function SlashMenuKeys({
  editor,
  detachRef
}: Readonly<{
  editor: LexicalEditor
  detachRef: RefObject<boolean>
}>) {
  const { move, select, rows, highlight, listId } = useCommandMenu()
  const rowsRef = useRef(rows)
  useLayoutEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          KEY_ARROW_DOWN_COMMAND,
          (event) => {
            event.preventDefault()
            move(1, event.repeat)
            return true
          },
          COMMAND_PRIORITY_CRITICAL
        ),
        editor.registerCommand(
          KEY_ARROW_UP_COMMAND,
          (event) => {
            event.preventDefault()
            move(-1, event.repeat)
            return true
          },
          COMMAND_PRIORITY_CRITICAL
        ),
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) => {
            const index = highlight.get()
            const row = index === null ? undefined : rowsRef.current[index]
            if (row === undefined) return false
            event?.preventDefault()
            detachRef.current = event?.altKey === true
            select(row)
            return true
          },
          COMMAND_PRIORITY_CRITICAL
        )
      ),
    [detachRef, editor, highlight, move, select]
  )

  useEffect(() => {
    const point = () => {
      const index = highlight.get()
      const root = editor.getRootElement()
      if (index === null) root?.removeAttribute("aria-activedescendant")
      else root?.setAttribute("aria-activedescendant", `${listId}-${index}`)
    }
    point()
    return highlight.subscribe(point)
  }, [editor, highlight, listId])

  return null
}

export function SlashMenuList({
  editor,
  menu,
  query,
  library,
  detachRef,
  onPick,
  onTab
}: Readonly<{
  editor: LexicalEditor
  menu: SlashMenuModel
  query: string
  library: Library
  detachRef: RefObject<boolean>
  onPick: (key: string) => void
  onTab: (tab: SlashTab) => void
}>) {
  const frameRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const layout = useSlashMenuLayout(
    frameRef,
    menuRef,
    editor.getRootElement(),
    query
  )

  return (
    <div ref={frameRef} data-slash-menu-frame className="relative h-0 w-0">
      <SlashMenu
        ref={menuRef}
        menu={menu}
        query={query}
        library={library}
        preview={layout?.fit.preview === true}
        detachRef={detachRef}
        onPick={onPick}
        onTab={onTab}
        keys={<SlashMenuKeys editor={editor} detachRef={detachRef} />}
        data-slash-menu-side={layout?.placement.side}
        style={
          layout === null
            ? { visibility: "hidden" }
            : {
                width: layout.fit.width,
                left: layout.left,
                top: layout.placement.top
              }
        }
        className={cn(
          "fixed top-0 left-0 z-50",
          "data-[slash-menu-side=above]:slide-in-from-bottom-2 data-[slash-menu-side=below]:slide-in-from-top-2",
          layout !== null &&
            "animate-in transition-none duration-150 ease-out fade-in-0 motion-reduce:animate-none"
        )}
      />
    </div>
  )
}

type SlashMenuLayout = Readonly<{
  fit: SlashMenuFit
  placement: SlashMenuPlacement
  left: number
}>

const sameLayout = (a: SlashMenuLayout | null, b: SlashMenuLayout): boolean =>
  a !== null &&
  a.fit.preview === b.fit.preview &&
  a.fit.width === b.fit.width &&
  a.left === b.left &&
  a.placement.side === b.placement.side &&
  a.placement.top === b.placement.top

type TriggerRect = Readonly<{ left: number; top: number; bottom: number }>

const triggerRect = (query: string, fallback: DOMRect): TriggerRect => {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0)
    return { left: fallback.left, top: fallback.top, bottom: fallback.bottom }
  const caret = selection.getRangeAt(0)
  const trigger = caret.cloneRange()
  const node = caret.startContainer
  if (node.nodeType === Node.TEXT_NODE) {
    // Find the slash itself: the query lags the caret by a keystroke.
    const text = node.textContent ?? ""
    const found = text.lastIndexOf("/", caret.startOffset - 1)
    const slashOffset =
      found === -1 ? Math.max(0, caret.startOffset - query.length - 1) : found
    trigger.setStart(node, slashOffset)
    trigger.setEnd(node, slashOffset + 1)
  }
  const rect = trigger.getBoundingClientRect()
  if (rect.height > 0)
    return { left: rect.left, top: rect.top, bottom: rect.bottom }
  const line = caret.getBoundingClientRect()
  return line.height > 0
    ? { left: line.left, top: line.top, bottom: line.bottom }
    : { left: fallback.left, top: fallback.top, bottom: fallback.bottom }
}

function useSlashMenuLayout(
  frameRef: RefObject<HTMLDivElement | null>,
  menuRef: RefObject<HTMLDivElement | null>,
  root: HTMLElement | null,
  query: string
): SlashMenuLayout | null {
  const [layout, setLayout] = useState<SlashMenuLayout | null>(null)
  const measure = useCallback(() => {
    const frame = frameRef.current
    const menu = menuRef.current
    if (frame === null || menu === null) return
    const rem =
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
      16
    const anchor = triggerRect(query, frame.getBoundingClientRect())
    const fit = fitSlashMenu({
      anchorLeft: anchor.left,
      bounds: slashMenuBounds(root),
      full: SLASH_MENU_FULL_REM * rem,
      list: SLASH_MENU_LIST_REM * rem
    })
    const placement = placeSlashMenu({
      caret: anchor,
      height: menu.offsetHeight,
      bounds: slashMenuSpan(root)
    })
    const next = { fit, placement, left: anchor.left + fit.offset }
    setLayout((previous) => (sameLayout(previous, next) ? previous : next))
  }, [frameRef, menuRef, root, query])

  useLayoutEffect(measure)

  useLayoutEffect(() => {
    window.addEventListener("resize", measure)
    document.addEventListener("scroll", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      document.removeEventListener("scroll", measure, true)
    }
  }, [measure])
  return layout
}
