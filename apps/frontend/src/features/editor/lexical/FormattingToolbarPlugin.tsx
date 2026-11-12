import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar"
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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject
} from "react"

import { Button } from "@/components/ui/button"
import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import { Popover as PopoverRoot, PopoverContent } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"
import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "@/hooks/useFluidHover"
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

const DRAG_DISTANCE = 4

const STARTS_WITH_HOSTNAME = /^[a-z\d-]+(\.[a-z\d-]+)+(:\d+)?([/?#]|$)/i

const withHttps = (url: string) =>
  STARTS_WITH_HOSTNAME.test(url) && !/\s/.test(url) ? `https://${url}` : url

type ToolbarAlign = "start" | "center"

type SelectionAnchor = Readonly<{ rect: DOMRect; align: ToolbarAlign }>

type Toolbar = SelectionAnchor &
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
  if ($isHeadingNode(top))
    return (
      {
        h1: "heading-1",
        h2: "heading",
        h3: "heading-3",
        h4: "heading-4",
        h5: "heading-5",
        h6: "heading-6"
      } satisfies Readonly<Record<string, SlashBasicKind>>
    )[top.getTag()]
  if ($isQuoteNode(top)) return "quote"
  if ($isCodeNode(top)) return "code"
  return null
}

type ToolbarState = Omit<Toolbar, keyof SelectionAnchor>

const selectionAnchor = (range: Range): SelectionAnchor => {
  const lines = [...range.getClientRects()].filter((line) => line.width > 0)
  const [first] = lines
  const multiline =
    first !== undefined &&
    lines.some((line) => line.top > first.top + first.height / 2)
  return multiline
    ? { rect: first, align: "start" }
    : { rect: range.getBoundingClientRect(), align: "center" }
}

function readState(editor: LexicalEditor): ToolbarState | null {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return null
    if (selection.getTextContent().trim() === "") return null
    const parent = selection.anchor.getNode().getParent()
    return {
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

function readToolbar(
  editor: LexicalEditor,
  focused: Toolbar | null
): Toolbar | null {
  if (focused !== null) {
    const state = readState(editor)
    return state === null ? focused : { ...focused, ...state }
  }
  const root = editor.getRootElement()
  const native = window.getSelection()
  if (root === null || native === null || native.rangeCount === 0) return null
  if (!root.contains(native.anchorNode)) return null
  if (!root.contains(document.activeElement)) return null
  const state = readState(editor)
  if (state === null) return null
  return { ...selectionAnchor(native.getRangeAt(0)), ...state }
}

const TOOLBAR_SHORTCUT = "Alt+F10"

const isToolbarShortcut = (event: globalThis.KeyboardEvent) =>
  event.altKey && event.key === "F10"

function ToolbarButton({
  label,
  index,
  hover,
  render,
  onPress,
  children
}: Readonly<{
  label: string
  index: number
  hover: UseFluidHoverReturn
  render: ReactElement
  onPress?: () => void
  children: ReactNode
}>) {
  const ref = useRef<HTMLButtonElement>(null)
  useRegisterFluidHoverItem(hover.registerItem, index, ref)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ToolbarPrimitive.Button
            ref={ref}
            render={render}
            aria-label={label}
            onFocus={() => hover.setActiveIndex(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onPress}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent sideOffset={10}>{label}</TooltipContent>
    </Tooltip>
  )
}

const STAY_ABOVE = {
  side: "none",
  align: "shift",
  fallbackAxisSide: "none"
} as const

function Popover({
  rect,
  align,
  boundary,
  open,
  onEscape,
  children
}: Readonly<{
  rect: DOMRect | null
  align: ToolbarAlign
  boundary: HTMLElement | null
  open: boolean
  onEscape?: () => void
  children: ReactNode
}>) {
  const anchor = useMemo(
    () => (rect === null ? null : { getBoundingClientRect: () => rect }),
    [rect]
  )
  return (
    <PopoverRoot
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === "escape-key") onEscape?.()
      }}
    >
      <PopoverContent
        anchor={anchor}
        side="top"
        align={align}
        sideOffset={8}
        collisionAvoidance={STAY_ABOVE}
        collisionBoundary={boundary ?? undefined}
        collisionPadding={0}
        initialFocus={false}
        finalFocus={false}
        className="rounded-lg border-border p-1 shadow-md"
      >
        {children}
      </PopoverContent>
    </PopoverRoot>
  )
}

function LinkInput({
  onApply,
  onCancel
}: Readonly<{
  onApply: (url: string) => void
  onCancel: () => void
}>) {
  const [url, setUrl] = useState("")
  return (
    <input
      autoFocus
      value={url}
      placeholder={m.editor_format_link_placeholder()}
      aria-label={m.editor_format_link()}
      onChange={(event) => setUrl(event.target.value)}
      onBlur={onCancel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          onCancel()
          return
        }
        if (event.key !== "Enter") return
        event.preventDefault()
        if (url.trim() === "") onCancel()
        else onApply(url.trim())
      }}
      className="h-7 w-64 bg-transparent px-2 text-body outline-none placeholder:text-muted-foreground"
    />
  )
}

