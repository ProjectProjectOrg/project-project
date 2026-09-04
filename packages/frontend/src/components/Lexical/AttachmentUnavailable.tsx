import {
  ATTACHMENT_TILE_FOOTER_HEIGHT,
  ATTACHMENT_TILE_MIN_WIDTH,
  ATTACHMENT_TILE_PREVIEW_HEIGHT
} from "./AttachmentTile"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

// A missing attachment holds the same slot as the tile it replaced, filename
// row included.
export const ATTACHMENT_UNAVAILABLE_WIDTH = ATTACHMENT_TILE_MIN_WIDTH
export const ATTACHMENT_UNAVAILABLE_HEIGHT =
  ATTACHMENT_TILE_PREVIEW_HEIGHT + ATTACHMENT_TILE_FOOTER_HEIGHT
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
        "items-center justify-center border border-dashed border-border text-center text-xs text-muted-foreground",
        inline
          ? "mx-0.5 inline-flex rounded-md px-2 align-baseline whitespace-nowrap"
          : "flex rounded-xl px-3 text-balance"
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
