import { LoaderCircle, Play } from "lucide-react"
import { motion } from "motion/react"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { nextPlaybackRate } from "@/features/editor/lib/videoTime"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  AttachmentVideoControls,
  type AttachmentVideoActions
} from "./AttachmentVideoControls"

const MAX_HEIGHT = 384
const IDLE_MS = 2000
const LIFT = "0 1px 3px oklch(0 0 0 / 18%), 0 0 0 1px oklch(0 0 0 / 6%)"

const knownAspects = new Map<string, number>()

const REVEAL = "transition-[opacity] duration-150 ease-out"
const SHOWN = "opacity-100"

const audibleVolume = (video: HTMLVideoElement): number =>
  video.muted ? 0 : video.volume

function useIdle() {
  const timer = useRef<number | null>(null)
  const [active, setActive] = useState(false)

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }, [])

  const poke = useCallback(() => {
    setActive(true)
    clear()
    timer.current = window.setTimeout(() => setActive(false), IDLE_MS)
  }, [clear])

  const rest = useCallback(() => {
    clear()
    setActive(false)
  }, [clear])

  useEffect(() => clear, [clear])

  return { active, poke, rest }
}

export function AttachmentVideo({
  src,
  filename,
  downloadHref,
  onUnplayable
}: Readonly<{
  src: string
  filename: string
  downloadHref: string
  onUnplayable: () => void
}>) {
  const layoutId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const { active, poke, rest } = useIdle()

  const [aspect, setAspect] = useState(() => knownAspects.get(src) ?? null)
  const [duration, setDuration] = useState(Number.NaN)
  const [time, setTime] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [volume, setVolume] = useState(1)
  const [rate, setRate] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [started, setStarted] = useState(false)
  const [keyboardFocus, setKeyboardFocus] = useState(false)

  const actions = useMemo<AttachmentVideoActions>(
    () => ({
      toggle: () => {
        const video = videoRef.current
        if (video === null) return
        if (video.paused) void video.play().catch(() => undefined)
        else video.pause()
      },
      seekTo: (seconds) => {
        const video = videoRef.current
        if (video === null || !Number.isFinite(video.duration)) return
        video.currentTime = Math.min(Math.max(seconds, 0), video.duration)
        setTime(video.currentTime)
      },
      setVolume: (next) => {
        const video = videoRef.current
        if (video === null) return
        video.volume = Math.min(Math.max(next, 0), 1)
        video.muted = video.volume === 0
      },
      toggleMuted: () => {
        const video = videoRef.current
        if (video === null) return
        if (audibleVolume(video) > 0) {
          video.muted = true
          return
        }
        video.muted = false
        if (video.volume === 0) video.volume = 1
      },
      cycleRate: () => {
        const video = videoRef.current
        if (video !== null)
          video.playbackRate = nextPlaybackRate(video.playbackRate)
      },
      toggleFullscreen: () => {
        const root = rootRef.current
        if (root === null) return
        if (document.fullscreenElement === root) void document.exitFullscreen()
        else void root.requestFullscreen().catch(() => undefined)
      }
    }),
    []
  )

  useEffect(() => {
    const onChange = () =>
      setFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  useEffect(() => {
    if (!playing) return undefined
    let frame = requestAnimationFrame(function tick() {
      const video = videoRef.current
      if (video !== null) setTime(video.currentTime)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing])

  useEffect(() => {
    const root = rootRef.current
    if (root === null) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === "m") actions.toggleMuted()
      else if (key === "f") actions.toggleFullscreen()
      else if (key === "k") actions.toggle()
      else return
      event.preventDefault()
      poke()
    }
    root.addEventListener("keydown", onKeyDown)
    return () => root.removeEventListener("keydown", onKeyDown)
  }, [actions, poke])

  const controlsShown =
    started && (active || keyboardFocus || (hovered && !playing))

  return (
    <span
      ref={rootRef}
      className={cn(
        "relative block max-w-full overflow-hidden bg-[oklch(0.145_0_0)]",
        fullscreen
          ? "rounded-none"
          : "rounded-lg [clip-path:inset(0_round_var(--radius-lg))]",
        playing && !controlsShown && "cursor-none"
      )}
      style={
        fullscreen
          ? undefined
          : aspect === null
            ? { width: 0, height: 0 }
            : { aspectRatio: aspect, width: Math.round(MAX_HEIGHT * aspect) }
      }
      onPointerEnter={() => setHovered(true)}
      onPointerMove={poke}
      onPointerLeave={() => {
        setHovered(false)
        rest()
      }}
      onFocus={(event) => {
        setKeyboardFocus(event.target.matches(":focus-visible"))
        poke()
      }}
      onBlur={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setKeyboardFocus(false)
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        playsInline
        className="block size-full cursor-pointer object-contain"
        onClick={actions.toggle}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          setDuration(video.duration)
          if (video.videoWidth === 0 || video.videoHeight === 0) {
            onUnplayable()
            return
          }
          const measured = video.videoWidth / video.videoHeight
          knownAspects.set(src, measured)
          setAspect(measured)
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onProgress={(event) => {
          const video = event.currentTarget
          const ranges = video.buffered
          if (ranges.length === 0 || !Number.isFinite(video.duration)) return
          setBuffered(ranges.end(ranges.length - 1) / video.duration)
        }}
        onPlay={() => {
          setPlaying(true)
          setStarted(true)
          poke()
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onVolumeChange={(event) =>
          setVolume(audibleVolume(event.currentTarget))
        }
        onRateChange={(event) => setRate(event.currentTarget.playbackRate)}
        onError={onUnplayable}
      />

      {waiting && playing ? (
        <LoaderCircle
          aria-hidden="true"
          strokeWidth={1.75}
          className="pointer-events-none absolute inset-0 m-auto size-8 animate-spin text-[oklch(0.985_0_0)] motion-reduce:animate-none"
        />
      ) : null}

      {playing ? null : (
        <Button
          variant="raised"
          size="icon-lg"
          aria-label={m.editor_video_play()}
          className="absolute inset-0 m-auto size-12"
          style={{ boxShadow: LIFT }}
          onClick={actions.toggle}
        >
          <Play className="translate-x-px fill-current" strokeWidth={2.5} />
        </Button>
      )}

      {started ? (
        <span
          data-attachment-player="true"
          className={cn(
            "absolute inset-x-0 bottom-0 isolate flex flex-col px-2 pb-1.5 text-foreground",
            REVEAL,
            controlsShown ? SHOWN : "pointer-events-none opacity-0"
          )}
        >
          <motion.span
            layoutId={`${layoutId}-surface`}
            transition={transitions.morph}
            style={{ borderRadius: 0, boxShadow: LIFT }}
            className="absolute inset-0 -z-10 bg-surface-5"
          />
          <AttachmentVideoControls
            filename={filename}
            filenameLayoutId={`${layoutId}-filename`}
            downloadHref={downloadHref}
            state={{
              playing,
              time,
              duration,
              buffered,
              volume,
              rate,
              fullscreen
            }}
            actions={actions}
          />
        </span>
      ) : aspect === null ? null : (
        <span className="pointer-events-none absolute bottom-3 left-1/2 isolate flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 px-2.5 py-1 text-foreground">
          <motion.span
            layoutId={`${layoutId}-surface`}
            transition={transitions.morph}
            style={{ borderRadius: 20, boxShadow: LIFT }}
            className="absolute inset-0 -z-10 bg-surface-5"
          />
          <motion.span
            layoutId={`${layoutId}-filename`}
            layout="position"
            transition={transitions.morph}
            className="truncate font-mono text-micro"
          >
            {filename}
          </motion.span>
        </span>
      )}
    </span>
  )
}
