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
  radius
}: {
  live: LiveIcon
  size: number
  radius: number
}) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center overflow-hidden corner-squircle"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <img
        src={live.src}
        alt=""
        className={cn(
          "size-full object-cover",
          live.treatment === "sticker" &&
            "[filter:drop-shadow(0_0_1px_var(--icon-sticker-outline))_drop-shadow(0_1px_2px_rgb(0_0_0/0.45))]"
        )}
        style={{
          objectPosition: `${live.crop.x * 100}% ${live.crop.y * 100}%`,
          scale: String(live.crop.zoom)
        }}
      />
    </span>
  )
}
