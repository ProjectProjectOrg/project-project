import {
  isRasterImageContentType,
  type AttachmentStatus
} from "@projectproject/shared"

interface SelectableRow {
  readonly id: string
  readonly status: AttachmentStatus
}

export const isDeletable = (row: SelectableRow): boolean =>
  row.status === "orphaned"

export const hasThumbnail = (row: {
  readonly status: AttachmentStatus
  readonly contentType: string
}): boolean =>
  row.status !== "pending" && isRasterImageContentType(row.contentType)

export const hasMorePages = (input: {
  readonly loaded: number
  readonly pageSize: number
  readonly done: boolean
}): boolean =>
  !input.done && input.loaded > 0 && input.loaded % input.pageSize === 0

export const deletableIds = (
  rows: ReadonlyArray<SelectableRow>
): ReadonlyArray<string> => rows.filter(isDeletable).map((row) => row.id)

export const toggleSelection = (
  selected: ReadonlySet<string>,
  id: string
): ReadonlySet<string> => {
  const next = new Set(selected)
  if (!next.delete(id)) next.add(id)
  return next
}

export const prunedSelection = (
  selected: ReadonlySet<string>,
  rows: ReadonlyArray<SelectableRow>
): ReadonlySet<string> => {
  const allowed = new Set(deletableIds(rows))
  return new Set([...selected].filter((id) => allowed.has(id)))
}

export const allDeletableSelected = (
  selected: ReadonlySet<string>,
  rows: ReadonlyArray<SelectableRow>
): boolean => {
  const ids = deletableIds(rows)
  return ids.length > 0 && ids.every((id) => selected.has(id))
}
