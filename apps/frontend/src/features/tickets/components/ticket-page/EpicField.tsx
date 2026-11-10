import { useAtomValue } from "@effect/atom-react"
import type { Ticket, UpdateTicketInput } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { ArrowUpRight, Layers, Plus, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { epicsRequest, projectEpics } from "@/features/tickets/atoms/epics"
import { ParentTicketLink } from "@/features/tickets/components/ticket-page/ParentTicketLink"
import { m } from "@/paraglide/messages"

export function EpicField({
  ticket,
  editable,
  onPatch
}: Readonly<{
  ticket: Ticket
  editable: boolean
  onPatch: (patch: UpdateTicketInput) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(projectEpics(epicsRequest(orgSlug, slug)))
  const epics = Result.isSuccess(result) ? result.value : []
  const parent = ticket.parent ?? null
  const parentEpic = epics.find((epic) => epic.id === parent)
  const parentTitle = parent === null ? null : (parentEpic?.title ?? parent)
  const [query, setQuery] = useState("")
  const emptyMessage = Result.matchWithError(result, {
    onInitial: () => m.tickets_epic_loading(),
    onError: () => m.tickets_epic_load_failed(),
    onDefect: () => m.tickets_epic_load_failed(),
    onSuccess: ({ value }) =>
      value.length === 0 ? m.tickets_epic_empty() : m.tickets_epic_no_match()
  })

  if (!editable && parent !== null) {
    return (
      <ParentTicketLink
        parent={{ id: parent, title: parentEpic?.title ?? "" }}
      />
    )
  }

  return (
    <DropdownMenu
      filterable={{ value: query, onValueChange: setQuery }}
      onOpenChangeComplete={(open) => {
        if (!open) setQuery("")
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="chip"
            className="min-w-0"
            aria-label={
              parentTitle === null
                ? m.tickets_epic_add_chip()
                : m.tickets_epic_change_aria_label()
            }
          >
            {parentTitle === null ? (
              <>
                <Plus className="size-3.5" strokeWidth={1.75} />
                <span>{m.tickets_epic_add_chip()}</span>
              </>
            ) : (
              <>
                <Layers className="size-3.5" strokeWidth={1.75} />
                <span className="max-w-[18ch] truncate">{parentTitle}</span>
              </>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="start" sideOffset={6} className="w-60">
        <DropdownMenuInput
          placeholder={m.tickets_epic_search_placeholder()}
          aria-label={m.tickets_epic_search_placeholder()}
        />
        <DropdownMenuList className="max-h-64 overflow-y-auto">
          <DropdownMenuRadioGroup
            value={parent}
            onValueChange={(id) => {
              if (id !== parent) onPatch({ parent: id })
            }}
            items={epics.map((epic) => ({
              value: epic.id,
              textValue: `${epic.id} ${epic.title}`,
              label: (
                <>
                  <Layers className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="min-w-0 truncate">{epic.title}</span>
                </>
              )
            }))}
          />
          {parent !== null && query === "" && (
            <>
              {epics.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                render={
                  <Link
                    to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                    params={{ orgSlug, slug, id: parent }}
                    preload="intent"
                  />
                }
              >
                <ArrowUpRight strokeWidth={1.75} />
                {m.tickets_epic_open_action()}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPatch({ parent: null })}>
                <X strokeWidth={1.75} />
                {m.tickets_epic_remove_action()}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuList>
        <DropdownMenuEmpty
          className={Result.isInitial(result) ? "animate-pulse" : undefined}
        >
          {emptyMessage}
        </DropdownMenuEmpty>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
