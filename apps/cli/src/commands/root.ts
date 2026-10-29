import { Command, Flag } from "effect/cli"
import * as Config from "effect/Config"

export const root = Command.make("pp").pipe(
  Command.withSharedFlags({
    server: Flag.String("server").pipe(
      Flag.withDescription(
        "Server to use, by address. Defaults to PP_SERVER, then your default server."
      ),
      Flag.withFallbackConfig(Config.String("PP_SERVER")),
      Flag.optional
    ),
    org: Flag.String("org").pipe(
      Flag.withDescription("Organization slug."),
      Flag.optional
    ),
    project: Flag.String("project").pipe(
      Flag.withDescription("Project slug."),
      Flag.optional
    ),
    json: Flag.Boolean("json").pipe(
      Flag.withDescription("Print machine-readable JSON."),
      Flag.withDefault(false)
    )
  }),
  Command.withDescription(
    "ProjectProject from your terminal: the same tools agents use over MCP."
  )
)
