import { $isCodeNode } from "@lexical/code"
import { $isLinkNode, $toggleLink } from "@lexical/link"
import { $isListNode, ListNode, REMOVE_LIST_COMMAND } from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text"
import { $setBlocksType } from "@lexical/selection"
import { $getNearestNodeOfType, mergeRegister } from "@lexical/utils"
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  FORMAT_TEXT_COMMAND,
  type BaseSelection,
  type LexicalEditor,
  type RangeSelection,
  type TextFormatType
} from "lexical"
import {
  Bold,
  Code,
  Italic,
  Link,
  Strikethrough,
  Unlink,
  type LucideIcon
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { $insertBasic } from "./blocks/slashCommands"
import type { SlashBasicKind } from "./blocks/slashMenuItems"
import { BASIC_ICONS, basicLabel } from "./blocks/SlashMenuView"

const TEXT_FORMATS: ReadonlyArray<
  Readonly<{ format: TextFormatType; icon: LucideIcon; label: () => string }>
> = [
  { format: "bold", icon: Bold, label: m.editor_format_bold },
  { format: "italic", icon: Italic, label: m.editor_format_italic },
  {
    format: "strikethrough",
    icon: Strikethrough,
    label: m.editor_format_strikethrough
  },
  { format: "code", icon: Code, label: m.editor_format_code }
]

const BLOCK_KINDS: ReadonlyArray<SlashBasicKind> = [
  "heading",
  "bullet-list",
  "numbered-list",
  "checklist",
  "quote",
  "code"
]

const LIST_KINDS = {
  bullet: "bullet-list",
  number: "numbered-list",
  check: "checklist"
} as const satisfies Record<ReturnType<ListNode["getListType"]>, SlashBasicKind>

const LIST_BLOCKS: ReadonlySet<SlashBasicKind> = new Set(
  Object.values(LIST_KINDS)
)

const TOOLBAR_HEIGHT = 36
const EDGE = 8
const HALF_WIDTH = 175
const DRAG_DISTANCE = 4

type Anchor = Readonly<{ top: number; left: number; side: "top" | "bottom" }>

type Toolbar = Anchor &
  Readonly<{
    formats: ReadonlySet<TextFormatType>
    link: boolean
    block: SlashBasicKind | null
  }>

function $blockOf(selection: RangeSelection): SlashBasicKind | null {
  const anchor = selection.anchor.getNode()
  const list = $getNearestNodeOfType(anchor, ListNode)
  if ($isListNode(list)) return LIST_KINDS[list.getListType()]
  const top = anchor.getTopLevelElement()
  if ($isHeadingNode(top)) return "heading"
  if ($isQuoteNode(top)) return "quote"
  if ($isCodeNode(top)) return "code"
  return null
}

function anchorFor(rect: DOMRect, bounds: DOMRect): Anchor {
  const above = rect.top - TOOLBAR_HEIGHT - EDGE
  const side = above < EDGE ? "bottom" : "top"
  return {
    side,
    top: side === "top" ? above : rect.bottom + EDGE,
    left: Math.max(
      Math.min(rect.left + rect.width / 2, bounds.right - HALF_WIDTH),
      bounds.left + HALF_WIDTH
    )
  }
}

function readToolbar(editor: LexicalEditor): Toolbar | null {
  const root = editor.getRootElement()
  const native = window.getSelection()
  if (root === null || native === null || native.rangeCount === 0) return null
  if (!root.contains(native.anchorNode)) return null
  if (!root.contains(document.activeElement)) return null
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return null
    if (selection.getTextContent().trim() === "") return null
    const parent = selection.anchor.getNode().getParent()
    return {
      ...anchorFor(
        native.getRangeAt(0).getBoundingClientRect(),
        root.getBoundingClientRect()
      ),
      formats: new Set(
        TEXT_FORMATS.flatMap(({ format }) =>
          selection.hasFormat(format) ? [format] : []
        )
      ),
      link: $isLinkNode(parent),
      block: $blockOf(selection)
    }
  })
}

function ToolbarButton({
  label,
  active,
  onPress,
  children
}: Readonly<{
  label: string
  active: boolean
  onPress: () => void
  children: ReactNode
}>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onPress}
            className={cn(
              "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground",
              active && "bg-hover text-foreground"
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        sideOffset={10}
        className="rounded-sm border border-border bg-popover text-popover-foreground"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

const SURFACE =
  "fixed z-50 -translate-x-1/2 rounded-lg border border-border bg-popover p-1 shadow-md"

function Popover({
  anchor,
  className,
  children,
  ...props
}: Readonly<{
  anchor: Anchor
  className?: string
  children: ReactNode
  role?: string
  "aria-label"?: string
}>) {
  const reduced = useReducedMotion() === true
  const offset = reduced ? 0 : anchor.side === "top" ? 8 : -8
  const scale = reduced ? 1 : 0.95
  return (
    <motion.div
      {...props}
      initial={{ opacity: 0, scale, y: offset }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        SURFACE,
        anchor.side === "top" ? "origin-bottom" : "origin-top",
        className
      )}
      style={{ top: anchor.top, left: anchor.left }}
    >
      {children}
    </motion.div>
  )
}

function LinkInput({
  anchor,
  onApply,
  onCancel
}: Readonly<{
  anchor: Anchor
  onApply: (url: string) => void
  onCancel: () => void
}>) {
  const [url, setUrl] = useState("")
  return (
    <Popover anchor={anchor}>
      <input
        autoFocus
        value={url}
        placeholder={m.editor_format_link_placeholder()}
        aria-label={m.editor_format_link()}
        onChange={(event) => setUrl(event.target.value)}
        onBlur={onCancel}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel()
          if (event.key !== "Enter") return
          event.preventDefault()
          if (url.trim() === "") onCancel()
          else onApply(url.trim())
        }}
        className="h-7 w-64 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
      />
    </Popover>
  )
}

