import { useAtomValue } from "@effect/atom-react"

import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import { newTicketRequest } from "@/features/tickets/atoms/createTicket"

import { CreateTicketForm } from "./CreateTicketForm"

// "New ticket" in cmd+k: the full composer, inside the command menu. A
// command that creates in a sprint or relative to a ticket, or with a title
// already typed, leaves that in newTicketRequest first.
export function CreateTicketPage({ context, env }: CommandPageProps) {
  const request = useAtomValue(newTicketRequest) ?? {
    orgSlug: context.orgSlug,
    projectSlug: context.projectSlug
  }
  return (
    <CreateTicketForm
      inCommandMenu
      request={request}
      onDone={() => {
        env.registry.set(newTicketRequest, null)
        env.close()
      }}
    />
  )
}
