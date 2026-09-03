import {
  isAttachmentDeletable,
  isRasterImageContentType,
  type AttachmentStatus
} from "@projectproject/shared"
import { m } from "@/paraglide/messages"

interface SelectableRow {
  readonly id: string
  readonly status: AttachmentStatus
}

export const STATUS_LABEL: Record<AttachmentStatus, () => string> = {
  live: m.attachments_status_live,
  orphaned: m.attachments_status_orphaned,
  pending: m.attachments_status_pending
}

export const isDeletable = isAttachmentDeletable

export const hasThumbnail = (row: {
  readonly status: AttachmentStatus
  readonly contentType: string
}): boolean =>
  row.status !== "pending" && isRasterImageContentType(row.contentType)

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
