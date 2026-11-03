import * as Console from "effect/Console"
import * as Effect from "effect/Effect"

import { markWith } from "./mark"
import { type Terminal, visibleWidth } from "./terminal"

const indent = (lines: ReadonlyArray<string>) =>
  lines.map((line) => (line === "" ? "" : `  ${line}`))

export const markBeside = (
  right: ReadonlyArray<string>,
  terminal: Terminal,
  progress = 1
) => indent(markWith(right, terminal, progress))

const write = (text: string) =>
  Effect.sync(() => {
    process.stdout.write(text)
  })

export const animate = (
  draw: (progress: number) => ReadonlyArray<string>,
  terminal: Terminal,
  frames = 26
) => {
  const lines = draw(1)
  const height = lines.length
  const fits =
    height < (process.stdout.rows ?? 0) &&
    lines.every((line) => visibleWidth(line) < (process.stdout.columns ?? 0))
  if (!terminal.fancy || !fits) {
    return Console.log(lines.join("\n"))
  }
  const frame = (index: number) =>
    write(
      `${index === 0 ? "" : `\r\x1b[${height - 1}A`}${draw(index / frames)
        .map((line) => `\x1b[2K${line}`)
        .join("\n")}`
    )
  return Effect.forEach(
    Array.from({ length: frames + 1 }, (_, index) => index),
    (index) =>
      index === 0
        ? frame(index)
        : Effect.andThen(Effect.sleep("40 millis"), frame(index)),
    { discard: true }
  ).pipe(Effect.ensuring(write("\n\x1b[?25h")), (animation) =>
    Effect.andThen(
      write(`\x1b[?25l${"\n".repeat(height - 1)}\r\x1b[${height - 1}A`),
      animation
    )
  )
}

export const reveal = (right: ReadonlyArray<string>, terminal: Terminal) =>
  animate((progress) => markBeside(right, terminal, progress), terminal)
