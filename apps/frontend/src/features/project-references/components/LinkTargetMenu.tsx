import { useAtomValue } from "@effect/atom-react"
import type { ReferenceKind } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  searchRequest,
  ticketSearch
} from "@/features/tickets/atoms/ticketSearch"
import { m } from "@/paraglide/messages"

type LinkTargetMenuProps = Readonly<{
  kind: ReferenceKind
  label: string
  onPick: (to: string) => void
}>

export function LinkTargetMenu({ kind, label, onPick }: LinkTargetMenuProps) {
  const [query, setQuery] = useState("")

  return (
    <DropdownMenu
      onOpenChangeComplete={(open) => {
        if (!open) setQuery("")
      }}
      filterable={
        kind === "user"
          ? true
          : { value: query, onValueChange: setQuery, filter: null }
      }
    >
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="tertiary" size="sm">
            {label}
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-72">
        {kind === "user" ? (
          <MemberOptions onPick={onPick} />
        ) : (
          <TicketOptions query={query} onPick={onPick} />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MemberOptions({
  onPick
}: Readonly<{ onPick: (userId: string) => void }>) {
  const { members } = useProject()

  return (
    <>
      <DropdownMenuInput
        placeholder={m.project_references_member_search()}
        aria-label={m.project_references_member_search()}
      />
      <DropdownMenuList className="max-h-64 overflow-y-auto">
        {members.map((member) => (
          <DropdownMenuItem
            key={member.id}
            label={
              member.username
                ? `${member.name} ${member.username}`
                : member.name
            }
            onClick={() => onPick(member.id)}
          >
            <MemberAvatar member={member} size={20} />
            <span className="min-w-0 truncate">{member.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuList>
      <DropdownMenuEmpty>
        {m.project_references_member_empty()}
      </DropdownMenuEmpty>
    </>
  )
}

function TicketOptions({
  query,
  onPick
}: Readonly<{ query: string; onPick: (ticketId: string) => void }>) {
  const { orgSlug, slug } = useProjectRoute()
  const [debounced] = useDebouncedValue(query.trim(), { wait: 200 })
  const result = useAtomValue(
    ticketSearch(
      searchRequest(orgSlug, slug, { q: debounced || undefined, limit: 24 })
    )
  )
  const candidates = Result.isSuccess(result) ? result.value : []
  const emptyMessage = Result.matchWithError(result, {
    onInitial: () => m.project_references_ticket_loading(),
    onError: () => m.project_references_ticket_failed(),
    onDefect: () => m.project_references_ticket_failed(),
    onSuccess: () => m.project_references_ticket_empty()
  })

  return (
    <>
      <DropdownMenuInput
        placeholder={m.project_references_ticket_search()}
        aria-label={m.project_references_ticket_search()}
      />
      <DropdownMenuList className="max-h-64 overflow-y-auto">
        {candidates.map((ticket) => (
          <DropdownMenuItem
            key={ticket.id}
            label={`${ticket.id} ${ticket.title}`}
            onClick={() => onPick(ticket.id)}
          >
            <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
              {ticket.id}
            </span>
            <span className="min-w-0 truncate">{ticket.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuList>
      <DropdownMenuEmpty data-pending={Result.isInitial(result) || undefined}>
        {emptyMessage}
      </DropdownMenuEmpty>
    </>
  )
}
