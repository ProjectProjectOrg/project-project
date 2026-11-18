import { Command } from "@/features/command-menu/lib/commands"
import { IntegrationState } from "@/features/integrations/hooks/useOrgIntegrations"
import { m } from "@/paraglide/messages"

export type IntegrationCommandEntry = Readonly<{
  id: string
  name: string
  icon: Command["icon"]
  parent: NonNullable<Command["parent"]>
  keywords: ReadonlyArray<string>
  to: string
  allowed: boolean
  state?: IntegrationState
  prerequisite?: boolean
}>

export function integrationCommands(
  entries: ReadonlyArray<IntegrationCommandEntry>
) {
  return entries.flatMap((entry) => {
    if (!entry.allowed) return []
    const state = entry.state
    const repair =
      state !== undefined && IntegrationState.$is("attention")(state)
    const setup =
      entry.prerequisite === true &&
      state !== undefined &&
      (IntegrationState.$is("notSetUp")(state) ||
        IntegrationState.$is("perProject")(state))
    const suggested = repair || setup
    return [
      Command.run({
        id: entry.id,
        group: suggested ? "setup" : "navigation",
        label: () =>
          repair
            ? m.chrome_command_menu_repair_integration({
                integration: entry.name
              })
            : setup
              ? m.chrome_command_menu_connect_integration({
                  integration: entry.name
                })
              : entry.name,
        icon: entry.icon,
        parent: entry.parent,
        keywords: [
          ...entry.keywords,
          "settings",
          "integration",
          "connect",
          "setup"
        ],
        listed: suggested ? "always" : "search",
        run: (_context, env) => {
          env.navigate(entry.to)
          env.close()
        }
      })
    ]
  })
}
