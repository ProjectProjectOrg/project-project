import type { BranchListItem } from "@pp/shared"

import type { BranchListView } from "@/features/github/atoms/github"
import { slugify } from "@/lib/slug"

const LOAD_MORE_DISTANCE_PX = 96

export type BranchPickerEntry =
  | Readonly<{ kind: "create"; name: string }>
  | Readonly<{ kind: "branch"; branch: BranchListItem }>

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

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const mentionsTicket = (branch: string, ticketId: string): boolean =>
  new RegExp(`(^|[^a-z0-9])${escapeRegExp(ticketId)}($|[^0-9])`, "i").test(
    branch
  )

const toEntry = (branch: BranchListItem): BranchPickerEntry => ({
  kind: "branch",
  branch
})

export const branchPickerEntries = ({
  query,
  suggested,
  items,
  canCreate,
  ticketId,
  defaultBase
}: Readonly<{
  query: string
  suggested: string
  items: ReadonlyArray<BranchListItem>
  canCreate: boolean
  ticketId: string
  defaultBase: string
}>): ReadonlyArray<BranchPickerEntry> => {
  const ticketBranches = items.filter((branch) =>
    mentionsTicket(branch.name, ticketId)
  )
  const defaults = items.filter(
    (branch) =>
      branch.name === defaultBase && !mentionsTicket(branch.name, ticketId)
  )
  const rest = items.filter(
    (branch) =>
      branch.name !== defaultBase && !mentionsTicket(branch.name, ticketId)
  )
  const typed = sanitizeBranchName(query)
  const name = typed === "" ? suggested : typed
  const create: ReadonlyArray<BranchPickerEntry> =
    canCreate && name !== "" && !items.some((branch) => branch.name === name)
      ? [{ kind: "create", name }]
      : []
  const leading = ticketBranches.map(toEntry)
  const trailing = [...defaults, ...rest].map(toEntry)
  return typed === ""
    ? [...leading, ...create, ...trailing]
    : [...leading, ...trailing, ...create]
}

export const baseBranchOrder = ({
  items,
  ticketId,
  defaultBase
}: Readonly<{
  items: ReadonlyArray<BranchListItem>
  ticketId: string
  defaultBase: string
}>): ReadonlyArray<BranchListItem> => {
  const rank = (branch: BranchListItem): number =>
    branch.name === defaultBase
      ? 0
      : branch.isProtected
        ? 1
        : mentionsTicket(branch.name, ticketId)
          ? 2
          : 3
  return items
    .map((branch, index) => ({ branch, index, rank: rank(branch) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ branch }) => branch)
}

export const branchSearchView = ({
  term,
  exact,
  base
}: Readonly<{
  term: string
  exact: BranchListView | null
  base: BranchListView | null
}>): BranchListView | null => {
  if (exact !== null) return exact
  if (base === null) return null
  if (term === "") return base
  const needle = term.toLowerCase()
  const items = base.items.filter((branch) =>
    branch.name.toLowerCase().includes(needle)
  )
  return {
    items,
    totalCount: items.length,
    hasMore: false,
    loadingMore: false,
    loadMoreFailed: false
  }
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
