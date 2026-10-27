import { useAtomValue } from "@effect/atom-react"
import type { ProjectBanner as Banner } from "@pp/shared"
import * as Match from "effect/Match"
import { useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import {
  projectBannerPreview,
  projectKey,
  projectRequest
} from "@/features/projects/atoms/projects"
import {
  useBannerImage,
  usePlaceholderSize
} from "@/features/projects/hooks/useBannerImage"
import type { BannerImageSize } from "@/features/projects/lib/bannerImageState"
import {
  bucketRenderWidth,
  matchesBannerRender,
  type BannerRenderIdentity,
  type BannerRenderKey
} from "@/features/projects/lib/bannerRenderCache"
import { bannerSource } from "@/features/projects/lib/bannerSource"
import { usePageBackdrop } from "@/lib/pageBackdrop"
import { standardEaseCss, transitions } from "@/lib/springs"

import {
  bannerCropStyle,
  bannerFadeMask,
  bannerPreviewChanged,
  type BannerFrameCrop
} from "../lib/bannerFrame"
import { bannerDefaults, bannerPresets } from "../lib/bannerPresets"
import { CachedShaderBanner } from "./CachedShaderBanner"

const devicePixelRatio = () =>
  typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2)

export function ProjectBanner({
  orgSlug,
  slug,
  banner,
  waiting,
  variant = "header",
  pageBackdrop = false
}: Readonly<{
  orgSlug: string
  slug: string
  banner: Banner | null
  waiting?: boolean
  variant?: "header" | "card" | "row"
  pageBackdrop?: boolean
}>) {
  const preview = useAtomValue(
    projectBannerPreview(projectRequest(orgSlug, slug))
  )
  const pageBackdropSlot = usePageBackdrop()
  const backdrop = pageBackdrop ? pageBackdropSlot : null
  const appliedSource = bannerSource(
    orgSlug,
    banner,
    typeof window === "undefined" ? undefined : window.innerWidth
  )
  const appliedCrop = banner?.crop ?? bannerDefaults
  const source = preview ? preview.source : appliedSource
  const crop = preview?.crop ?? appliedCrop
  const editing = preview !== null
  const changed = bannerPreviewChanged(preview, appliedSource, appliedCrop)
  const presetThumb =
    banner?.type === "preset"
      ? (bannerPresets.find((preset) => preset.id === banner.preset)
          ?.thumbSrc ?? null)
      : null
  const placeholder = changed
    ? null
    : (banner?.placeholder ?? presetThumb ?? null)
  const placeholderSize = usePlaceholderSize(placeholder)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [measured, setMeasured] = useState(false)

  const bucketedWidth =
    containerSize.width > 0 ? bucketRenderWidth(containerSize.width) : 0
  const pixelRatio = devicePixelRatio()

  const identity = useMemo<BannerRenderIdentity | null>(
    () =>
      source === null || changed
        ? null
        : {
            project: projectKey(orgSlug, slug),
            source,
            variant,
            crop: { x: crop.x, y: crop.y, zoom: crop.zoom },
            pixelRatio
          },
    [
      source,
      changed,
      orgSlug,
      slug,
      variant,
      crop.x,
      crop.y,
      crop.zoom,
      pixelRatio
    ]
  )

  const cacheKey = useMemo<BannerRenderKey | null>(
    () =>
      identity && bucketedWidth > 0 && containerSize.height > 0
        ? { ...identity, width: bucketedWidth, height: containerSize.height }
        : null,
    [identity, bucketedWidth, containerSize.height]
  )

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      setContainerSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height }
      )
    })
    observer.observe(node)
    observerRef.current = observer
    const width = Math.round(node.clientWidth)
    const height = Math.round(node.clientHeight)
    if (width > 0 && height > 0) setContainerSize({ width, height })
    setMeasured(true)
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  if (!source) return null

  const node = (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`pointer-events-none absolute overflow-hidden rounded-t-[inherit] ${backdrop ? "inset-x-0 top-0" : variant === "header" ? "-inset-x-6 -top-6 -z-10" : "inset-x-0 top-0 -z-10"} ${waiting ? "animate-pulse" : ""}`}
      style={{
        height: Match.value(variant).pipe(
          Match.when("header", () => bannerDefaults.height),
          Match.when("card", () => 120),
          Match.orElse(() => "100%")
        ),
        opacity: bannerDefaults.overallOpacity
      }}
    >
      <BannerLayers
        key={`${orgSlug}/${slug}/${source}/${variant}`}
        source={source}
        identity={identity}
        cacheKey={cacheKey}
        crop={crop}
        variant={variant}
        placeholder={placeholder}
        placeholderSize={placeholderSize}
        containerSize={containerSize}
        measured={measured}
        editing={editing}
      />
    </div>
  )

  return backdrop
    ? createPortal(
        <div
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{ height: bannerDefaults.height }}
        >
          {node}
        </div>,
        backdrop
      )
    : node
}