export function FormattingToolbarPlugin() {
  const [editor] = useLexicalComposerContext()
  const [toolbar, setToolbar] = useState<Toolbar | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<Toolbar | null>(null)
  const [root, setRoot] = useState<HTMLElement | null>(null)
  useEffect(() => editor.registerRootListener(setRoot), [editor])
  if (toolbar !== null && toolbar !== shown) setShown(toolbar)
  const shownRef = useRef<Toolbar | null>(null)
  const [linking, setLinking] = useState<
    (SelectionAnchor & Readonly<{ selection: BaseSelection }>) | null
  >(null)

  useEffect(() => {
    let press: Readonly<{ x: number; y: number }> | null = null
    const refresh = () => {
      if (press !== null) return
      const inToolbar =
        toolbarRef.current?.contains(document.activeElement) ?? false
      const next = readToolbar(editor, inToolbar ? shownRef.current : null)
      shownRef.current = next
      setToolbar(next)
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
      if (moved > DRAG_DISTANCE) {
        shownRef.current = null
        setToolbar(null)
      }
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isToolbarShortcut(event)) return
      const button =
        toolbarRef.current?.querySelector<HTMLElement>("[tabindex='0']")
      if (!button) return
      event.preventDefault()
      button.focus()
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
    return mergeRegister(
      editor.registerUpdateListener(refresh),
      editor.registerRootListener((root, previous) => {
        previous?.removeEventListener("keydown", onKeyDown)
        previous?.removeAttribute("aria-keyshortcuts")
        root?.addEventListener("keydown", onKeyDown)
        root?.setAttribute("aria-keyshortcuts", TOOLBAR_SHORTCUT)
      }),
      () => {
        document.removeEventListener("selectionchange", refresh)
        document.removeEventListener("focusin", refresh)
        document.removeEventListener("pointerdown", onPointerDown, true)
        document.removeEventListener("pointermove", onPointerMove, true)
        document.removeEventListener("pointerup", onPointerUp, true)
        document.removeEventListener("pointercancel", onPointerUp, true)
        window.removeEventListener("scroll", refresh, true)
        window.removeEventListener("resize", refresh)
        editor.getRootElement()?.removeEventListener("keydown", onKeyDown)
      }
    )
  }, [editor])

  const finishLink = (url: string | null) => {
    if (linking === null) return
    editor.update(() => {
      $setSelection(linking.selection.clone())
      if (url !== null) $toggleLink(withHttps(url))
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
      setLinking({
        rect: current.rect,
        align: current.align,
        selection: selection.clone()
      })
    }
  }

  return (
    <>
      <Popover
        rect={linking?.rect ?? null}
        align={linking?.align ?? "center"}
        boundary={root}
        open={linking !== null}
      >
        <LinkInput onApply={finishLink} onCancel={() => finishLink(null)} />
      </Popover>
      <Popover
        rect={shown?.rect ?? null}
        align={shown?.align ?? "center"}
        boundary={root}
        open={toolbar !== null && linking === null}
        onEscape={() => {
          shownRef.current = null
          setToolbar(null)
        }}
      >
        {shown !== null && (
          <ToolbarButtons
            ref={toolbarRef}
            editor={editor}
            toolbar={shown}
            onLink={() => startLink(shown)}
          />
        )}
      </Popover>
    </>
  )
}

function ToolbarButtons({
  ref,
  editor,
  toolbar,
  onLink
}: Readonly<{
  ref: RefObject<HTMLDivElement | null>
  editor: LexicalEditor
  toolbar: Toolbar
  onLink: () => void
}>) {
  const hover = useFluidHover(ref, { axis: "x" })

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
      <ToolbarPrimitive.Root
        ref={ref}
        loopFocus
        aria-label={m.editor_format_toolbar()}
        {...hover.handlers}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            hover.setActiveIndex(null)
        }}
        onKeyDown={(event) => {
          if (event.key === "Home" || event.key === "End") {
            event.preventDefault()
            const buttons = event.currentTarget.querySelectorAll("button")
            buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus()
            return
          }
          if (event.key !== "Escape" && event.key !== "Tab") return
          event.preventDefault()
          event.stopPropagation()
          editor.focus()
        }}
        className="relative flex items-center gap-0.5"
      >
        <FluidHoverHighlight hover={hover} className="rounded-md" />
        <ToggleGroup
          multiple
          value={[...toolbar.formats]}
          aria-label={m.editor_format_text()}
        >
          {TEXT_FORMATS.map(({ format, icon: Icon, label }, index) => (
            <ToolbarButton
              key={format}
              index={index}
              hover={hover}
              label={label()}
              render={
                <ToggleGroupItem
                  value={format}
                  onPressedChange={() =>
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
                  }
                />
              }
            >
              <Icon className="size-3.5" />
            </ToolbarButton>
          ))}
        </ToggleGroup>
        <ToolbarButton
          label={
            toolbar.link ? m.editor_format_unlink() : m.editor_format_link()
          }
          index={TEXT_FORMATS.length}
          hover={hover}
          render={<Button variant="toolbar" size="square-7" />}
          onPress={onLink}
        >
          {toolbar.link ? (
            <Unlink className="size-3.5" />
          ) : (
            <Link className="size-3.5" />
          )}
        </ToolbarButton>
        <ToolbarPrimitive.Separator className="mx-1 h-4 w-px bg-border" />
        <ToggleGroup
          value={toolbar.block === null ? [] : [toolbar.block]}
          aria-label={m.editor_format_block()}
        >
          {BLOCK_KINDS.map((kind, index) => {
            const Icon = BASIC_ICONS[kind]
            return (
              <ToolbarButton
                key={kind}
                index={TEXT_FORMATS.length + 1 + index}
                hover={hover}
                label={basicLabel(kind)}
                render={
                  <ToggleGroupItem
                    value={kind}
                    onPressedChange={() => toggleBlock(kind)}
                  />
                }
              >
                <Icon className="size-3.5" />
              </ToolbarButton>
            )
          })}
        </ToggleGroup>
      </ToolbarPrimitive.Root>
    </TooltipProvider>
  )
}
