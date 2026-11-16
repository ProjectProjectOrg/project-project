import { createLinkMatcherWithRegExp, formatUrl } from "@lexical/link"
import { INLINE_CODE, TRANSFORMERS } from "@lexical/markdown"
import { type TicketId } from "@pp/shared"

import { ESCAPED_CHECK_LIST } from "../editor/checklist-markdown"
import {
  INLINE_MARKDOWN_TRANSFORMER,
  commonMarkTransformers
} from "../editor/common-mark"
import { HINT_TRANSFORMER } from "../editor/hint-node"
import { HORIZONTAL_RULE } from "../editor/horizontal-rule"
import { TABLE_TRANSFORMER } from "../editor/table-transformer"
import { ATTACHMENT_TRANSFORMER } from "./attachments/attachment-transformer"
import { type EditorBlocksMode } from "./blocks/editor-blocks"
import { createTicketBlockTransformer } from "./blocks/ticket-block-transformer"
import { FIGMA_TRANSFORMER } from "./figma/figma-transformer"
import { MENTION_TRANSFORMER } from "./mentions/mention-transformer"
import { PAPER_TRANSFORMER } from "./paper/paper-transformer"

// The editor's Markdown transformers, per mode, and its autolink matchers.

export const INLINE_AND_BLOCK_TRANSFORMERS = [
  INLINE_MARKDOWN_TRANSFORMER,
  MENTION_TRANSFORMER,
  ESCAPED_CHECK_LIST,
  HORIZONTAL_RULE,
  PAPER_TRANSFORMER,
  FIGMA_TRANSFORMER,
  ...TRANSFORMERS.filter((transformer) => transformer !== INLINE_CODE)
]

export function createMarkdownTransformers(
  inline: ReadonlyArray<(typeof INLINE_AND_BLOCK_TRANSFORMERS)[number]>,
  mode: EditorBlocksMode | undefined
) {
  const content = [TABLE_TRANSFORMER, ...inline]
  const transformers =
    mode === "definition"
      ? [HINT_TRANSFORMER, ...content]
      : [
          createTicketBlockTransformer(commonMarkTransformers(content), {
            emptyAsReference: mode === "template"
          }),
          ...content
        ]
  return commonMarkTransformers(transformers)
}

export const MARKDOWN_TRANSFORMERS = createMarkdownTransformers(
  INLINE_AND_BLOCK_TRANSFORMERS,
  undefined
)

export const ATTACHMENT_MARKDOWN_TRANSFORMERS = createMarkdownTransformers(
  [ATTACHMENT_TRANSFORMER, ...INLINE_AND_BLOCK_TRANSFORMERS],
  undefined
)

export const TEMPLATE_MARKDOWN_TRANSFORMERS = createMarkdownTransformers(
  INLINE_AND_BLOCK_TRANSFORMERS,
  "template"
)

export const DEFINITION_MARKDOWN_TRANSFORMERS = createMarkdownTransformers(
  INLINE_AND_BLOCK_TRANSFORMERS,
  "definition"
)

export const transformersForMode = (
  mode: EditorBlocksMode | undefined,
  attachments: AttachmentsTarget | undefined
) => {
  if (mode === "template") return TEMPLATE_MARKDOWN_TRANSFORMERS
  if (mode === "definition") return DEFINITION_MARKDOWN_TRANSFORMERS
  return transformersForAttachments(attachments)
}

export const transformersForAttachments = (
  attachments: AttachmentsTarget | undefined
) =>
  attachments === undefined
    ? MARKDOWN_TRANSFORMERS
    : ATTACHMENT_MARKDOWN_TRANSFORMERS

export const attachmentsForDescription = (input: {
  readonly orgSlug: string
  readonly slug: string
  readonly ticketId: TicketId
  readonly storageActive: boolean
}): AttachmentsTarget => ({
  orgSlug: input.orgSlug,
  slug: input.slug,
  ticketId: input.ticketId,
  uploadsEnabled: input.storageActive
})

export const URL_MATCHER = createLinkMatcherWithRegExp(
  /(?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?]/i,
  formatUrl
)

export const EMAIL_MATCHER = createLinkMatcherWithRegExp(
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  formatUrl
)

export const AUTO_LINK_MATCHERS = [URL_MATCHER, EMAIL_MATCHER]

export interface AttachmentsTarget {
  readonly orgSlug: string
  readonly slug: string
  readonly ticketId: TicketId
  readonly uploadsEnabled: boolean
}
