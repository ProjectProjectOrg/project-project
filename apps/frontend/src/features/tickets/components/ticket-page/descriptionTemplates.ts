import { $convertFromMarkdownString, type Transformer } from "@lexical/markdown"
import {
  isPristineTypeBody,
  stripHints,
  typeFor,
  type BlockDefinition,
  type BlockLookup,
  type Library,
  type TypeDefinition,
  type TypeKey
} from "@pp/shared"
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

import { $applyTemplate } from "@/features/editor/lexical/blocks/blockCommands"
import { $runSlashItem } from "@/features/editor/lexical/blocks/slashCommands"
import { lookupFor } from "@/features/editor/lib/blockChrome"

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
): TypeDefinition | null => {
  const lookup = lookupFor(library)
  const comparable = stripHints(body)
  const current = from === null ? null : typeFor(library, from)
  const candidates =
    current === null
      ? library.types
      : [current, ...library.types.filter((t) => t.key !== current.key)]
  return (
    candidates.find((template) =>
      isPristineTypeBody(comparable, template, lookup)
    ) ?? null
  )
}

export const templateSwap = ({
  library,
  body,
  from,
  to
}: TemplateSwapInput): TypeDefinition | null => {
  const next = to === null ? null : typeFor(library, to)
  if (next === null) return null
  if (body.trim() === "") return next
  const untouched = untouchedTemplate(library, body, from)
  return untouched === null || untouched.key === next.key ? null : next
}

export type TemplateBodyContext = Readonly<{
  transformers: ReadonlyArray<Transformer>
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
  $applyTemplate(expanded, context.transformers, context.lookup)
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
  $applyTemplate(expanded, context.transformers, context.lookup)
  $ensureTrailingLine()
  $setSelection(null)
}

export function $restoreBody(
  markdown: string,
  transformers: ReadonlyArray<Transformer>
) {
  $convertFromMarkdownString(markdown, [...transformers])
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

export function restoreBody(
  editor: LexicalEditor,
  markdown: string,
  transformers: ReadonlyArray<Transformer>
) {
  editor.update(() => $restoreBody(markdown, transformers), {
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
    {
      kind: "block",
      key: `block:${definition.key}`,
      definition,
      suggestedBy: null
    },
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
