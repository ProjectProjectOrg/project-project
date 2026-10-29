import { ToolCli, Tools } from "@pp/shared"
import * as Context from "effect/Context"
import * as Option from "effect/Option"

const commandsByTool = Object.values(Tools.tools).flatMap((tool) =>
  Option.match(Context.getOption(tool.annotations, ToolCli), {
    onNone: () => [],
    onSome: (cli) => [[tool.name, `pp ${cli.command.join(" ")}`] as const]
  })
)

export const terminalText = (message: string) =>
  commandsByTool.reduce(
    (text, [name, command]) =>
      text.replace(
        new RegExp(`(?<!['"\`])\\b${name}\\b(?!['"\`])`, "g"),
        `\`${command}\``
      ),
    message
  )
