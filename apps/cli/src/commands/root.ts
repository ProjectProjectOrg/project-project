import { Command, Flag } from "effect/cli"

export const root = Command.make("pp").pipe(
  Command.withSharedFlags({
    server: Flag.String("server").pipe(
      Flag.withDescription(
        "Server to use, by address. Defaults to PP_SERVER, then your default server."
      ),
      Flag.optional
    ),
    org: Flag.String("org").pipe(
      Flag.withDescription(
        "Organization slug. Defaults to PP_ORG, then the default from `pp use`, then your only org."
      ),
      Flag.optional
    ),
    project: Flag.String("project").pipe(
      Flag.withDescription(
        "Project slug. Defaults to PP_PROJECT, then the default from `pp use`, then the org's only project."
      ),
      Flag.optional
    ),
    json: Flag.Boolean("json").pipe(
      Flag.withDescription("Print machine-readable JSON."),
      Flag.withDefault(false)
    )
  }),
  Command.withDescription(
    "ProjectProject from your terminal: the same tools agents use over MCP. Agents: run `pp guide` first."
  )
)
