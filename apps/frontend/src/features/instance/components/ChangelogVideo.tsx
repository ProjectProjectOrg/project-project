import { changelogVideoFile } from "@pp/shared"
import { cn } from "@pp/ui/lib/utils"
import { useReducedMotion } from "motion/react"
import { useState } from "react"

import { useResolvedTheme } from "@/hooks/useTheme"

// A highlight's video comes in a light and a dark file; play the one that
// matches the app around it.
export const changelogVideoUrl = (video: string, theme: "light" | "dark") =>
  `/api/changelog-media/${encodeURIComponent(changelogVideoFile(video, theme))}`

const STILL_AT = 0.6

const shownSources = new Set<string>()

export function ChangelogVideo({
  video,
  label,
  controls = false,
  className
}: Readonly<{
  video: string
  label: string
  controls?: boolean
  className?: string
}>) {
  const reduce = useReducedMotion() ?? false
  const theme = useResolvedTheme()
  const src = changelogVideoUrl(video, theme)
  const [shown, setShown] = useState(() => shownSources.has(src))
  const [seenSrc, setSeenSrc] = useState(src)
  if (seenSrc !== src) {
    setSeenSrc(src)
    setShown(shownSources.has(src))
  }
  // The hairline sits over the picture, so a clip whose background matches
  // the surface around it still reads as a picture with an edge.
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[inherit] [corner-shape:inherit] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-(--tooltip-edge) after:[corner-shape:inherit]",
        className
      )}
    >
      <video
        src={src}
        aria-label={label}
        className={cn(
          "block aspect-video w-full object-cover opacity-0 transition-opacity duration-300 ease-out motion-reduce:transition-none",
          shown && "opacity-100"
        )}
        autoPlay={!reduce}
        onLoadedData={() => {
          shownSources.add(src)
          setShown(true)
        }}
        onLoadedMetadata={(event) => {
          const clip = event.currentTarget
          if (reduce && Number.isFinite(clip.duration))
            clip.currentTime = clip.duration * STILL_AT
        }}
        controls={controls || reduce}
        muted
        loop
        // A short clip, not something to watch on its own.
        disablePictureInPicture
        controlsList="nopictureinpicture nodownload noremoteplayback"
        disableRemotePlayback
        playsInline
        preload="metadata"
      />
    </div>
  )
}
