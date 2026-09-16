import { useState, type CSSProperties } from "react"
import { coverCropStyle, type Crop } from "@/lib/coverCrop"
import { cn } from "@/lib/utils"

export function CroppedImage({
  src,
  crop,
  containerAspect = 1,
  className,
  onError
}: {
  src: string
  crop: Crop
  containerAspect?: number
  className?: string
  onError?: () => void
}) {
  const [measured, setMeasured] = useState<{
    src: string
    aspect: number
  } | null>(null)
  const sourceAspect = measured?.src === src ? measured.aspect : null
  const style: CSSProperties | undefined = sourceAspect
    ? coverCropStyle(sourceAspect, containerAspect, crop)
    : undefined

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onLoad={(event) => {
        const image = event.currentTarget
        if (image.naturalHeight > 0)
          setMeasured({ src, aspect: image.naturalWidth / image.naturalHeight })
      }}
      onError={onError}
      className={cn(sourceAspect ? "" : "size-full object-cover", className)}
      style={style}
    />
  )
}
