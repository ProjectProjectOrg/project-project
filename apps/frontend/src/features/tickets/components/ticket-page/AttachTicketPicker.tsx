import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { Ticket } from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Result from "effect/reactivity/AsyncResult"
import { Link2 } from "lucide-react"
import { useContext, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  attachToParent,
  childTicketsRequest
} from "@/features/tickets/atoms/childTickets"
import {
  searchRequest,
  ticketSearch
} from "@/features/tickets/atoms/ticketSearch"
import { m } from "@/paraglide/messages"

export function AttachTicketPicker({
  parent
}: Readonly<{ parent: Pick<Ticket, "id"> }>) {
  const [query, setQuery] = useState("")

  return (
    <DropdownMenu
      onOpenChangeComplete={(open) => {
        if (!open) setQuery("")
      }}
      filterable={{ value: query, onValueChange: setQuery, filter: null }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="tertiary"
            size="lg"
            className="shrink-0"
          >
            <Link2 className="size-3.5" strokeWidth={1.75} />
            <span>{m.tickets_children_attach_button()}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="start" sideOffset={6} className="w-72">
        <AttachTicketList parent={parent} query={query} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AttachTicketList({
  parent,
  query
}: Readonly<{ parent: Pick<Ticket, "id">; query: string }>) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  const [debounced] = useDebouncedValue(query.trim(), { wait: 200 })
  const result = useAtomValue(
    ticketSearch(
      searchRequest(orgSlug, slug, {
        q: debounced || undefined,
        attachableTo: parent.id,
        limit: 24
      })
    )
  )
  const candidates = Result.isSuccess(result) ? result.value : []
  const emptyMessage = Result.matchWithError(result, {
    onInitial: () => m.tickets_children_attach_loading(),
    onError: () => m.tickets_children_attach_failed(),
    onDefect: () => m.tickets_children_attach_failed(),
    onSuccess: () => m.tickets_children_attach_empty()
  })

  return (
    <>
      <DropdownMenuInput
        placeholder={m.tickets_children_attach_placeholder()}
        aria-label={m.tickets_children_attach_placeholder()}
      />
      <DropdownMenuList className="max-h-64 overflow-y-auto">
        {candidates.map((ticket) => (
          <DropdownMenuItem
            key={ticket.id}
            label={`${ticket.id} ${ticket.title}`}
            onClick={() =>
              attachToParent(
                registry,
                childTicketsRequest(orgSlug, slug, parent.id),
                ticket
              )
            }
          >
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {ticket.id}
            </span>
            <span className="min-w-0 truncate">{ticket.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuList>
      <DropdownMenuEmpty
        className={Result.isInitial(result) ? "animate-pulse" : undefined}
      >
        {emptyMessage}
      </DropdownMenuEmpty>
    </>
  )
}
