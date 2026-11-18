import { motion } from "motion/react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { nextPlaybackRate } from "../lib/videoTime"
import {
  AttachmentVideoControls,
  type AttachmentVideoActions,
  type AttachmentVideoLabels
} from "./attachment-video-controls"
import { Button } from "./button"
import { LoaderCircle, Play } from "./icons"

/*
 * AttachmentVideo: a video attachment, played in place. Before it plays,
 * a play button and the filename on a pill; once it starts, the pill opens
 * into the control bar (seek, time, speed, volume, fullscreen, download),
 * which hides after 2s still and shows again on movement or focus. K plays
 * or pauses, M mutes, F goes fullscreen.
 */

export type { AttachmentVideoLabels } from "./attachment-video-controls"

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

// What the controls do, on the <video> and its frame.
function useVideoActions(
  rootRef: RefObject<HTMLSpanElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
  setTime: (seconds: number) => void
): AttachmentVideoActions {
  return useMemo<AttachmentVideoActions>(
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
    [rootRef, videoRef, setTime]
  )
}

// Whether the frame is the fullscreen element.
function useFullscreen(rootRef: RefObject<HTMLSpanElement | null>) {
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () =>
      setFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [rootRef])
  return fullscreen
}

// K plays or pauses, M mutes, F goes fullscreen, while focus is inside.
function useVideoKeys(
  rootRef: RefObject<HTMLSpanElement | null>,
  actions: AttachmentVideoActions,
  poke: () => void
) {
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
  }, [rootRef, actions, poke])
}

export function AttachmentVideo({
  src,
  filename,
  downloadHref,
  labels,
  onUnplayable
}: Readonly<{
  src: string
  filename: string
  downloadHref: string
  labels: AttachmentVideoLabels
  // The browser can't play it (no video track, unsupported codec): show
  // the file's tile instead.
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
  const [hovered, setHovered] = useState(false)
  const [started, setStarted] = useState(false)
  const [keyboardFocus, setKeyboardFocus] = useState(false)

  const actions = useVideoActions(rootRef, videoRef, setTime)
  const fullscreen = useFullscreen(rootRef)

  useEffect(() => {
    if (!playing) return undefined
    let frame = requestAnimationFrame(function tick() {
      const video = videoRef.current
      if (video !== null) setTime(video.currentTime)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing])

  useVideoKeys(rootRef, actions, poke)

  const controlsShown =
    started && (active || keyboardFocus || (hovered && !playing))

  return (
    <span
      ref={rootRef}
      className={cn(
        "relative block max-w-full overflow-hidden bg-[oklch(0.145_0_0)]",
        // The attachments' 18px squircle (overflow clips to the corner
        // shape, so the video's corners follow it).
        fullscreen ? "rounded-none" : "rounded-[18px] corner-squircle",
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
          variant="overlay"
          size="icon-lg"
          aria-label={labels.play}
          className="absolute inset-0 m-auto size-12 text-foreground"
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
            // A floating bar, 8px in from the frame's edges.
            "absolute inset-x-2 bottom-2 isolate flex flex-col px-1.5 pb-1 text-foreground",
            REVEAL,
            controlsShown ? SHOWN : "pointer-events-none opacity-0"
          )}
        >
          <motion.span
            layoutId={`${layoutId}-surface`}
            transition={transitions.morph}
            style={{ borderRadius: 16, boxShadow: LIFT }}
            className="absolute inset-0 -z-10 bg-surface-5 corner-squircle"
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
            labels={labels}
          />
        </span>
      ) : aspect === null ? null : (
        <span className="pointer-events-none absolute bottom-3 left-1/2 isolate flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 px-2.5 py-1 text-foreground">
          <motion.span
            layoutId={`${layoutId}-surface`}
            transition={transitions.morph}
            style={{ borderRadius: 20, boxShadow: LIFT }}
            className="absolute inset-0 -z-10 bg-surface-5 corner-squircle"
          />
          <motion.span
            layoutId={`${layoutId}-filename`}
            layout="position"
            transition={transitions.morph}
            className="truncate text-micro tabular-nums"
          >
            {filename}
          </motion.span>
        </span>
      )}
    </span>
  )
}
