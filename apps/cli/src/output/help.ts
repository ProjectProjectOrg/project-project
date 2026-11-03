import { CliOutput, type HelpDoc } from "effect/cli"
import * as Option from "effect/Option"

import {
  muted,
  padVisible,
  strong,
  type Terminal,
  visibleWidth,
  wrap
} from "./terminal"

type Row = Readonly<{ left: string; right: string }>

const INDENT = "  "
const GAP = 3
const MAX_LEFT = 26
const MAX_WIDTH = 100

const cyan = (text: string, terminal: Terminal) =>
  terminal.color && text !== "" ? `\x1b[36m${text}\x1b[39m` : text

const green = (text: string, terminal: Terminal) =>
  terminal.color && text !== "" ? `\x1b[32m${text}\x1b[39m` : text

const withCode = (text: string, terminal: Terminal) =>
  terminal.color
    ? text.replace(/`([^`]+)`/g, (_, code: string) =>
        code
          .split(" ")
          .map((word) => cyan(word, terminal))
          .join(" ")
      )
    : text

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter((paragraph) => paragraph !== "")

const block = (text: string, width: number, terminal: Terminal) =>
  paragraphs(text)
    .map((paragraph) =>
      wrap(withCode(paragraph, terminal), width - INDENT.length)
        .map((line) => `${INDENT}${line}`)
        .join("\n")
    )
    .join("\n\n")

const summary = (text: string) => {
  const first = paragraphs(text)[0] ?? ""
  const sentence = /^.*?[.!?](?=\s+[A-Z`]|$)/.exec(first)
  return sentence === null ? first : sentence[0]
}

const truncated = (text: string, width: number) => {
  if (visibleWidth(text) <= width) return text
  const words = text.split(" ")
  let kept = ""
  for (const word of words) {
    const next = kept === "" ? word : `${kept} ${word}`
    if (visibleWidth(`${next} …`) > width) break
    kept = next
  }
  return `${kept.replace(/[,;:.]$/, "")}…`
}

const table = (
  rows: ReadonlyArray<Row>,
  width: number,
  terminal: Terminal,
  oneLine = false
) => {
  const left = Math.min(
    MAX_LEFT,
    Math.max(0, ...rows.map((row) => visibleWidth(row.left)))
  )
  const column = INDENT.length + left + GAP
  const right = Math.max(20, width - column)
  return rows
    .flatMap((row) => {
      const text = oneLine
        ? [truncated(withCode(row.right, terminal), right)]
        : wrap(withCode(row.right, terminal), right)
      const lines = text.map((line) => `${" ".repeat(column)}${line}`)
      if (visibleWidth(row.left) > left) {
        return [`${INDENT}${row.left}`, ...lines]
      }
      const [head = "", ...rest] = lines
      return [
        `${INDENT}${padVisible(row.left, left + GAP)}${head.trimStart()}`.trimEnd(),
        ...rest
      ]
    })
    .join("\n")
}

const flagName = (flag: HelpDoc.FlagDoc, terminal: Terminal) => {
  const names = [`--${flag.name}`, ...flag.aliases]
    .map((name) => green(name, terminal))
    .join(", ")
  if (flag.type === "boolean") return names
  const type = flag.type.includes("|") ? "choice" : flag.type
  return `${names} ${muted(`<${type}>`, terminal)}`
}

const flagRows = (
  flags: ReadonlyArray<HelpDoc.FlagDoc>,
  terminal: Terminal
): ReadonlyArray<Row> =>
  flags.map((flag) => ({
    left: flagName(flag, terminal),
    right: Option.getOrElse(flag.description, () => "")
  }))

const isRootPage = (doc: HelpDoc.HelpDoc) => !/^\S+ [a-z]/.test(doc.usage)

const renderHelp = (
  doc: HelpDoc.HelpDoc,
  terminal: Terminal,
  columns: number,
  shared: ReadonlyArray<string>
) => {
  const width = Math.min(MAX_WIDTH, Math.max(40, columns))
  const heading = (title: string) => strong(title, terminal)
  const sections: Array<string> = []
  const root = isRootPage(doc)
  const own = doc.flags.filter((flag) => !shared.includes(flag.name))
  const common = [
    ...doc.flags.filter((flag) => shared.includes(flag.name)),
    ...(doc.globalFlags ?? [])
  ]

  if (doc.description !== "") {
    sections.push(block(doc.description, width, terminal))
  }
  sections.push(
    `${heading("USAGE")}\n${INDENT}${cyan(doc.usage.replace("<subcommand>", "<command>"), terminal)}`
  )

  for (const group of doc.subcommands ?? []) {
    sections.push(
      `${heading(group.group === undefined ? "COMMANDS" : group.group.toUpperCase())}\n${table(
        group.commands.map((command) => ({
          left: cyan(command.name, terminal),
          right: command.shortDescription ?? summary(command.description)
        })),
        width,
        terminal,
        true
      )}`
    )
  }

  if (doc.args !== undefined && doc.args.length > 0) {
    sections.push(
      `${heading("ARGUMENTS")}\n${table(
        doc.args.map((arg) => ({
          left: green(`<${arg.name}${arg.variadic ? "..." : ""}>`, terminal),
          right: `${Option.getOrElse(arg.description, () => "")}${arg.required ? "" : " (optional)"}`
        })),
        width,
        terminal
      )}`
    )
  }

  if (own.length > 0) {
    sections.push(
      `${heading("FLAGS")}\n${table(flagRows(own, terminal), width, terminal)}`
    )
  }

  if (doc.examples !== undefined && doc.examples.length > 0) {
    sections.push(
      `${heading("EXAMPLES")}\n${doc.examples
        .map((example) =>
          [
            ...(example.description === undefined
              ? []
              : [`${INDENT}${muted(`# ${example.description}`, terminal)}`]),
            `${INDENT}${cyan(example.command, terminal)}`
          ].join("\n")
        )
        .join("\n\n")}`
    )
  }

  if (common.length > 0) {
    sections.push(
      root
        ? `${heading("GLOBAL FLAGS")}\n${table(flagRows(common, terminal), width, terminal)}`
        : `${heading("GLOBAL FLAGS")}\n${block(
            `${common.map((flag) => `--${flag.name}`).join(", ")}. Run \`pp --help\` for what they do.`,
            width,
            terminal
          )}`
    )
  }

  const path = /^(.*?) <subcommand>/.exec(doc.usage)?.[1]
  if (path !== undefined && (doc.subcommands ?? []).length > 0) {
    sections.push(
      `${heading("LEARN MORE")}\n${block(
        `Run \`${path} <command> --help\` for more about a command.`,
        width,
        terminal
      )}`
    )
  }

  return `${sections.join("\n\n")}\n`
}

export const helpFormatter = (
  terminal: Terminal,
  columns: number,
  shared: ReadonlyArray<string>
): CliOutput.Formatter => {
  const fallback = CliOutput.defaultFormatter({ colors: terminal.color })
  return {
    formatHelpDoc: (doc) => renderHelp(doc, terminal, columns, shared),
    formatCliError: fallback.formatCliError,
    formatError: fallback.formatError,
    formatErrors: fallback.formatErrors,
    formatVersion: fallback.formatVersion
  }
}
