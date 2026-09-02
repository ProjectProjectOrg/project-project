export const ATTACHMENT_IMAGE_CLASS =
  "h-auto max-h-96 w-auto max-w-full rounded-lg object-contain"

export const attachmentWidthStyle = (
  width: number | null
): { width: string } | undefined =>
  width === null ? undefined : { width: `${width}px` }
