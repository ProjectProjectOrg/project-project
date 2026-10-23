import {
  BLANK_TEMPLATE_KEY,
  LIBRARY_KEY_MAX_LENGTH,
  parseTicketBlocks,
  templateBodyFromTicket,
  type BlockLookup,
  type TagName,
  type TemplateDraft,
  TemplateKey,
  type TicketPriority
} from "@pp/shared"

import type { LibraryLayer } from "@/features/library/atoms/libraryScope"
import { keyFromName } from "@/features/library/lib/libraryModel"

export type SaveAsTemplateOptions = Readonly<{
  name: string
  includePriority: boolean
  includeTags: boolean
}>

export type SaveAsTemplateTicket = Readonly<{
  priority: TicketPriority
  tags: ReadonlyArray<TagName>
  body: string
}>

export type SaveAsTemplateSummary = Readonly<{
  body: string
  blocks: number
  customized: number
}>

const FALLBACK_KEY = "template"

export const lookupForLayer = (
  lookup: BlockLookup,
  layer: LibraryLayer
): BlockLookup =>
  layer === "project"
    ? lookup
    : (key) => {
        const definition = lookup(key)
        return definition?.origin === "project" ? undefined : definition
      }

export const saveAsTemplateSummary = (
  body: string,
  lookup: BlockLookup
): SaveAsTemplateSummary => {
  const template = templateBodyFromTicket(body, lookup)
  return {
    body: template.body,
    blocks: parseTicketBlocks(template.body).filter(
      (segment) => segment.kind === "block"
    ).length,
    customized: template.customized
  }
}

export const freeTemplateKey = (
  name: string,
  taken: ReadonlySet<string>
): TemplateKey => {
  const base = keyFromName(name) || FALLBACK_KEY
  const free = (key: string) => key !== BLANK_TEMPLATE_KEY && !taken.has(key)
  if (free(base)) return TemplateKey.make(base)
  for (let index = 2; ; index++) {
    const suffix = `-${index}`
    const candidate = `${base.slice(0, LIBRARY_KEY_MAX_LENGTH - suffix.length).replace(/-+$/, "")}${suffix}`
    if (free(candidate)) return TemplateKey.make(candidate)
  }
}

export const saveAsTemplateDraft = (
  ticket: SaveAsTemplateTicket,
  options: SaveAsTemplateOptions,
  lookup: BlockLookup,
  taken: ReadonlySet<string>
): TemplateDraft => {
  const name = options.name.trim()
  return {
    key: freeTemplateKey(name, taken),
    name,
    icon: "LayoutTemplate",
    color: null,
    description: "",
    priority: options.includePriority ? ticket.priority : null,
    tags: options.includeTags ? ticket.tags : [],
    body: saveAsTemplateSummary(ticket.body, lookup).body
  }
}
