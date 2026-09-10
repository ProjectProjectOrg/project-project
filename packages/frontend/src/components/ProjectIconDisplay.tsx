import { useState } from "react"
import { attachmentUrl, type ProjectIconImage } from "@projectproject/shared"
import { cn } from "@/lib/utils"

export function ProjectIconDisplay({
  orgSlug,
  icon,
  iconImage,
  size,
  className
}: {
  orgSlug: string
  icon: string
  iconImage: ProjectIconImage | null
  size: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!iconImage || failed) {
    return (
      <span className={className} style={{ fontSize: size * 0.6 }}>
        {icon}
      </span>
    )
  }

  const id =
    iconImage.type === "sticker"
      ? iconImage.renderedAttachmentId
      : iconImage.sourceAttachmentId

  return (
    <img
      src={attachmentUrl(orgSlug, id)}
      alt=""
      role="img"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn(
        "object-cover",
        iconImage.type === "sticker"
          ? "[filter:drop-shadow(0_0_1px_var(--icon-sticker-outline))_drop-shadow(0_1px_2px_rgb(0_0_0/0.45))]"
          : "rounded-[25%]",
        className
      )}
      style={
        iconImage.type === "full_bleed"
          ? {
              objectPosition: `${iconImage.crop.x * 100}% ${iconImage.crop.y * 100}%`,
              scale: String(iconImage.crop.zoom)
            }
          : undefined
      }
    />
  )
}
