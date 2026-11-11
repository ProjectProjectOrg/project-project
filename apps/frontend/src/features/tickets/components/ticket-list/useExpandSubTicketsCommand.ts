import { ChevronsDownUp, ChevronsUpDown } from "lucide-react"
import { useMemo } from "react"

import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import type { Command } from "@/features/command-menu/lib/commands"
import { useSubTicketsExpanded } from "@/features/tickets/hooks/useSubTicketsExpanded"
import { m } from "@/paraglide/messages"

export function useExpandSubTicketsCommand() {
  const [expanded, setExpanded] = useSubTicketsExpanded()
  const scope = useMemo(
    () => ({
      commands: [
        {
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
        } satisfies Command
      ]
    }),
    [expanded, setExpanded]
  )
  useCommandScope(scope)
}
