import { CroppedImage } from "@/components/CroppedImage"
import type { IconCrop, IconTreatment } from "@/lib/iconDraft"
import { cn } from "@/lib/utils"

export type LiveIcon =
  | { readonly kind: "emoji"; readonly emoji: string }
  | {
      readonly kind: "image"
      readonly src: string
      readonly crop: IconCrop
      readonly treatment: IconTreatment
    }

export type LiveImageIcon = Extract<LiveIcon, { kind: "image" }>

export function LiveIconImage({ live }: { live: LiveImageIcon }) {
  return (
    <CroppedImage
      src={live.src}
      crop={live.crop}
      className={cn(
        live.treatment === "sticker" &&
          "[filter:drop-shadow(0_0_1px_var(--icon-sticker-outline))_drop-shadow(0_1px_2px_rgb(0_0_0/0.45))]"
      )}
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
