import * as Effect from "effect/Effect"

import { dither, paintShades } from "./dither"
import { muted, stderrTerminal, type Terminal, visibleWidth } from "./terminal"

const WIDTH = 14

export const loadingFrame = (frame: number, terminal: Terminal) =>
  paintShades(
    dither({ width: WIDTH, height: 1 }, (x) =>
      Math.max(0, Math.sin((x - frame * 0.5) / 2.4))
    )[0] ?? "",
    terminal
  )

const write = (text: string) =>
  Effect.sync(() => {
    process.stderr.write(text)
  })

const animate = (label: string, terminal: Terminal) =>
  Effect.gen(function* () {
    for (let frame = 0; ; frame++) {
      yield* write(
        `\r\x1b[?25l${loadingFrame(frame, terminal)}  ${muted(label, terminal)}`
      )
      yield* Effect.sleep("70 millis")
    }
  })

export const withLoading =
  (label: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) => {
    const terminal = stderrTerminal()
    if (
      !terminal.fancy ||
      visibleWidth(label) + WIDTH + 2 >= (process.stderr.columns ?? 0)
    ) {
      return effect
    }
    return Effect.scoped(
      Effect.andThen(Effect.forkScoped(animate(label, terminal)), effect)
    ).pipe(Effect.ensuring(write("\r\x1b[2K\x1b[?25h")))
  }
