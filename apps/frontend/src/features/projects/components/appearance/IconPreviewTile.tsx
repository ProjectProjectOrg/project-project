import { cn } from "@pp/ui/lib/utils"
import * as Data from "effect/Data"

import { CroppedImage } from "@/features/projects/components/CroppedImage"
import type { IconCrop, IconTreatment } from "@/features/projects/lib/iconDraft"

export type LiveIcon = Data.TaggedEnum<{
  emoji: Readonly<{ emoji: string }>
  image: Readonly<{
    src: string
    crop: IconCrop
    treatment: IconTreatment
  }>
}>
export const LiveIcon = Data.taggedEnum<LiveIcon>()

export type LiveImageIcon = Data.TaggedEnum.Value<LiveIcon, "image">

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
