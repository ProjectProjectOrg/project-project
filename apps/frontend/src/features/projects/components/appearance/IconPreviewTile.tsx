import { cn } from "@pp/ui/lib/utils"

import { CroppedImage } from "@/features/projects/components/CroppedImage"
import type { LiveImageIcon } from "@/features/projects/lib/iconDraft"

export function LiveIconImage({ live }: { live: LiveImageIcon }) {
  return (
    <CroppedImage
      src={live.src}
      crop={live.crop}
      className={cn(live.treatment === "sticker" && "sticker-outline")}
    />
  )
}

export function IconPreviewTile({
  live,
  size,
  radius,
  background
}: {
  live: LiveImageIcon
  size: number
  radius: number
  background?: string
}) {
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden corner-squircle"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: live.treatment === "sticker" ? background : undefined
      }}
    >
      <LiveIconImage live={live} />
    </span>
  )
}
