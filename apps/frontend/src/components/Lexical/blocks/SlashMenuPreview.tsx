import {
  expandTemplateKeepingHints,
  type BlockLookup,
  type Library
} from "@pp/shared"
import type { ReactNode } from "react"

import { LibraryContext } from "@/components/blocks/blockChrome"
import { hintsAsEmphasis } from "@/components/blocks/syncedContent"
import { DitheredBlocks } from "@/components/Library/DitheredBlocks"
import { Markdown } from "@/components/Markdown"
import { m } from "@/paraglide/messages"

import type { SlashBasicKind, SlashItem } from "./slashMenuItems"

export const BASIC_LITERALS: Readonly<Record<SlashBasicKind, string>> = {
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

const basicSample = (kind: SlashBasicKind, label: string): string => {
  switch (kind) {
    case "heading":
      return `## ${label}`
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

const previewMarkdown = (
  item: SlashItem,
  label: string,
  lookup: BlockLookup
): string | null => {
  switch (item.kind) {
    case "block":
      return hintsAsEmphasis(item.definition.content)
    case "template":
      return hintsAsEmphasis(expandTemplateKeepingHints(item.template, lookup))
    case "basic":
      return basicSample(item.basic, label)
    case "gallery":
      return null
  }
}

const previewDescription = (item: SlashItem): string | null => {
  if (item.kind === "block") return item.definition.description || null
  if (item.kind === "template") return item.template.description || null
  if (item.kind === "gallery") return m.editor_slash_preview_gallery()
  return null
}

export function SlashMenuPreview({
  item,
  icon,
  name,
  meta,
  library,
  lookup
}: Readonly<{
  item: SlashItem
  icon: ReactNode
  name: string
  meta: string | null
  library: Library
  lookup: BlockLookup
}>) {
  const description = previewDescription(item)
  const markdown = previewMarkdown(item, name, lookup)
  return (
    <div
      key={item.key}
      aria-hidden
      data-slash-preview={item.key}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-3"
    >
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-[13px] font-medium">
          {icon}
          <span className="min-w-0 flex-1 truncate">{name}</span>
          {item.kind === "basic" ? (
            <code className="shrink-0 rounded bg-muted px-1 font-mono text-[11px] text-muted-foreground">
              {BASIC_LITERALS[item.basic]}
            </code>
          ) : null}
        </span>
        {description === null ? null : (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {meta === null ? null : (
          <p className="text-[11px] text-muted-foreground/80">{meta}</p>
        )}
      </div>
      {markdown === null ? (
        <DitheredBlocks size={64} className="mt-2 self-center" />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-md bg-muted/50 [mask-image:linear-gradient(to_bottom,black_80%,transparent)] px-3 py-2">
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
