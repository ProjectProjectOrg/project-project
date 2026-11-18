import type { Library } from "@pp/shared"
import type { ReactNode } from "react"

import type { BasicBlockKind } from "../../editor/basic-blocks"
import { LibraryContext } from "../blocks/block-chrome"
import { DitheredBlocks } from "../blocks/dithered-blocks"
import { hintsAsEmphasis } from "../blocks/synced-content"
import { Markdown } from "../markdown"
import { m } from "../messages"
import { SlashItem } from "./slash-menu-items"

export const BASIC_LITERALS: Readonly<Record<BasicBlockKind, string>> = {
  paragraph: "¶",
  "heading-1": "#",
  "heading-3": "###",
  "heading-4": "####",
  "heading-5": "#####",
  "heading-6": "######",
  heading: "##",
  checklist: "- [ ]",
  "bullet-list": "-",
  "numbered-list": "1.",
  code: "```",
  quote: ">",
  divider: "---",
  table: "| |",
  hint: "{{ }}"
}

const basicSample = (kind: BasicBlockKind, label: string) => {
  switch (kind) {
    case "paragraph":
      return label
    case "heading-1":
    case "heading-3":
    case "heading-4":
    case "heading-5":
    case "heading-6":
    case "heading":
      return `${BASIC_LITERALS[kind]} ${label}`
    case "checklist":
      return `- [x] ${label}\n- [ ] ${label}`
    case "bullet-list":
      return `- ${label}\n- ${label}`
    case "numbered-list":
      return `1. ${label}\n2. ${label}`
    case "code":
      return `\`\`\`\n${label}\n\`\`\``
    case "quote":
      return `> ${label}`
    case "divider":
      return `${label}\n\n---\n\n${label}`
    case "table":
      return `| ${label} | ${label} |\n| --- | --- |\n|  |  |`
    case "hint":
      return `*${m.editor_slash_hint_placeholder()}*`
  }
}

const previewMarkdown = (item: SlashItem, label: string) =>
  SlashItem.$match(item, {
    block: ({ definition }) => hintsAsEmphasis(definition.content),
    basic: ({ basic }) => basicSample(basic, label),
    gallery: () => null
  })

const previewDescription = (item: SlashItem) =>
  SlashItem.$match(item, {
    block: ({ definition }) => definition.description || null,
    basic: () => null,
    gallery: () => m.editor_slash_preview_gallery()
  })

export function SlashMenuPreview({
  item,
  icon,
  name,
  meta,
  library
}: Readonly<{
  item: SlashItem
  icon: ReactNode
  name: string
  meta: string | null
  library: Library
}>) {
  const description = previewDescription(item)
  const markdown = previewMarkdown(item, name)
  return (
    <div
      key={item.key}
      aria-hidden
      data-slash-preview={item.key}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-3"
    >
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-body font-semibold">
          {icon}
          <span className="min-w-0 flex-1 truncate">{name}</span>
          {SlashItem.$is("basic")(item) ? (
            <code className="shrink-0 rounded bg-muted px-1 font-mono text-micro text-muted-foreground">
              {BASIC_LITERALS[item.basic]}
            </code>
          ) : null}
        </span>
        {description === null ? null : (
          <p className="text-caption text-muted-foreground">{description}</p>
        )}
        {meta === null ? null : (
          <p className="text-micro text-muted-foreground">{meta}</p>
        )}
      </div>
      {markdown === null ? (
        <DitheredBlocks size={64} className="mt-2 self-center" />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
          <LibraryContext value={library}>
            <Markdown blocks="flat" size="compact">
              {markdown}
            </Markdown>
          </LibraryContext>
        </div>
      )}
    </div>
  )
}