export function FormattingToolbarPlugin() {
  const [editor] = useLexicalComposerContext()
  const [toolbar, setToolbar] = useState<Toolbar | null>(null)
  const [linking, setLinking] = useState<Readonly<{
    anchor: Anchor
    selection: BaseSelection
  }> | null>(null)

  useEffect(() => {
    let press: Readonly<{ x: number; y: number }> | null = null
    const refresh = () => {
      if (press === null) setToolbar(readToolbar(editor))
    }
    const onPointerDown = (event: PointerEvent) => {
      const root = editor.getRootElement()
      if (event.target instanceof Node && root?.contains(event.target)) {
        press = { x: event.clientX, y: event.clientY }
      }
    }
    const onPointerMove = (event: PointerEvent) => {
      if (press === null) return
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y)
      if (moved > DRAG_DISTANCE) setToolbar(null)
    }
    const onPointerUp = () => {
      if (press === null) return
      press = null
      refresh()
    }
    document.addEventListener("selectionchange", refresh)
    document.addEventListener("focusin", refresh)
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("pointermove", onPointerMove, true)
    document.addEventListener("pointerup", onPointerUp, true)
    document.addEventListener("pointercancel", onPointerUp, true)
    window.addEventListener("scroll", refresh, true)
    window.addEventListener("resize", refresh)
    return mergeRegister(editor.registerUpdateListener(refresh), () => {
      document.removeEventListener("selectionchange", refresh)
      document.removeEventListener("focusin", refresh)
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("pointermove", onPointerMove, true)
      document.removeEventListener("pointerup", onPointerUp, true)
      document.removeEventListener("pointercancel", onPointerUp, true)
      window.removeEventListener("scroll", refresh, true)
      window.removeEventListener("resize", refresh)
    })
  }, [editor])

  const finishLink = (url: string | null) => {
    if (linking === null) return
    editor.update(() => {
      $setSelection(linking.selection.clone())
      if (url !== null) $toggleLink(url)
    })
    setLinking(null)
    editor.focus()
  }

  const startLink = (current: Toolbar) => {
    if (current.link) {
      editor.update(() => $toggleLink(null))
      return
    }
    const selection = editor.getEditorState().read(() => $getSelection())
    if (selection !== null) {
      setLinking({ anchor: current, selection: selection.clone() })
    }
  }

  return createPortal(
    <AnimatePresence>
      {linking !== null ? (
        <LinkInput
          key="link"
          anchor={linking.anchor}
          onApply={finishLink}
          onCancel={() => finishLink(null)}
        />
      ) : toolbar !== null ? (
        <ToolbarPopover
          key="toolbar"
          editor={editor}
          toolbar={toolbar}
          onLink={() => startLink(toolbar)}
        />
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

function ToolbarPopover({
  editor,
  toolbar,
  onLink
}: Readonly<{ editor: LexicalEditor; toolbar: Toolbar; onLink: () => void }>) {
  const toggleBlock = (kind: SlashBasicKind) =>
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      if (toolbar.block !== kind) $insertBasic(editor, kind)
      else if (LIST_BLOCKS.has(kind))
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
      else $setBlocksType(selection, () => $createParagraphNode())
    })

  return (
    <TooltipProvider>
      <Popover
        anchor={toolbar}
        role="toolbar"
        aria-label={m.editor_format_toolbar()}
        className="flex items-center gap-0.5"
      >
        {TEXT_FORMATS.map(({ format, icon: Icon, label }) => (
          <ToolbarButton
            key={format}
            label={label()}
            active={toolbar.formats.has(format)}
            onPress={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}
          >
            <Icon className="size-3.5" />
          </ToolbarButton>
        ))}
        <ToolbarButton
          label={
            toolbar.link ? m.editor_format_unlink() : m.editor_format_link()
          }
          active={toolbar.link}
          onPress={onLink}
        >
          {toolbar.link ? (
            <Unlink className="size-3.5" />
          ) : (
            <Link className="size-3.5" />
          )}
        </ToolbarButton>
        <span aria-hidden className="mx-1 h-4 w-px bg-border" />
        {BLOCK_KINDS.map((kind) => {
          const Icon = BASIC_ICONS[kind]
          return (
            <ToolbarButton
              key={kind}
              label={basicLabel(kind)}
              active={toolbar.block === kind}
              onPress={() => toggleBlock(kind)}
            >
              <Icon className="size-3.5" />
            </ToolbarButton>
          )
        })}
      </Popover>
    </TooltipProvider>
  )
}
