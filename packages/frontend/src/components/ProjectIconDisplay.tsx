import { useRef, useState } from "react"
import { attachmentUrl, type ProjectIconImage } from "@projectproject/shared"
import { cn } from "@/lib/utils"

export function ProjectIconDisplay({
  orgSlug,
  icon,
  iconImage,
  size,
  className,
  emojiStyle
}: {
  orgSlug: string
  icon: string
  iconImage: ProjectIconImage | null
  size: number
  className?: string
  emojiStyle?: React.CSSProperties
}) {
  const [failed, setFailed] = useState(false)

  const id =
    iconImage?.type === "sticker"
      ? iconImage.renderedAttachmentId
      : (iconImage?.sourceAttachmentId ?? null)

  const previousId = useRef(id)
  if (previousId.current !== id) {
    previousId.current = id
    if (failed) setFailed(false)
  }

  if (!iconImage || failed) {
    return (
      <span className={className} style={emojiStyle}>
        {icon}
      </span>
    )
  }

  return (
    <span
      className={cn("block overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      <img
        src={attachmentUrl(
          orgSlug,
          iconImage.type === "sticker"
            ? iconImage.renderedAttachmentId
            : iconImage.sourceAttachmentId
        )}
        alt=""
        onError={() => setFailed(true)}
        className={cn(
          "size-full object-cover",
          iconImage.type === "sticker" &&
            "[filter:drop-shadow(0_0_1px_var(--icon-sticker-outline))_drop-shadow(0_1px_2px_rgb(0_0_0/0.45))]"
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
    </span>
  )
}
