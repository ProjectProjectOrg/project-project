import { m } from "@/paraglide/messages"

export const ATTACHMENT_UNAVAILABLE_WIDTH = 260
export const ATTACHMENT_UNAVAILABLE_HEIGHT = 96

export function AttachmentUnavailable() {
  return (
    <span
      className="flex items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-xs text-balance text-muted-foreground"
      style={{
        width: ATTACHMENT_UNAVAILABLE_WIDTH,
        height: ATTACHMENT_UNAVAILABLE_HEIGHT
      }}
    >
      {m.editor_attachment_unavailable()}
    </span>
  )
}
