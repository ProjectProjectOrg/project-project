import {
  Download,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX
} from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { formatVideoTime, videoProgress } from "@/features/editor/lib/videoTime"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

import { AttachmentVideoScrubber } from "./AttachmentVideoScrubber"

const FADE_START_MS =
  (transitions.morph.duration - transitions.fade.duration) * 1000

const HIDDEN = { opacity: 0 } as const
const SHOWN = { opacity: 1 } as const

const SEEK_STEP_SECONDS = 5
const VOLUME_STEP = 0.1

export type AttachmentVideoState = Readonly<{
  playing: boolean
  time: number
  duration: number
  buffered: number
  volume: number
  rate: number
  fullscreen: boolean
}>

export type AttachmentVideoActions = Readonly<{
  toggle: () => void
  seekTo: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMuted: () => void
  cycleRate: () => void
  toggleFullscreen: () => void
}>

export function AttachmentVideoControls({
  filename,
  filenameLayoutId,
  downloadHref,
  state,
  actions
}: Readonly<{
  filename: string
  filenameLayoutId: string
  downloadHref: string
  state: AttachmentVideoState
  actions: AttachmentVideoActions
}>) {
  const { playing, time, duration, volume, fullscreen } = state
  const known = Number.isFinite(duration)
  const silent = volume === 0
  const [morphed, setMorphed] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setMorphed(true), FADE_START_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <>
      <motion.span
        initial={false}
        animate={morphed ? SHOWN : HIDDEN}
        transition={transitions.fade}
        className="block"
      >
        <AttachmentVideoScrubber
          className="mx-1.5 -mb-1.5"
          value={videoProgress(time, duration)}
          buffered={state.buffered}
          label={m.editor_video_seek()}
          valueText={formatVideoTime(time)}
          hoverText={(fraction) =>
            formatVideoTime(known ? fraction * duration : 0)
          }
          onChange={(fraction) => {
            if (known) actions.seekTo(fraction * duration)
          }}
          onStep={(direction) =>
            actions.seekTo(time + direction * SEEK_STEP_SECONDS)
          }
        />
      </motion.span>
      <span className="flex items-center gap-0.5">
        <motion.span
          initial={false}
          animate={morphed ? SHOWN : HIDDEN}
          transition={transitions.fade}
          className="flex items-center gap-0.5"
        >
          <Button
            variant="media"
            size="square-7"
            aria-label={
              playing ? m.editor_video_pause() : m.editor_video_play()
            }
            onClick={actions.toggle}
          >
            {playing ? (
              <Pause className="size-4 fill-current" strokeWidth={1.25} />
            ) : (
              <Play className="size-4 fill-current" strokeWidth={1.25} />
            )}
          </Button>
          <span className="px-1.5 text-xs whitespace-nowrap tabular-nums">
            {formatVideoTime(time)}{" "}
            <span className="opacity-60">/ {formatVideoTime(duration)}</span>
          </span>
        </motion.span>
        <span className="flex min-w-0 flex-1 px-2" title={filename}>
          <motion.span
            layoutId={filenameLayoutId}
            layout="position"
            transition={transitions.morph}
            className="truncate font-mono text-[11px]"
          >
            {filename}
          </motion.span>
        </span>
        <motion.span
          initial={false}
          animate={morphed ? SHOWN : HIDDEN}
          transition={transitions.fade}
          className="flex items-center gap-0.5"
        >
          <Button
            variant="media"
            size="sm"
            className="px-2 tabular-nums"
            aria-label={m.editor_video_speed({ rate: state.rate })}
            onClick={actions.cycleRate}
          >
            {state.rate}×
          </Button>
          <span className="group/volume flex items-center">
            <Button
              variant="media"
              size="square-7"
              aria-label={
                silent ? m.editor_video_unmute() : m.editor_video_mute()
              }
              onClick={actions.toggleMuted}
            >
              {silent ? (
                <VolumeX className="size-4" strokeWidth={1.75} />
              ) : (
                <Volume2 className="size-4" strokeWidth={1.75} />
              )}
            </Button>
            <AttachmentVideoScrubber
              className="h-3.5 w-0 opacity-0 transition-all duration-150 group-focus-within/volume:mr-2 group-focus-within/volume:ml-1 group-focus-within/volume:w-14 group-focus-within/volume:opacity-100 group-hover/volume:mr-2 group-hover/volume:ml-1 group-hover/volume:w-14 group-hover/volume:opacity-100"
              value={volume}
              label={m.editor_video_volume()}
              valueText={`${Math.round(volume * 100)}%`}
              onChange={actions.setVolume}
              onStep={(direction) =>
                actions.setVolume(volume + direction * VOLUME_STEP)
              }
            />
          </span>
          <Button
            variant="media"
            size="square-7"
            aria-label={
              fullscreen
                ? m.editor_video_exit_fullscreen()
                : m.editor_video_fullscreen()
            }
            onClick={actions.toggleFullscreen}
          >
            {fullscreen ? (
              <Minimize className="size-4" strokeWidth={1.75} />
            ) : (
              <Maximize className="size-4" strokeWidth={1.75} />
            )}
          </Button>
          <Button
            variant="media"
            size="square-7"
            aria-label={m.editor_attachment_download()}
            render={
              <a
                href={downloadHref}
                download={filename}
                aria-label={m.editor_attachment_download()}
              />
            }
          >
            <Download className="size-4" strokeWidth={1.75} />
          </Button>
        </motion.span>
      </span>
    </>
  )
}
