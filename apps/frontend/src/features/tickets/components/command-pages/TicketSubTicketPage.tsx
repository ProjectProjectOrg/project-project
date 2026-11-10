import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { Ticket } from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Effect from "effect/Effect"
import * as Random from "effect/Random"
import { ListPlus, Plus } from "lucide-react"
import { useContext, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import {
  attachToParent,
  childTicketsRequest,
  quickCreateChildTicket
} from "@/features/tickets/atoms/childTickets"
import {
  searchRequest,
  ticketSearch
} from "@/features/tickets/atoms/ticketSearch"
import { useSettledValue } from "@/hooks/useSettledValue"
import { m } from "@/paraglide/messages"

import type { TicketPageProps } from "./TicketFieldCommands"

const CREATE = "create"
const NO_TICKETS: ReadonlyArray<Ticket> = []

export function TicketSubTicketPage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const registry = useContext(RegistryContext)
  const [query, setQuery] = useState("")
  const title = query.trim()
  const [debounced] = useDebouncedValue(title, { wait: 120 })
  const result = useAtomValue(
    ticketSearch(
      searchRequest(ticket.orgSlug, ticket.slug, {
        q: debounced === "" ? undefined : debounced,
        attachableTo: ticket.ticketId,
        limit: 24
      })
    )
  )
  const candidates = useSettledValue(result, NO_TICKETS)
  const isEpic = context.ticketDetail?.type === "epic"
  const req = childTicketsRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_sub_ticket_placeholder()}
      onBack={onBack}
      filter={false}
      fixedHeight
      onSearchChange={setQuery}
      empty={{
        icon: ListPlus,
        title: m.tickets_command_sub_ticket_empty_title(),
        description: m.tickets_command_sub_ticket_empty_body()
      }}
      items={[
        ...(title === ""
          ? []
          : [
              {
                value: CREATE,
                label: isEpic
                  ? m.tickets_command_create_in_epic({ title })
                  : m.tickets_command_create_sub_ticket({ title }),
                icon: Plus
              }
            ]),
        ...candidates.map((candidate) => ({
          value: candidate.id,
          label: candidate.title,
          prefix: candidate.id
        }))
      ]}
      onSelect={(item) => {
        if (item.value === CREATE) {
          void fireMutation(registry, quickCreateChildTicket(req), {
            payload: { title, parent: ticket.ticketId },
            prediction: {
              clientId: Effect.runSync(Random.next).toString(36),
              createdBy: context.viewerId ?? "",
              projectPrefix: context.project?.key ?? "",
              estimation: context.project?.estimation ?? "off"
            }
          })
        } else {
          const picked = candidates.find(
            (candidate) => candidate.id === item.value
          )
          if (picked !== undefined) attachToParent(registry, req, picked)
        }
        env.close()
      }}
    />
  )
}
