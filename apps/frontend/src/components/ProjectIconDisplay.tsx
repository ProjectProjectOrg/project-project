import {
  attachmentUrl,
  attachmentWidthForCss,
  withAttachmentParams,
  type ProjectIconImage
} from "@pp/shared"
import { useEffect, useRef, useState } from "react"

import { CroppedImage } from "@/components/CroppedImage"
import { preloadImage } from "@/lib/imagePreload"
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
  const source =
    id === null || iconImage === null
      ? null
      : withAttachmentParams(attachmentUrl(orgSlug, id), {
          width: attachmentWidthForCss(
            size * iconImage.crop.zoom,
            typeof window === "undefined" ? 1 : window.devicePixelRatio
          )
        })

  useEffect(() => {
    if (source) void preloadImage(source)
  }, [source])

  const previousId = useRef(id)
  if (previousId.current !== id) {
    previousId.current = id
    if (failed) setFailed(false)
  }

  if (!iconImage || failed || source === null) {
    return (
      <span className={className} style={emojiStyle}>
        {icon}
      </span>
    )
  }

  return (
    <span
      className={cn("relative block overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      <CroppedImage
        src={source}
        crop={iconImage.crop}
        onError={() => setFailed(true)}
        className={cn(
          iconImage.type === "sticker" &&
            "[filter:drop-shadow(0_0_1px_var(--icon-sticker-outline))_drop-shadow(0_1px_2px_rgb(0_0_0/0.45))]"
        )}
      />
    </span>
  )
}
