import { $isCodeNode, CodeNode } from "@lexical/code"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useLexicalEditable } from "@lexical/react/useLexicalEditable"
import { $findMatchingParent, mergeRegister } from "@lexical/utils"
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  type NodeKey
} from "lexical"
import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { Select, SelectTrigger } from "../components/select"
import { m } from "./messages"

/*
 * A code block's language, chosen from a small picker at its top right
 * while you're on it (hovering it, or with the caret inside). Only while the
 * editor is editable; the choice is the fence's language in the Markdown
 * (```ts), so read-only descriptions highlight it too.
 */

const PLAIN = "plain"

// The languages the app highlights (lib/prismLangs), by their fence name.
const LANGUAGES = [
  ["typescript", "TypeScript"],
  ["tsx", "TSX"],
  ["javascript", "JavaScript"],
  ["jsx", "JSX"],
  ["json", "JSON"],
  ["bash", "Bash"],
  ["yaml", "YAML"],
  ["go", "Go"],
  ["toml", "TOML"],
  ["css", "CSS"],
  ["html", "HTML"],
  ["diff", "Diff"]
] as const

// Fence names people type for the same languages.
const ALIASES: ReadonlyMap<string, string> = new Map([
  ["ts", "typescript"],
  ["js", "javascript"],
  ["sh", "bash"],
  ["shell", "bash"],
  ["zsh", "bash"],
  ["yml", "yaml"],
  ["golang", "go"],
  ["markup", "html"],
  ["xml", "html"]
])

const normalize = (language: string | null | undefined) => {
  if (!language) return PLAIN
  const lower = language.toLowerCase()
  return ALIASES.get(lower) ?? lower
}

type Placed = Readonly<{ key: NodeKey; top: number; right: number }>

function $codeKeyAtSelection() {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null
  const code = $findMatchingParent(selection.anchor.getNode(), $isCodeNode)
  return code === null ? null : code.getKey()
}

export function CodeLanguagePlugin() {
  const [editor] = useLexicalComposerContext()
  const editable = useLexicalEditable()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [hovered, setHovered] = useState<NodeKey | null>(null)
  const [selected, setSelected] = useState<NodeKey | null>(null)
  const [open, setOpen] = useState(false)
  const [placed, setPlaced] = useState<Placed | null>(null)
  const [language, setLanguage] = useState(PLAIN)

  useEffect(
    () =>
      editor.registerRootListener((root) =>
        setAnchor(root?.parentElement ?? null)
      ),
    [editor]
  )

  // The block the caret is in.
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) =>
        setSelected(editorState.read($codeKeyAtSelection, { editor }))
      ),
    [editor]
  )

  // The block under the pointer (the picker is in the same area, so moving
  // onto it keeps it).
  useEffect(() => {
    if (anchor === null) return undefined
    const onMove = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return
      if (event.target.closest("[data-code-language]")) return
      const element = event.target.closest("code")
      if (element === null || !anchor.contains(element)) {
        setHovered(null)
        return
      }
      setHovered(
        editor.read(() => {
          const node = $getNearestNodeFromDOMNode(element)
          const code = node && $findMatchingParent(node, $isCodeNode)
          return code ? code.getKey() : null
        })
      )
    }
    const onLeave = () => setHovered(null)
    anchor.addEventListener("pointermove", onMove)
    anchor.addEventListener("pointerleave", onLeave)
    return () => {
      anchor.removeEventListener("pointermove", onMove)
      anchor.removeEventListener("pointerleave", onLeave)
    }
  }, [anchor, editor])

  const active = hovered ?? selected
  const [kept, setKept] = useState<NodeKey | null>(null)
  // While the menu is open the picker stays on its block.
  const key = open ? kept : active

  const place = useCallback(() => {
    if (anchor === null || key === null) {
      setPlaced(null)
      return
    }
    const element = editor.getElementByKey(key)
    if (element === null) {
      setPlaced(null)
      return
    }
    const box = element.getBoundingClientRect()
    const area = anchor.getBoundingClientRect()
    setPlaced({
      key,
      top: box.top - area.top + 6,
      right: area.right - box.right + 6
    })
    setLanguage(
      editor.read(() => {
        const node = $getNodeByKey(key)
        return $isCodeNode(node) ? normalize(node.getLanguage()) : PLAIN
      })
    )
  }, [anchor, editor, key])

  useEffect(() => {
    // The first placement a frame later, once the layout has settled.
    const frame = requestAnimationFrame(place)
    if (anchor === null) return () => cancelAnimationFrame(frame)
    const resize = new ResizeObserver(place)
    resize.observe(anchor)
    return mergeRegister(
      () => cancelAnimationFrame(frame),
      editor.registerUpdateListener(place),
      editor.registerMutationListener(CodeNode, place, {
        skipInitialization: true
      }),
      () => resize.disconnect()
    )
  }, [anchor, editor, place])

  if (!editable || anchor === null || placed === null) return null

  // An unknown fence language stays selectable, under its own name.
  const items = [
    { value: PLAIN, label: m.editor_code_language_plain() },
    ...LANGUAGES.map(([value, label]) => ({ value, label })),
    ...(language === PLAIN || LANGUAGES.some(([value]) => value === language)
      ? []
      : [{ value: language, label: language }])
  ]
  const label = items.find((item) => item.value === language)?.label

  return createPortal(
    <div
      role="presentation"
      data-code-language=""
      // The block's own fill behind the picker, fading in from the left, so
      // a long line runs under it instead of through it.
      className="absolute z-10 rounded-r-[14px] bg-[linear-gradient(to_right,transparent,var(--surface-2)_1.25rem)] pl-5 corner-squircle"
      style={{ top: placed.top, right: placed.right }}
      // Keep the editor's selection while using the picker.
      onMouseDown={(event) => event.preventDefault()}
    >
      <Select
        items={items}
        value={language}
        size="compact"
        open={open}
        onOpenChange={(next) => {
          if (next) setKept(placed.key)
          setOpen(next)
        }}
        onValueChange={(next) => {
          setLanguage(next)
          editor.update(() => {
            const node = $getNodeByKey(placed.key)
            if ($isCodeNode(node)) node.setLanguage(next)
          })
        }}
      >
        <SelectTrigger
          variant="borderless"
          size="compact"
          aria-label={m.editor_code_language()}
          selectedLabel={label}
          className="text-micro text-muted-foreground"
        />
      </Select>
    </div>,
    anchor
  )
}
