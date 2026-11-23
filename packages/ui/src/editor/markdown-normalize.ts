import { CodeExtension } from "@lexical/code-core"
import {
  HorizontalRuleExtension,
  buildEditorFromExtensions
} from "@lexical/extension"
import { LinkExtension } from "@lexical/link"
import { CheckListExtension, ListExtension } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/mdast"
import { RichTextExtension } from "@lexical/rich-text"
import { TableExtension } from "@lexical/table"
import { defineExtension, type LexicalEditor } from "lexical"

import { SyncedBlockExtension } from "./blocks/synced-block-node"
import { TicketBlockExtension } from "./blocks/ticket-block-extension"
import { TicketBlockMarkdownExtension } from "./blocks/ticket-block-markdown"
import { MarkdownExtension } from "./markdown-extension"

let headless: LexicalEditor | null = null

const markdownEditor = () => {
  headless ??= buildEditorFromExtensions(
    defineExtension({
      name: "@pp/markdown-normalize",
      dependencies: [
        MarkdownExtension,
        RichTextExtension,
        TableExtension,
        ListExtension,
        CheckListExtension,
        LinkExtension,
        CodeExtension,
        HorizontalRuleExtension,
        TicketBlockExtension,
        SyncedBlockExtension,
        TicketBlockMarkdownExtension
      ],
      onError: (error) => {
        throw error
      }
    })
  )
  return headless
}

export const normalizeMarkdown = (markdown: string) => {
  const editor = markdownEditor()
  editor.update(() => $convertFromMarkdownString(markdown), { discrete: true })
  return editor.read(() => $convertToMarkdownString())
}
