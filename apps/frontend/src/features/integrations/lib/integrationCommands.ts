import type { CommandPage } from "@/features/command-menu/lib/commandMenu"
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
  // How to connect it from the menu, when that's a step of its own rather
  // than its settings page (registering a GitHub App).
  connect?: Readonly<{ label: string; page: CommandPage }>
}>

export function integrationCommands(
  entries: ReadonlyArray<IntegrationCommandEntry>
) {
  return entries.flatMap((entry) => {
    if (!entry.allowed) return []
    const state = entry.state
    const repair =
      state !== undefined && IntegrationState.$is("attention")(state)
    const disconnected =
      state !== undefined &&
      (IntegrationState.$is("notSetUp")(state) ||
        IntegrationState.$is("perProject")(state))
    const setup = entry.prerequisite === true && disconnected
    const suggested = repair || setup
    const connect = disconnected ? entry.connect : undefined
    const fields = {
      id: entry.id,
      group: suggested ? ("setup" as const) : ("settings" as const),
      label: () =>
        repair
          ? m.chrome_command_menu_repair_integration({
              integration: entry.name
            })
          : connect !== undefined
            ? connect.label
            : disconnected
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
      listed: suggested ? ("always" as const) : ("search" as const)
    }
    return [
      connect === undefined
        ? Command.run({
            ...fields,
            run: (_context, env) => {
              env.navigate(entry.to)
              env.close()
            }
          })
        : Command.page({ ...fields, page: connect.page })
    ]
  })
}
