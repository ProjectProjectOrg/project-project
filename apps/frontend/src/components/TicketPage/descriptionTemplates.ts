import { $convertFromMarkdownString, type Transformer } from "@lexical/markdown"
import {
  isPristineTemplateBody,
  stripHints,
  templateFor,
  type BlockLookup,
  type Library,
  type TemplateDefinition,
  type TicketType
} from "@pp/shared"
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  HISTORY_PUSH_TAG,
  type LexicalEditor
} from "lexical"

import { lookupFor } from "@/components/blocks/blockChrome"
import { $applyTemplate } from "@/components/Lexical/blocks/blockCommands"
import { orderedTemplates } from "@/components/Lexical/blocks/slashMenuItems"

export const START_TEMPLATE_LIMIT = 3

export type TemplateStarts = Readonly<{
  templates: ReadonlyArray<TemplateDefinition>
  more: boolean
}>

export const templateStarts = (
  library: Library,
  ticketType: TicketType
): TemplateStarts => {
  const templates = orderedTemplates(library, ticketType)
  return {
    templates: templates.slice(0, START_TEMPLATE_LIMIT),
    more: templates.length > START_TEMPLATE_LIMIT
  }
}

export type TemplateSwapInput = Readonly<{
  library: Library
  body: string
  from: TicketType
  to: TicketType
}>

const untouchedTemplate = (
  library: Library,
  body: string,
  from: TicketType
): TemplateDefinition | null => {
  const lookup = lookupFor(library)
  const comparable = stripHints(body)
  const current = templateFor(library, from)
  const candidates =
    current === null
      ? library.templates
      : [current, ...library.templates.filter((t) => t.key !== current.key)]
  return (
    candidates.find((template) =>
      isPristineTemplateBody(comparable, template, lookup)
    ) ?? null
  )
}

export const templateSwap = ({
  library,
  body,
  from,
  to
}: TemplateSwapInput): TemplateDefinition | null => {
  const next = templateFor(library, to)
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
