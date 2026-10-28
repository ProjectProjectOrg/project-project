import { useAtomValue } from "@effect/atom-react"
import type { Ticket, UpdateTicketInput } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { Check, ChevronDown, Layers, Plus, X } from "lucide-react"
import { useState, type ReactElement } from "react"

import { Button } from "@/components/ui/button"
import {
  CommandMenu,
  CommandMenuEmpty,
  CommandMenuInput,
  CommandMenuItem,
  CommandMenuList,
  type CommandMenuItemData
} from "@/components/ui/command-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { epicsRequest, projectEpics } from "@/features/tickets/atoms/epics"
import { m } from "@/paraglide/messages"

const REMOVE_VALUE = "none"

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
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const q = search.trim().toLowerCase()
  const items: ReadonlyArray<CommandMenuItemData> = [
    ...epics
      .filter(
        (epic) =>
          epic.title.toLowerCase().includes(q) ||
          epic.id.toLowerCase().includes(q)
      )
      .map((epic) => ({ value: epic.id, label: epic.title })),
    ...(parent !== null && q === ""
      ? [{ value: REMOVE_VALUE, label: m.tickets_epic_remove_action() }]
      : [])
  ]
  const emptyMessage = Result.matchWithError(result, {
    onInitial: () => m.tickets_epic_loading(),
    onError: () => m.tickets_epic_load_failed(),
    onDefect: () => m.tickets_epic_load_failed(),
    onSuccess: ({ value }) =>
      value.length === 0 ? m.tickets_epic_empty() : m.tickets_epic_no_match()
  })

  const picker = (trigger: ReactElement) => (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch("")
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" sideOffset={6} className="w-64 p-0">
        <CommandMenu
          className="max-h-[300px]"
          items={items}
          onSelect={(picked) => {
            setOpen(false)
            setSearch("")
            if (picked.value === REMOVE_VALUE) onPatch({ parent: null })
            else if (picked.value !== parent) {
              const epic = epics.find(({ id }) => id === picked.value)
              if (epic) onPatch({ parent: epic.id })
            }
          }}
        >
          <CommandMenuInput
            placeholder={m.tickets_epic_search_placeholder()}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <CommandMenuList
            renderItem={(row) => (
              <CommandMenuItem value={row.value}>
                {row.value === REMOVE_VALUE ? (
                  <X className="size-4 shrink-0" strokeWidth={1.75} />
                ) : (
                  <Layers className="size-4 shrink-0" strokeWidth={1.75} />
                )}
                <span className="min-w-0 truncate">{row.label}</span>
                {row.value === parent && (
                  <Check className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                )}
              </CommandMenuItem>
            )}
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
