import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar"
import { $toggleLink } from "@lexical/link"
import { REMOVE_LIST_COMMAND } from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $setBlocksType } from "@lexical/selection"
import { mergeRegister } from "@lexical/utils"
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  FORMAT_TEXT_COMMAND,
  type BaseSelection,
  type LexicalEditor
} from "lexical"
import { useEffect, useRef, useState, type RefObject } from "react"

import { Button } from "../components/button"
import { FluidHoverHighlight } from "../components/fluid-hover-highlight"
import { Link, Unlink } from "../components/icons"
import { ToggleGroup, ToggleGroupItem } from "../components/toggle-group"
import { TooltipGroup } from "../components/tooltip"
import { useFluidHover } from "../hooks/useFluidHover"
import { $insertBasicBlock, BASIC_BLOCK_ICONS } from "./basic-blocks"
import {
  LinkInput,
  Popover,
  ToolbarButton,
  type FormattingToolbarLabels
} from "./formatting-toolbar-parts"
import {
  BLOCK_KINDS,
  LIST_BLOCKS,
  TEXT_FORMATS,
  TOOLBAR_SHORTCUT,
  isToolbarShortcut,
  readToolbar,
  type BlockKind,
  type SelectionAnchor,
  type Toolbar,
  withHttps
} from "./formatting-toolbar-state"

/*
 * FormattingToolbarPlugin: a toolbar over a text selection with the inline
 * formats (bold, italic, strikethrough, code), a link, and the block types
 * the selection can turn into. Alt+F10 moves focus into it.
 */

const DRAG_DISTANCE = 4

export function FormattingToolbarPlugin({
  labels
}: Readonly<{ labels: FormattingToolbarLabels }>) {
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
    if (current.kind !== "text") return
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
        <LinkInput
          labels={labels}
          onApply={finishLink}
          onCancel={() => finishLink(null)}
        />
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
            labels={labels}
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
  labels,
  onLink
}: Readonly<{
  labels: FormattingToolbarLabels
  ref: RefObject<HTMLDivElement | null>
  editor: LexicalEditor
  toolbar: Toolbar
  onLink: () => void
}>) {
  const hover = useFluidHover(ref, { axis: "x" })

  const toggleBlock = (kind: BlockKind) =>
    editor.update(() => {
      const selection = $getSelection()
      if (toolbar.kind !== "text" || !$isRangeSelection(selection)) return
      if (toolbar.block !== kind) $insertBasicBlock(editor, kind)
      else if (LIST_BLOCKS.has(kind))
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
      else $setBlocksType(selection, () => $createParagraphNode())
    })

  return (
    <TooltipGroup sideOffset={10}>
      <ToolbarPrimitive.Root
        ref={ref}
        loopFocus
        aria-label={labels.toolbar}
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
        <FluidHoverHighlight
          hover={hover}
          className="rounded-[14px] [corner-shape:var(--button-corner)]"
        />
        <ToggleGroup
          multiple
          value={[...toolbar.formats]}
          aria-label={labels.text}
        >
          {TEXT_FORMATS.map(({ format, icon: Icon }, index) => (
            <ToolbarButton
              key={format}
              index={index}
              hover={hover}
              label={labels.formats[format]}
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
        {toolbar.kind === "text" && (
          <>
            <ToolbarButton
              label={toolbar.link ? labels.unlink : labels.link}
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
              aria-label={labels.block}
            >
              {BLOCK_KINDS.map((kind, index) => {
                const Icon = BASIC_BLOCK_ICONS[kind]
                return (
                  <ToolbarButton
                    key={kind}
                    index={TEXT_FORMATS.length + 1 + index}
                    hover={hover}
                    label={labels.blocks[kind]}
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
          </>
        )}
      </ToolbarPrimitive.Root>
    </TooltipGroup>
  )
}
