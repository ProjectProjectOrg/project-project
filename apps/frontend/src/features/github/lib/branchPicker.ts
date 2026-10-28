import type { BranchListItem } from "@pp/shared"

import { slugify } from "@/lib/slug"

const LOAD_MORE_DISTANCE_PX = 96

export type BranchPickerEntry =
  | Readonly<{ kind: "create"; name: string }>
  | Readonly<{ kind: "branch"; branch: BranchListItem }>

export type Retained<T> = Readonly<{ key: string; value: T | null }>

export const defaultBranchName = (
  template: string | null,
  type: string,
  id: string,
  title: string
): string =>
  (template ?? "{type}/{id}-{slug}")
    .replace("{type}", type)
    .replace("{id}", id)
    .replace("{slug}", slugify(title))

export const sanitizeBranchName = (raw: string): string =>
  raw.trim().replace(/\s+/g, "-")

export const branchPickerEntries = ({
  query,
  suggested,
  items,
  canCreate
}: Readonly<{
  query: string
  suggested: string
  items: ReadonlyArray<BranchListItem>
  canCreate: boolean
}>): ReadonlyArray<BranchPickerEntry> => {
  const branches = items.map(
    (branch): BranchPickerEntry => ({ kind: "branch", branch })
  )
  if (!canCreate) return branches
  const typed = sanitizeBranchName(query)
  const name = typed === "" ? suggested : typed
  if (name === "" || items.some((branch) => branch.name === name)) {
    return branches
  }
  const create: BranchPickerEntry = { kind: "create", name }
  return typed === "" ? [create, ...branches] : [...branches, create]
}

export const retainLatest = <T>(
  cache: Retained<T>,
  key: string,
  current: T | null
): Retained<T> => {
  if (current !== null) return { key, value: current }
  return cache.key === key ? cache : { key, value: null }
}

export const shouldLoadMoreBranches = ({
  scrollTop,
  scrollHeight,
  clientHeight
}: Readonly<{
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}>): boolean => scrollHeight - scrollTop - clientHeight <= LOAD_MORE_DISTANCE_PX

export const branchMenuFilter = (
  query: string,
  setQuery: (next: string) => void,
  autoHighlight: boolean | "always"
) => ({ value: query, onValueChange: setQuery, filter: null, autoHighlight })
