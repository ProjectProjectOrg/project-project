import type { CSSProperties } from "react"
import type { Transition } from "motion/react"
import { transitions } from "@/lib/springs"

export type BannerFrameCrop = {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export type BannerCropRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export const bannerCropRect = (
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number,
  crop: BannerFrameCrop
): BannerCropRect => {
  const sourceAspect = naturalWidth / naturalHeight
  const cropWidth =
    (sourceAspect > 3 ? naturalHeight * 3 : naturalWidth) / crop.zoom
  const cropHeight = cropWidth / 3
  const displayAspect = containerWidth / containerHeight
  const width = displayAspect > 3 ? cropWidth : cropHeight * displayAspect
  const height = displayAspect > 3 ? cropWidth / displayAspect : cropHeight
  const x = (naturalWidth - cropWidth) * crop.x + (cropWidth - width) / 2
  const y = (naturalHeight - cropHeight) * crop.y + (cropHeight - height) / 2
  return { x, y, width, height }
}

export const bannerCropStyle = (
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number,
  crop: BannerFrameCrop
): CSSProperties | undefined => {
  if (
    naturalWidth <= 0 ||
    naturalHeight <= 0 ||
    containerWidth <= 0 ||
    containerHeight <= 0
  )
    return undefined
  const rect = bannerCropRect(
    naturalWidth,
    naturalHeight,
    containerWidth,
    containerHeight,
    crop
  )
  if (rect.width <= 0 || rect.height <= 0) return undefined
  return {
    position: "absolute",
    left: `${(-rect.x / rect.width) * 100}%`,
    top: `${(-rect.y / rect.height) * 100}%`,
    width: `${(naturalWidth / rect.width) * 100}%`,
    height: `${(naturalHeight / rect.height) * 100}%`,
    maxWidth: "none"
  }
}

const FADE_MASK_STEPS = 8

export const bannerFadeMask = (fadeDepth: number): string => {
  const depth = Math.min(Math.max(fadeDepth, 0), 1)
  if (depth <= 0) return "none"
  const edge0 = 1 - depth
  const stops = [
    `rgba(0,0,0,1) 0%`,
    `rgba(0,0,0,1) ${(edge0 * 100).toFixed(2)}%`
  ]
  for (let i = 1; i <= FADE_MASK_STEPS; i++) {
    const t = i / FADE_MASK_STEPS
    const y = edge0 + t * depth
    const smoothstep = t * t * (3 - 2 * t)
    const alpha = 1 - smoothstep
    stops.push(`rgba(0,0,0,${alpha.toFixed(3)}) ${(y * 100).toFixed(2)}%`)
  }
  return `linear-gradient(to bottom, ${stops.join(", ")})`
}

export type BannerCrossfadeTweens = {
  readonly unblur: Transition
  readonly dissolve: Transition
}

export const bannerCrossfadeTransitions = (
  reduceMotion: boolean
): BannerCrossfadeTweens => {
  if (reduceMotion)
    return {
      unblur: { duration: 0 },
      dissolve: { duration: 0, delay: 0 }
    }
  const delay = Math.max(
    transitions.morph.duration - transitions.fade.duration,
    0
  )
  return {
    unblur: transitions.morph,
    dissolve: { ...transitions.fade, delay }
  }
}
