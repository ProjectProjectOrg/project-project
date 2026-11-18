import type { Transformer } from "@lexical/markdown"
import {
  formatTicketBlock,
  stripHints,
  type BlockDefinition,
  type BlockLookup
} from "@pp/shared"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor
} from "lexical"

import { $insertBasicBlock } from "../../editor/basic-blocks"
import { $insertBlocksAt } from "../blocks/block-commands"
import type { EditorBlocksMode } from "../blocks/editor-blocks"
import { m } from "../messages"
import type { SlashItem } from "./slash-menu-items"

export function $typeSlashTrigger() {
  const current = $getSelection()
  if (!$isRangeSelection(current)) $getRoot().selectStart()
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  const before = selection.anchor.getNode().getTextContent()
  const offset = selection.anchor.offset
  const needsSpace = offset > 0 && !/\s/.test(before[offset - 1] ?? "")
  selection.insertText(needsSpace ? " /" : "/")
}

const blockMarkdown = (
  definition: BlockDefinition,
  detach: boolean,
  mode: EditorBlocksMode
): string => {
  if (mode === "template" && !detach)
    return formatTicketBlock(definition.key, "")
  return formatTicketBlock(definition.key, stripHints(definition.content), {
    sync: definition.sync && !detach && mode !== "template"
  })
}

export function $runSlashItem(
  editor: LexicalEditor,
  item: SlashItem,
  context: Readonly<{
    transformers: ReadonlyArray<Transformer>
    lookup: BlockLookup
    detach: boolean
    mode?: EditorBlocksMode
  }>
) {
  switch (item.kind) {
    case "block":
      $insertBlocksAt(
        blockMarkdown(
          item.definition,
          context.detach,
          context.mode ?? "ticket"
        ),
        context.transformers,
        context.lookup
      )
      return
    case "basic":
      $insertBasicBlock(editor, item.basic, m.editor_slash_hint_placeholder())
      return
    case "gallery":
      return
  }
}
