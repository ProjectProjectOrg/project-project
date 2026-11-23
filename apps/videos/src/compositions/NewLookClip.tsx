import { useCurrentFrame } from "remotion"

import { AppWindow } from "../parts/app-window"
import { Stage, type ClipProps } from "../parts/clip"
import { ease, glide, mix } from "../parts/motion"

/*
 * The new look, 6 seconds: the app itself (parts/app-window), built from
 * the design system's own components.
 *
 *   0.0  the window rises in
 *   0.4  the rail, the panel and the list's rows arrive one after another
 *   2.2  the list's hover glides down three rows
 *   3.9  the row under it is ticked
 *   4.4  at rest
 */

export const NEW_LOOK_FRAMES = 180

// Beats, in frames.
const HOVER = 66
const HOVER_STEP = 16
const TICK = 118

export function NewLookClip({ theme }: ClipProps) {
  const frame = useCurrentFrame()
  const enter = ease(frame, 0, 22)
  // The hover lands on the first row, then glides to the second and third.
  const hover = {
    shown: ease(frame, HOVER, HOVER + 6),
    row:
      glide(frame, HOVER + HOVER_STEP, HOVER + HOVER_STEP + 12) +
      glide(frame, HOVER + HOVER_STEP * 2, HOVER + HOVER_STEP * 2 + 12)
  }
  return (
    <Stage theme={theme}>
      <AppWindow
        frame={frame}
        hover={hover}
        ticked={frame >= TICK ? 2 : undefined}
        style={{
          opacity: enter,
          translate: `0 ${mix(enter, 14, 0)}px`,
          scale: mix(enter, 0.985, 1)
        }}
      />
    </Stage>
  )
}
