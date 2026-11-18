export const ATTACHMENT_IMAGE_CLASS =
  "h-auto max-h-96 w-auto max-w-full rounded-[18px] object-contain corner-squircle"

export const attachmentWidthStyle = (width: number | null) =>
  width === null ? undefined : { width: `${width}px` }
