import {
  attachmentUrl,
  attachmentWidthForCss,
  withAttachmentParams,
  type ProjectIconImage
} from "@pp/shared"
import { cn } from "@pp/ui/lib/utils"
import { useEffect, useState } from "react"

import { CroppedImage } from "@/features/projects/components/CroppedImage"
import { preloadImage } from "@/features/projects/lib/imagePreload"

type Props = Readonly<{
  orgSlug: string
  icon: string
  iconImage: ProjectIconImage | null
  size: number
  className?: string
  emojiStyle?: React.CSSProperties
}>

export function ProjectIconDisplay(props: Props) {
  const { iconImage } = props
  const id =
    iconImage?.type === "sticker"
      ? iconImage.renderedAttachmentId
      : (iconImage?.sourceAttachmentId ?? null)
  return <IconImage key={id} {...props} id={id} />
}

function IconImage({
  orgSlug,
  icon,
  iconImage,
  size,
  className,
  emojiStyle,
  id
}: Props & Readonly<{ id: ProjectIconImage["sourceAttachmentId"] | null }>) {
  const [failed, setFailed] = useState(false)
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
        className={cn(iconImage.type === "sticker" && "sticker-outline")}
      />
    </span>
  )
}
