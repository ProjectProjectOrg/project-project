import type { Transformer } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import type { Library } from "@pp/shared"
import {
  $getNodeByKey,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type NodeKey
} from "lexical"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

import { lookupFor } from "@/components/blocks/blockChrome"
import { SyncedChip, SyncedChipAction } from "@/components/blocks/SyncedBlock"
import { m } from "@/paraglide/messages"

import { $isTicketBlockNode } from "../TicketBlockNode"
import { $findBlockAtSelection, $topLevelBlocks } from "./blockCommands"
import { registerNoNestedBlocks } from "./definitionMode"
import { $revertToReference } from "./templateBlocks"

export function DefinitionModePlugin({
  transformers
}: Readonly<{ transformers: ReadonlyArray<Transformer> }>) {
  const [editor] = useLexicalComposerContext()
  useEffect(
    () => registerNoNestedBlocks(editor, transformers),
    [editor, transformers]
  )
  return null
}

type ChipBox = Readonly<{
  key: NodeKey
  top: number
  left: number
  width: number
  height: number
}>

const boxFor = (
  editor: LexicalEditor,
  anchor: HTMLElement,
  key: NodeKey
): ChipBox | null => {
  const element = editor.getElementByKey(key)
  if (element === null) return null
  const outer = anchor.getBoundingClientRect()
  const rect = element.getBoundingClientRect()
  return {
    key,
    top: rect.top - outer.top,
    left: rect.left - outer.left,
    width: rect.width,
    height: rect.height
  }
}

const keyForElement = (
  editor: LexicalEditor,
  keys: ReadonlyArray<NodeKey>,
  target: EventTarget | null
): NodeKey | null => {
  if (!(target instanceof Element)) return null
  const block = target.closest(".ticket-block")
  if (block === null) return null
  return keys.find((key) => editor.getElementByKey(key) === block) ?? null
}

export function TemplateCustomizedPlugin({
  library
}: Readonly<{ library: Library }>) {
  const [editor] = useLexicalComposerContext()
  const lookup = useMemo(() => lookupFor(library), [library])
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [customized, setCustomized] = useState<ReadonlyArray<NodeKey>>([])
  const [hovered, setHovered] = useState<NodeKey | null>(null)
  const [focused, setFocused] = useState<NodeKey | null>(null)
  const [box, setBox] = useState<ChipBox | null>(null)

  useEffect(
    () =>
      editor.registerRootListener((root) => {
        setAnchor(root?.parentElement ?? null)
      }),
    [editor]
  )

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) =>
        editorState.read(() => {
          const keys = $topLevelBlocks()
            .filter($isTicketBlockNode)
            .filter((node) => lookup(node.getBlockType()) !== undefined)
            .map((node) => node.getKey())
          setCustomized((current) =>
            current.length === keys.length &&
            current.every((key, index) => key === keys[index])
              ? current
              : keys
          )
          const active = $findBlockAtSelection()?.getKey() ?? null
          setFocused(active !== null && keys.includes(active) ? active : null)
        })
      ),
    [editor, lookup]
  )

  useEffect(() => {
    if (anchor === null) return
    const move = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-template-chip]") !== null
      )
        return
      setHovered(keyForElement(editor, customized, event.target))
    }
    const leave = () => setHovered(null)
    anchor.addEventListener("pointermove", move)
    anchor.addEventListener("pointerleave", leave)
    return () => {
      anchor.removeEventListener("pointermove", move)
      anchor.removeEventListener("pointerleave", leave)
    }
  }, [anchor, customized, editor])

  const active = hovered ?? focused

  useEffect(() => {
    if (anchor === null || active === null || !customized.includes(active)) {
      setBox(null)
      return
    }
    const measure = () => setBox(boxFor(editor, anchor, active))
    measure()
    return editor.registerUpdateListener(measure)
  }, [active, anchor, customized, editor])

  if (anchor === null || box === null) return null

  const revert = () => {
    setHovered(null)
    editor.update(
      () => {
        const node = $getNodeByKey(box.key)
        if ($isTicketBlockNode(node)) $revertToReference(node)
      },
      { tag: HISTORY_PUSH_TAG }
    )
  }

  return createPortal(
    <div
      data-template-chip
      className="pointer-events-none absolute"
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height
      }}
    >
      <SyncedChip label={m.editor_template_customized()} visible>
        <SyncedChipAction label={m.editor_template_revert()} onClick={revert} />
      </SyncedChip>
    </div>,
    anchor
  )
}
