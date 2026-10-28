import {
  attachmentUploadContentType,
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  FEEDBACK_MAX_ATTACHMENTS,
  isAllowedAttachmentContentType
} from "@pp/shared"

export type FileRejection = "too_many" | "too_large" | "unsupported"

export type FileCandidate = Readonly<{
  name: string
  type: string
  size: number
}>

export type AcceptedFiles<F extends FileCandidate> = Readonly<{
  accepted: ReadonlyArray<F>
  rejection: FileRejection | null
}>

export const acceptFiles = <F extends FileCandidate>(
  current: number,
  incoming: ReadonlyArray<F>
): AcceptedFiles<F> => {
  const valid = incoming.filter(
    (file) =>
      file.size > 0 &&
      file.size <= FEEDBACK_ATTACHMENT_MAX_BYTES &&
      isAllowedAttachmentContentType(
        attachmentUploadContentType(file.name, file.type)
      )
  )
  const room = Math.max(0, FEEDBACK_MAX_ATTACHMENTS - current)
  const accepted = valid.slice(0, room)
  const rejection: FileRejection | null =
    valid.length > room
      ? "too_many"
      : incoming.some((file) => file.size > FEEDBACK_ATTACHMENT_MAX_BYTES)
        ? "too_large"
        : valid.length < incoming.length
          ? "unsupported"
          : null
  return { accepted, rejection } satisfies AcceptedFiles<F>
}

export const formatFileSize = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
