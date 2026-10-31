import {
  muted,
  padVisible,
  type Terminal,
  visibleWidth,
  wrap
} from "./terminal"

const MAX_WIDTH = 76

export const framed = (
  title: string,
  lines: ReadonlyArray<string>,
  terminal: Terminal
) => {
  const body = lines.flatMap((line) => wrap(line, MAX_WIDTH - 4))
  const width = Math.max(visibleWidth(title) + 3, ...body.map(visibleWidth))
  const edge = (text: string) => muted(text, terminal)
  return [
    edge(`╭─ ${title} ${"─".repeat(width - visibleWidth(title) - 1)}╮`),
    ...body.map(
      (line) => `${edge("│")} ${padVisible(line, width)} ${edge("│")}`
    ),
    edge(`╰${"─".repeat(width + 2)}╯`)
  ].join("\n")
}
