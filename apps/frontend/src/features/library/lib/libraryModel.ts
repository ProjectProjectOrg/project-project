import {
  isReservedTypeKey,
  LIBRARY_KEY_MAX_LENGTH,
  TICKET_BLOCK_TYPE_PATTERN,
  type BlockDefinition,
  type BlockDraft,
  type TypeDefinition,
  type TypeDraft
} from "@pp/shared"

import { slugify } from "@/lib/slug"

export type LibraryKind = "type" | "section"

export const NEW_ENTRY_KEY = "new"

export const keyFromName = (name: string): string =>
  slugify(name).slice(0, LIBRARY_KEY_MAX_LENGTH).replace(/-+$/, "")

export type KeyProblem = "invalid" | "reserved" | "taken"

export const keyProblem = (
  key: string,
  kind: LibraryKind,
  taken: ReadonlySet<string>
): KeyProblem | null => {
  if (
    key.length === 0 ||
    key.length > LIBRARY_KEY_MAX_LENGTH ||
    !TICKET_BLOCK_TYPE_PATTERN.test(key)
  )
    return "invalid"
  if (key === NEW_ENTRY_KEY || (kind === "type" && isReservedTypeKey(key)))
    return "reserved"
  if (taken.has(key)) return "taken"
  return null
}

export const typeDraftOf = (
  template: TypeDefinition | TypeDraft
): TypeDraft => ({
  key: template.key,
  name: template.name,
  icon: template.icon,
  color: template.color,
  description: template.description,
  priority: template.priority,
  tags: template.tags,
  body: template.body
})

export const blockDraftOf = (
  block: BlockDefinition | BlockDraft
): BlockDraft => ({
  key: block.key,
  name: block.name,
  icon: block.icon,
  color: block.color,
  description: block.description,
  sync: block.sync,
  content: block.content
})

const BLOCK_MARKUP_LINE = /^ {0,3}<\/?block\b/m

export const containsBlockMarkup = (content: string): boolean =>
  BLOCK_MARKUP_LINE.test(content)
