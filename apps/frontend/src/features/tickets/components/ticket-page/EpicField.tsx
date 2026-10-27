import { useAtomValue } from "@effect/atom-react"
import type { Ticket, UpdateTicketInput } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { Check, ChevronDown, Layers, Plus } from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { epicsRequest, projectEpics } from "@/features/tickets/atoms/epics"
import { m } from "@/paraglide/messages"

export function EpicField({
  ticket,
  onPatch
}: Readonly<{
  ticket: Ticket
  onPatch: (patch: UpdateTicketInput) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(projectEpics(epicsRequest(orgSlug, slug)))
  const epics = Result.isSuccess(result) ? result.value : []
  const parent = ticket.parent ?? null
  const parentTitle =
    parent === null
      ? null
      : (epics.find((epic) => epic.id === parent)?.title ?? parent)

  const picker = (trigger: ReactElement) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start" sideOffset={6} className="w-56">
        {Result.matchWithError(result, {
          onInitial: () => (
            <DropdownMenuItem disabled className="animate-pulse">
              {m.tickets_epic_loading()}
            </DropdownMenuItem>
          ),
          onError: () => (
            <DropdownMenuItem disabled>
              {m.tickets_epic_load_failed()}
            </DropdownMenuItem>
          ),
          onDefect: () => (
            <DropdownMenuItem disabled>
              {m.tickets_epic_load_failed()}
            </DropdownMenuItem>
          ),
          onSuccess: ({ value }) =>
            value.length === 0 && (
              <DropdownMenuItem disabled>
                {m.tickets_epic_empty()}
              </DropdownMenuItem>
            )
        })}
        {epics.map((epic) => (
          <DropdownMenuItem
            key={epic.id}
            onClick={() => {
              if (epic.id !== parent) onPatch({ parent: epic.id })
            }}
            className="cursor-pointer"
          >
            <Layers className="size-4" strokeWidth={1.75} />
            <span className="min-w-0 truncate">{epic.title}</span>
            {epic.id === parent && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ))}
        {parent !== null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onPatch({ parent: null })}
              className="cursor-pointer"
            >
              {m.tickets_epic_remove_action()}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (parent === null) {
    return picker(
      <Button type="button" variant="chip">
        <Plus className="size-3.5" strokeWidth={1.75} />
        <span>{m.tickets_epic_add_chip()}</span>
      </Button>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        render={
          <Link
            to="/orgs/$orgSlug/projects/$slug/tickets/$id"
            params={{ orgSlug, slug, id: parent }}
            preload="intent"
          />
        }
        variant="chip"
        className="min-w-0"
      >
        <Layers className="size-3.5" strokeWidth={1.75} />
        <span className="max-w-[18ch] truncate">{parentTitle}</span>
      </Button>
      {picker(
        <Button
          type="button"
          variant="chip"
          size="icon-xs"
          aria-label={m.tickets_epic_change_aria_label()}
        >
          <ChevronDown strokeWidth={1.75} />
        </Button>
      )}
    </div>
  )
}
