import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export const ATTACHMENT_UNAVAILABLE_WIDTH = 260
export const ATTACHMENT_UNAVAILABLE_HEIGHT = 96
export const ATTACHMENT_UNAVAILABLE_CHIP_WIDTH = 240
export const ATTACHMENT_UNAVAILABLE_CHIP_HEIGHT = 22

export function AttachmentUnavailable({
  variant = "block"
}: {
  variant?: "block" | "inline"
}) {
  const inline = variant === "inline"
  return (
    <span
      className={cn(
        "items-center justify-center rounded-md border border-dashed border-border text-center text-xs text-muted-foreground",
        inline
          ? "inline-flex gap-1.5 px-2 align-middle whitespace-nowrap"
          : "flex rounded-lg px-4 text-balance"
      )}
      style={
        inline
          ? {
              width: ATTACHMENT_UNAVAILABLE_CHIP_WIDTH,
              height: ATTACHMENT_UNAVAILABLE_CHIP_HEIGHT
            }
          : {
              width: ATTACHMENT_UNAVAILABLE_WIDTH,
              height: ATTACHMENT_UNAVAILABLE_HEIGHT
            }
      }
    >
      {m.editor_attachment_unavailable()}
    </span>
  )
}
