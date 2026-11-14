import { animate, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"

import {
  MemberAvatar,
  type AvatarSubject
} from "@/features/members/components/MemberAvatar"
import {
  dissolveBands,
  pushDissolveLayer,
  type DissolveLayer
} from "@/features/members/lib/dissolveLayers"
import { ditherBandStyle } from "@/features/members/lib/ditherMask"
import { cn } from "@/lib/utils"

const STEPS = 8
const DURATION = 0.32

const loaded = async (image: string | null | undefined) => {
  if (!image) return
  const probe = new Image()
  probe.src = image
  await probe.decode().catch(() => undefined)
}

export function DissolveAvatar({
  member,
  size,
  className,
  avatarClassName
}: Readonly<{
  member: AvatarSubject
  size: number
  className?: string
  avatarClassName?: string
}>) {
  const reduceMotion = useReducedMotion()
  const [seenImage, setSeenImage] = useState(member.image ?? null)
  const [layers, setLayers] = useState<
    ReadonlyArray<DissolveLayer<AvatarSubject>>
  >([])

  const image = member.image ?? null
  if (image !== seenImage) {
    setSeenImage(image)
    setLayers(
      reduceMotion
        ? []
        : pushDissolveLayer(layers, { ...member, image: seenImage }, member)
    )
  }

  const incoming = layers.at(-1)
  const incomingId = incoming?.id
  const incomingImage = incoming?.subject.image

  useEffect(() => {
    if (incomingId === undefined) return undefined
    let stop: (() => void) | undefined
    let cancelled = false
    void loaded(incomingImage).then(() => {
      if (cancelled) return
      const controls = animate(0, STEPS, {
        duration: DURATION,
        ease: "linear",
        onUpdate: (value) => {
          const coverage = Math.floor(value) / STEPS
          setLayers((current) =>
            current.some(
              (layer) => layer.id === incomingId && layer.coverage !== coverage
            )
              ? current.map((layer) =>
                  layer.id === incomingId ? { ...layer, coverage } : layer
                )
              : current
          )
        },
        onComplete: () => setLayers([])
      })
      stop = () => controls.stop()
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [incomingId, incomingImage])

  return (
    <span
      className={cn("relative inline-flex shrink-0 align-top", className)}
      style={{ width: size, height: size }}
    >
      {layers.length === 0 ? (
        <MemberAvatar member={member} size={size} className={avatarClassName} />
      ) : (
        dissolveBands(layers).map((band) => (
          <span
            key={band.id}
            className="absolute inset-0 inline-flex"
            style={ditherBandStyle(band.from, band.coverage, size)}
          >
            <MemberAvatar
              member={band.id === incomingId ? member : band.subject}
              size={size}
              className={avatarClassName}
            />
          </span>
        ))
      )}
    </span>
  )
}
