import {
  LIBRARY_KEY_MAX_LENGTH,
  TICKET_BLOCK_TYPE_PATTERN,
  type BlockDefinition,
  type BlockDraft,
  type LibraryOrigin
} from "@pp/shared"

import { slugify } from "@/lib/slug"

import type { LibraryLayer } from "./libraryScope"

export type LibraryKind = "block"

export type RowAction = "customize" | "duplicate" | "hide" | "reset" | "delete"

type Placement = Readonly<{
  key: string
  origin: LibraryOrigin
  shadows: LibraryOrigin | null
  hidden: boolean
}>

export const rowActions = (
  entry: Placement,
  layer: LibraryLayer,
  canEdit: boolean
): ReadonlyArray<RowAction> => {
  if (!canEdit || entry.hidden) return []
  if (entry.origin === layer)
    return ["duplicate", entry.shadows === null ? "delete" : "reset"]
  return ["customize", "duplicate", "hide"]
}

export const canUnhide = (
  entry: Placement,
  layer: LibraryLayer,
  canEdit: boolean
): boolean => canEdit && entry.hidden && entry.origin === layer

export const splitHidden = <A extends Placement>(
  entries: ReadonlyArray<A>
): Readonly<{ visible: ReadonlyArray<A>; hidden: ReadonlyArray<A> }> => ({
  visible: entries.filter((entry) => !entry.hidden),
  hidden: entries.filter((entry) => entry.hidden)
})

export const keyFromName = (name: string): string =>
  slugify(name).slice(0, LIBRARY_KEY_MAX_LENGTH).replace(/-+$/, "")

export type KeyProblem = "invalid" | "taken"

export const keyProblem = (
  key: string,
  taken: ReadonlySet<string>
): KeyProblem | null => {
  if (
    key.length === 0 ||
    key.length > LIBRARY_KEY_MAX_LENGTH ||
    !TICKET_BLOCK_TYPE_PATTERN.test(key)
  )
    return "invalid"
  if (taken.has(key)) return "taken"
  return null
}

export const copyKey = (key: string, taken: ReadonlySet<string>): string => {
  const candidate = (suffix: string) =>
    `${key.slice(0, LIBRARY_KEY_MAX_LENGTH - suffix.length).replace(/-+$/, "")}${suffix}`
  const first = candidate("-copy")
  if (!taken.has(first)) return first
  for (let index = 2; ; index++) {
    const next = candidate(`-copy-${index}`)
    if (!taken.has(next)) return next
  }
}

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

export const layoutIdFor = (kind: LibraryKind, key: string): string =>
  `library-${kind}:${key}`
