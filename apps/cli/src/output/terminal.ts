import { stripVTControlCharacters } from "node:util"

export type Terminal = Readonly<{ fancy: boolean; color: boolean }>

type Env = Readonly<Record<string, string | undefined>>

const isSet = (value: string | undefined) =>
  value !== undefined && value !== "" && value !== "0"

export const plain: Terminal = { fancy: false, color: false }

export const terminalFor = (
  stream: Readonly<{ isTTY?: boolean }>,
  env: Env = process.env
): Terminal => {
  const fancy = stream.isTTY === true && env.TERM !== "dumb"
  return {
    fancy,
    color: isSet(env.FORCE_COLOR) || (fancy && !isSet(env.NO_COLOR))
  }
}

export const stdoutTerminal = () => terminalFor(process.stdout)
export const stderrTerminal = () => terminalFor(process.stderr)

export const muted = (text: string, terminal: Terminal) =>
  terminal.color && text !== "" ? `\x1b[90m${text}\x1b[39m` : text

export const strong = (text: string, terminal: Terminal) =>
  terminal.color && text !== "" ? `\x1b[1m${text}\x1b[22m` : text

export const visibleWidth = (text: string) =>
  stripVTControlCharacters(text).length

export const padVisible = (text: string, width: number) =>
  text + " ".repeat(Math.max(0, width - visibleWidth(text)))

export const wrap = (line: string, width: number): ReadonlyArray<string> =>
  line.split(" ").reduce<Array<string>>((lines, word) => {
    const last = lines.at(-1)
    if (last !== undefined && visibleWidth(`${last} ${word}`) <= width) {
      lines[lines.length - 1] = `${last} ${word}`
    } else {
      lines.push(word)
    }
    return lines
  }, [])

export const beside = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
  gap = 3
) => {
  const width = Math.max(0, ...left.map(visibleWidth))
  const offset = Math.max(0, Math.floor((left.length - right.length) / 2))
  const rows = Math.max(left.length, right.length + offset)
  return Array.from({ length: rows }, (_, index) =>
    `${padVisible(left[index] ?? "", width + gap)}${right[index - offset] ?? ""}`.trimEnd()
  )
}
