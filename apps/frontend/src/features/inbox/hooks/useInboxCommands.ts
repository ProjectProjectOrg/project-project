import type { InboxItem } from "@pp/shared"
import {
  ArrowUpRight,
  BellOff,
  CheckCheck,
  Mail,
  MailCheck,
  MailOpen
} from "lucide-react"
import { useMemo } from "react"

import type { Command } from "@/features/command-menu/lib/commands"
import type { InboxActions } from "@/features/inbox/hooks/useInboxActions"
import { m } from "@/paraglide/messages"

export function useInboxCommands(
  selected: InboxItem | null,
  actions: InboxActions
): ReadonlyArray<Command> {
  return useMemo(() => {
    if (selected === null) return []
    const command = (
      fields: Omit<Command, "group" | "run" | "page">,
      act: () => void
    ): Command => ({
      ...fields,
      group: "ticketActions",
      run: (_context, env) => {
        env.close()
        act()
      }
    })
    return [
      command(
        {
          id: "inbox.open",
          label: m.inbox_open_ticket,
          icon: ArrowUpRight,
          shortcut: "O"
        },
        () => actions.openTicket(selected)
      ),
      command(
        {
          id: "inbox.done",
          label: m.inbox_mark_done,
          icon: CheckCheck,
          shortcut: "E"
        },
        () => actions.done(selected)
      ),
      command(
        {
          id: "inbox.unread",
          label: selected.unread ? m.inbox_mark_read : m.inbox_mark_unread,
          icon: selected.unread ? MailOpen : Mail,
          shortcut: "U"
        },
        () => actions.toggleUnread(selected)
      ),
      command(
        { id: "inbox.unsubscribe", label: m.inbox_unsubscribe, icon: BellOff },
        () => actions.unsubscribe(selected)
      ),
      command(
        {
          id: "inbox.read-all",
          label: m.inbox_mark_all_read,
          icon: MailCheck
        },
        actions.readAll
      ),
      command(
        {
          id: "inbox.done-all",
          label: m.inbox_mark_all_done,
          icon: CheckCheck
        },
        actions.doneAll
      )
    ]
  }, [selected, actions])
}
