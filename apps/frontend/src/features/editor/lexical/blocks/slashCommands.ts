import { $createCodeNode } from "@lexical/code"
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/extension"
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND
} from "@lexical/list"
import type { Transformer } from "@lexical/markdown"
import {
  $createHeadingNode,
  $createQuoteNode,
  $isQuoteNode
} from "@lexical/rich-text"
import { $setBlocksType } from "@lexical/selection"
import { INSERT_TABLE_COMMAND } from "@lexical/table"
import {
  expandType,
  formatTicketBlock,
  stripHints,
  type BlockDefinition,
  type BlockLookup
} from "@pp/shared"
import {
  $createParagraphNode,
  $copyNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor
} from "lexical"

import { m } from "@/paraglide/messages"

import { $applyTemplate, $insertBlocksAt } from "./blockCommands"
import type { EditorBlocksMode } from "./editorBlocks"
import { $createHintNode } from "./HintNode"
import type { SlashBasicKind, SlashItem } from "./slashMenuItems"

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

function $insertHint() {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  const text = `{{${m.editor_slash_hint_placeholder()}}}`
  const hint = $createHintNode(text)
  selection.insertNodes([hint])
  hint.select(2, text.length - 2)
}

export function $insertBasic(editor: LexicalEditor, kind: SlashBasicKind) {
  const selection = $getSelection()
  switch (kind) {
    case "paragraph": {
      if (!$isRangeSelection(selection)) return
      const paragraphs: ReturnType<typeof $createParagraphNode>[] = []
      $setBlocksType(selection, () => {
        const paragraph = $createParagraphNode()
        paragraphs.push(paragraph)
        return paragraph
      })
      for (const paragraph of paragraphs) {
        paragraph.setIndent(0)
        let parent = paragraph.getParent()
        while ($isQuoteNode(parent)) {
          const after = paragraph.getNextSiblings()
          if (after.length > 0)
            parent.insertAfter($copyNode(parent).append(...after))
          parent.insertAfter(paragraph)
          if (parent.isEmpty()) parent.remove()
          parent = paragraph.getParent()
        }
      }
      return
    }
    case "heading-1":
    case "heading":
    case "heading-3":
    case "heading-4":
    case "heading-5":
    case "heading-6": {
      const tags = {
        "heading-1": "h1",
        heading: "h2",
        "heading-3": "h3",
        "heading-4": "h4",
        "heading-5": "h5",
        "heading-6": "h6"
      } satisfies Readonly<
        Record<string, Parameters<typeof $createHeadingNode>[0]>
      >
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createHeadingNode(tags[kind]))
      return
    }
    case "quote":
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createQuoteNode())
      return
    case "code":
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createCodeNode())
      return
    case "checklist":
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
      return
    case "bullet-list":
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
      return
    case "numbered-list":
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
      return
    case "divider":
      editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
      return
    case "table":
      editor.dispatchCommand(INSERT_TABLE_COMMAND, {
        columns: "3",
        rows: "3",
        includeHeaders: { rows: true, columns: false }
      })
      return
    case "hint":
      $insertHint()
  }
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
    case "template":
      $applyTemplate(
        expandType(item.template, context.lookup),
        context.transformers,
        context.lookup
      )
      return
    case "basic":
      $insertBasic(editor, item.basic)
      return
    case "gallery":
      return
  }
}
