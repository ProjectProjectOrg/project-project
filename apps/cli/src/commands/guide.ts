import { agentGuide } from "@pp/shared"
import { Command } from "effect/cli"
import * as Console from "effect/Console"

import { quotedCommandText } from "../output/terminalText"

const overview =
  `${agentGuide.product} \`pp\` runs the same tools as the ` +
  "ProjectProject MCP server.\n\n" +
  "Commands use the org and project shown by `pp status`. To work " +
  "elsewhere, pass `--org` and `--project`; find slugs with `pp me`, " +
  "`pp orgs list` and `pp projects list` rather than guessing. Add " +
  "`--json` for machine-readable output, and run `pp <command> --help` " +
  "for a command's flags. Text flags take `@file` or `@-` to read " +
  "standard input."

const attachments =
  "Attachments: `pp tickets attach <id> <file>` uploads a file and adds " +
  "it to the end of the ticket's description in one step."

export const guideText = [
  overview,
  ...[
    agentGuide.statuses,
    agentGuide.workingOnTicket,
    agentGuide.refining,
    agentGuide.writing,
    agentGuide.blocks,
    agentGuide.blockExample,
    agentGuide.blockRules
  ].map(quotedCommandText),
  attachments
].join("\n\n")

export const guideCommand = Command.make("guide", {}, () =>
  Console.log(guideText)
).pipe(
  Command.withDescription(
    "How to work with ProjectProject through pp: the guidance agents get over MCP, with pp commands."
  )
)
