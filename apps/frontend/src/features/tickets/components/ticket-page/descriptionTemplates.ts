import { $convertFromMarkdownString } from "@lexical/mdast"
import {
  expandType,
  isPristineTypeBody,
  stripHints,
  typeFor,
  type BlockDefinition,
  type BlockLookup,
  type Library,
  type TypeKey
} from "@pp/shared"
import { lookupFor } from "@pp/ui/editor/blocks/block-chrome"
import { $applyTemplate } from "@pp/ui/editor/blocks/block-commands"
import { normalizeMarkdown } from "@pp/ui/editor/markdown-normalize"
import { $runSlashItem } from "@pp/ui/editor/slash-menu/slash-commands"
import { SlashItem } from "@pp/ui/editor/slash-menu/slash-menu-items"
import {
  $createParagraphNode,
  $getRoot,
  $isParagraphNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  HISTORY_PUSH_TAG,
  type LexicalEditor
} from "lexical"

export type TemplateSwapInput = Readonly<{
  library: Library
  body: string
  from: TypeKey | null
  to: TypeKey | null
}>

const untouchedTemplate = (
  library: Library,
  body: string,
  from: TypeKey | null
) => {
  const lookup = lookupFor(library)
  const comparable = normalizeMarkdown(stripHints(body))
  const current = from === null ? null : typeFor(library, from)
  const candidates =
    current === null
      ? library.types
      : [current, ...library.types.filter((t) => t.key !== current.key)]
  return (
    candidates.find((template) =>
      isPristineTypeBody(
        comparable,
        normalizeMarkdown(expandType(template, lookup))
      )
    ) ?? null
  )
}

export const templateSwap = ({
  library,
  body,
  from,
  to
}: TemplateSwapInput) => {
  const next = to === null ? null : typeFor(library, to)
  if (next === null) return null
  if (body.trim() === "") return next
  const untouched = untouchedTemplate(library, body, from)
  return untouched === null || untouched.key === next.key ? null : next
}

export type TemplateBodyContext = Readonly<{
  lookup: BlockLookup
}>

function $ensureTrailingLine() {
  const root = $getRoot()
  if (root.getLastChild()?.getType() !== "paragraph")
    root.append($createParagraphNode())
}

export function $startFromTemplate(
  expanded: string,
  context: TemplateBodyContext
) {
  if (!$isRangeSelection($getSelection())) $getRoot().selectStart()
  $applyTemplate(expanded, context.lookup)
  $ensureTrailingLine()
}

export function $replaceWithTemplate(
  expanded: string,
  context: TemplateBodyContext
) {
  const root = $getRoot()
  root.clear()
  const line = $createParagraphNode()
  root.append(line)
  line.select()
  $applyTemplate(expanded, context.lookup)
  $ensureTrailingLine()
  $setSelection(null)
}

export function $restoreBody(markdown: string) {
  $convertFromMarkdownString(markdown)
  $ensureTrailingLine()
  $setSelection(null)
}

export function startFromTemplate(
  editor: LexicalEditor,
  expanded: string,
  context: TemplateBodyContext
) {
  editor.update(() => $startFromTemplate(expanded, context), {
    tag: HISTORY_PUSH_TAG,
    onUpdate: () => editor.focus()
  })
}

export function replaceWithTemplate(
  editor: LexicalEditor,
  expanded: string,
  context: TemplateBodyContext
) {
  editor.update(() => $replaceWithTemplate(expanded, context), {
    tag: HISTORY_PUSH_TAG,
    discrete: true
  })
}

export function restoreBody(editor: LexicalEditor, markdown: string) {
  editor.update(() => $restoreBody(markdown), {
    tag: HISTORY_PUSH_TAG
  })
}

export function $appendSection(
  editor: LexicalEditor,
  definition: BlockDefinition,
  context: TemplateBodyContext
) {
  const root = $getRoot()
  const last = root.getLastChild()
  if ($isParagraphNode(last) && last.getTextContentSize() === 0) last.select()
  else {
    const line = $createParagraphNode()
    root.append(line)
    line.select()
  }
  $runSlashItem(
    editor,
    SlashItem.block({
      key: `block:${definition.key}`,
      definition,
      suggestedBy: null
    }),
    { ...context, detach: false }
  )
}

export function appendSection(
  editor: LexicalEditor,
  definition: BlockDefinition,
  context: TemplateBodyContext
) {
  editor.update(() => $appendSection(editor, definition, context), {
    tag: HISTORY_PUSH_TAG,
    onUpdate: () => editor.focus()
  })
}