function BannerLayers({
  source,
  identity,
  cacheKey,
  crop,
  variant,
  placeholder,
  placeholderSize,
  containerSize,
  measured,
  editing
}: Readonly<{
  source: string
  identity: BannerRenderIdentity | null
  cacheKey: BannerRenderKey | null
  crop: BannerFrameCrop
  variant: "header" | "card" | "row"
  placeholder: string | null
  placeholderSize: BannerImageSize | null
  containerSize: BannerImageSize
  measured: boolean
  editing: boolean
}>) {
  const reduceMotion = useReducedMotion() ?? false
  const image = useBannerImage(source, cacheKey, {
    identity,
    measured,
    editing
  })
  const { painted, shaderImage, cachedRender } = image
  const [revealComplete, setRevealComplete] = useState(image.initiallyReady)

  const showingPreview =
    painted &&
    (editing ||
      (cachedRender !== null &&
        identity !== null &&
        !matchesBannerRender(cachedRender, identity)))
  const settled = showingPreview ? null : cachedRender
  const ready = settled !== null || painted
  const revealed = revealComplete || (reduceMotion && ready)
  const renderShader =
    shaderImage !== null &&
    (settled === null || editing || image.lookup === "miss")
  const settings = useMemo(
    () => ({ ...bannerDefaults, x: crop.x, y: crop.y, zoom: crop.zoom }),
    [crop.x, crop.y, crop.zoom]
  )
  const blurRadius = Match.value(variant).pipe(
    Match.when("header", () => 12),
    Match.when("card", () => 6),
    Match.orElse(() => 3)
  )
  const cropStyle = placeholderSize
    ? bannerCropStyle(
        placeholderSize.width,
        placeholderSize.height,
        containerSize.width,
        containerSize.height,
        crop
      )
    : undefined
  const fadeMask = bannerFadeMask(settings.fade)
  const transition =
    reduceMotion || revealed
      ? "none"
      : `opacity ${transitions.fade.duration}s ${standardEaseCss}`
  const mixBlendMode = revealed ? "normal" : "plus-lighter"

  return (
    <div className="absolute inset-0 isolate">
      {!revealed && placeholder && cropStyle && !image.placeholderFailed && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            maskImage: fadeMask,
            WebkitMaskImage: fadeMask,
            mixBlendMode,
            opacity: ready ? 0 : 1,
            transition
          }}
        >
          <img
            src={placeholder}
            alt=""
            onError={image.onPlaceholderFailed}
            className="absolute"
            style={{
              ...cropStyle,
              filter: `blur(${blurRadius}px) grayscale(${1 - settings.color})`
            }}
          />
        </div>
      )}
      <div
        className="absolute inset-0 size-full"
        style={{ mixBlendMode, opacity: ready ? 1 : 0, transition }}
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.propertyName === "opacity" &&
            ready
          )
            setRevealComplete(true)
        }}
      >
        {settled !== null && (
          <img
            src={settled}
            alt=""
            className="absolute inset-0 block size-full object-cover"
          />
        )}
        {renderShader && (
          <div
            className="absolute inset-0 size-full"
            style={{ opacity: settled === null ? 1 : 0 }}
          >
            <CachedShaderBanner
              image={shaderImage}
              settings={settings}
              cacheKey={cacheKey}
              live={editing}
              onFirstRender={image.onPainted}
              onRenderStarted={image.onRenderStarted}
              onRenderReady={image.onRenderReady}
            />
          </div>
        )}
      </div>
    </div>
  )
}
