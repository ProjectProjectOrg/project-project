import { CroppedImage } from "@/components/CroppedImage"
import { cn } from "@/lib/utils"
import type { IconCrop, IconTreatment } from "@/lib/iconDraft"

export type LiveIcon = {
  readonly src: string
  readonly crop: IconCrop
  readonly treatment: IconTreatment
}

export function IconPreviewTile({
  live,
  size,
  radius,
  background
}: {
  live: LiveIcon
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
      <CroppedImage
        src={live.src}
        crop={live.crop}
        className={cn(
          live.treatment === "sticker" &&
            "[filter:drop-shadow(0_0_1px_var(--icon-sticker-outline))_drop-shadow(0_1px_2px_rgb(0_0_0/0.45))]"
        )}
      />
    </span>
  )
}
