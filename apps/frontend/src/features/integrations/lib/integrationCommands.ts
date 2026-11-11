import type { Command } from "@/features/command-menu/lib/commands"
import type { IntegrationState } from "@/features/integrations/hooks/useOrgIntegrations"
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
): ReadonlyArray<Command> {
  return entries.flatMap((entry): ReadonlyArray<Command> => {
    if (!entry.allowed) return []
    const state = entry.state
    const repair =
      state !== undefined &&
      !state.loading &&
      state.connected &&
      state.tone === "attention"
    const setup =
      entry.prerequisite === true &&
      state !== undefined &&
      !state.loading &&
      !state.connected &&
      state.tone === "idle"
    const suggested = repair || setup
    return [
      {
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
        searchOnly: !suggested,
        run: (_context, env) => {
          env.navigate(entry.to)
          env.close()
        }
      }
    ]
  })
}
