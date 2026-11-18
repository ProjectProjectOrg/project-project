import { ChevronsDownUp, ChevronsUpDown } from "@pp/ui/icons"
import { useMemo } from "react"

import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import { Command } from "@/features/command-menu/lib/commands"
import { useSubTicketsExpanded } from "@/features/tickets/hooks/useSubTicketsExpanded"
import { m } from "@/paraglide/messages"

export function useExpandSubTicketsCommand() {
  const [expanded, setExpanded] = useSubTicketsExpanded()
  const scope = useMemo(
    () => ({
      commands: [
        Command.run({
          id: "view.expand-sub-tickets",
          group: "view",
          label: expanded
            ? m.tickets_sub_tickets_collapse
            : m.tickets_sub_tickets_expand,
          icon: expanded ? ChevronsDownUp : ChevronsUpDown,
          keywords: ["sub-tickets", "children", "expand", "collapse"],
          run: (_context, env) => {
            setExpanded(!expanded)
            env.close()
          }
        })
      ]
    }),
    [expanded, setExpanded]
  )
  useCommandScope(scope)
}
