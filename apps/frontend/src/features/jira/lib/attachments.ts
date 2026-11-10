import type { JiraMigrationRequirements } from "@pp/shared"

type Attachment = JiraMigrationRequirements["attachments"][number]

export type JiraAttachmentSkip =
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "unavailable"

export const attachmentSkip = (
  attachment: Pick<Attachment, "byteSize" | "forcedSkipReason">
): JiraAttachmentSkip | null => {
  if (attachment.forcedSkipReason === null) return null
  return attachment.forcedSkipReason === "too_large" &&
    attachment.byteSize === 0
    ? "empty"
    : attachment.forcedSkipReason
}

export type JiraAttachmentSkipCount = Readonly<{
  skip: JiraAttachmentSkip
  count: number
}>

export function attachmentSkipCounts(
  attachments: ReadonlyArray<Pick<Attachment, "byteSize" | "forcedSkipReason">>
): ReadonlyArray<JiraAttachmentSkipCount> {
  const counts = new Map<JiraAttachmentSkip, number>()
  for (const attachment of attachments) {
    const skip = attachmentSkip(attachment)
    if (skip !== null) counts.set(skip, (counts.get(skip) ?? 0) + 1)
  }
  return [...counts]
    .map(([skip, count]) => ({ skip, count }))
    .toSorted((a, b) => b.count - a.count)
}
