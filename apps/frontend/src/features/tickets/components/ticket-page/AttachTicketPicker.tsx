import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { Ticket } from "@pp/shared"
import { useDebouncer } from "@tanstack/react-pacer"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import { Link2 } from "lucide-react"
import { useContext, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  CommandMenu,
  CommandMenuEmpty,
  CommandMenuInput,
  CommandMenuItem,
  CommandMenuList
} from "@/components/ui/command-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
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

const idleSearch = Atom.make(Result.initial<ReadonlyArray<Ticket>>())

export function AttachTicketPicker({
  parent
}: Readonly<{ parent: Pick<Ticket, "id"> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  const [open, setOpen] = useState(false)
  // Stays true through the exit animation so the popup keeps its results
  // instead of collapsing to the loading state (and flipping sides) as it fades.
  const [mounted, setMounted] = useState(false)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const debouncer = useDebouncer(setQuery, { wait: 200 })
  const result = useAtomValue(
    mounted
      ? ticketSearch(
          searchRequest(orgSlug, slug, {
            q: query || undefined,
            attachableTo: parent.id,
            limit: 24
          })
        )
      : idleSearch
  )
  const candidates = Result.isSuccess(result) ? result.value : []
  const byId = new Map<string, Ticket>(
    candidates.map((ticket) => [ticket.id, ticket])
  )
  const emptyMessage = Result.matchWithError(result, {
    onInitial: () => m.tickets_children_attach_loading(),
    onError: () => m.tickets_children_attach_failed(),
    onDefect: () => m.tickets_children_attach_failed(),
    onSuccess: () => m.tickets_children_attach_empty()
  })

  const close = () => {
    setOpen(false)
    debouncer.cancel()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true)
          setMounted(true)
        } else {
          close()
        }
      }}
      onOpenChangeComplete={(next) => {
        if (next) return
        setMounted(false)
        setSearch("")
        setQuery("")
      }}
    >
      <PopoverTrigger
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
      <PopoverContent align="start" sideOffset={6} className="w-72 p-0">
        <CommandMenu
          className="max-h-[300px]"
          items={candidates.map((ticket) => ({
            value: ticket.id,
            label: `${ticket.id} ${ticket.title}`
          }))}
          onSelect={(picked) => {
            const ticket = byId.get(picked.value)
            close()
            if (ticket !== undefined) {
              attachToParent(
                registry,
                childTicketsRequest(orgSlug, slug, parent.id),
                ticket
              )
            }
          }}
        >
          <CommandMenuInput
            placeholder={m.tickets_children_attach_placeholder()}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              debouncer.maybeExecute(event.target.value.trim())
            }}
          />
          <CommandMenuList
            renderItem={(row) => {
              const ticket = byId.get(row.value)
              return (
                <CommandMenuItem value={row.value}>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {row.value}
                  </span>
                  <span className="min-w-0 truncate">{ticket?.title}</span>
                </CommandMenuItem>
              )
            }}
          >
            <CommandMenuEmpty
              className={Result.isInitial(result) ? "animate-pulse" : undefined}
            >
              {emptyMessage}
            </CommandMenuEmpty>
          </CommandMenuList>
        </CommandMenu>
      </PopoverContent>
    </Popover>
  )
}
