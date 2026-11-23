import { useAtomValue } from "@effect/atom-react"
import type { Ticket } from "@pp/shared"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuList,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { CircleDashed, Layers, Plus } from "@pp/ui/icons"
import { KbdShortcut } from "@pp/ui/kbd"
import { menuItemDetailClass } from "@pp/ui/menu-styles"
import {
  PickerField,
  PickerFieldOpen,
  PickerFieldValue
} from "@pp/ui/picker-field"
import { ProgressCount } from "@pp/ui/progress-count"
import { ShortcutTooltip } from "@pp/ui/tooltip"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { epicsRequest, projectEpics } from "@/features/tickets/atoms/epics"
import { ParentTicketLink } from "@/features/tickets/components/ticket-page/ParentTicketLink"
import { parentRef, type TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

const NO_EPIC = "__no-epic"

export function EpicField({
  ticket,
  editable,
  onPatch
}: Readonly<{
  ticket: Ticket
  editable: boolean
  onPatch: (patch: TicketEdit) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(projectEpics(epicsRequest(orgSlug, slug)))
  const epics = Result.isSuccess(result) ? result.value : []
  const parent = ticket.parent
  const [query, setQuery] = useState("")
  const emptyMessage = Result.matchWithError(result, {
    onInitial: () => m.tickets_epic_loading(),
    onError: () => m.tickets_epic_load_failed(),
    onDefect: () => m.tickets_epic_load_failed(),
    onSuccess: ({ value }) =>
      value.length === 0 ? m.tickets_epic_empty() : m.tickets_epic_no_match()
  })

  if (!editable && parent !== null) return <ParentTicketLink parent={parent} />

  const noneText = m.tickets_epic_none()
  const none = {
    value: NO_EPIC,
    textValue: noneText,
    closeOnClick: true,
    label: (
      <>
        <CircleDashed strokeWidth={1.75} />
        <span className="truncate">{noneText}</span>
      </>
    )
  }
  const items = !Result.isSuccess(result)
    ? []
    : [
        none,
        ...epics.map((epic) => {
          const done = epic.subTicketDoneCount ?? 0
          const total = epic.subTicketCount ?? 0
          return {
            value: epic.id,
            textValue: `${epic.id} ${epic.title}`,
            closeOnClick: true,
            label: (
              <>
                <Layers className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 truncate">{epic.title}</span>
                {total > 0 && (
                  <span data-menu-meta className={menuItemDetailClass}>
                    <ProgressCount
                      done={done}
                      total={total}
                      label={m.tickets_sub_tickets_progress({ done, total })}
                      tone="inherit"
                    />
                  </span>
                )}
              </>
            )
          }
        })
      ]

  return (
    <PickerField>
      <DropdownMenu
        filterable={{ value: query, onValueChange: setQuery }}
        onOpenChangeComplete={(open) => {
          if (!open) setQuery("")
        }}
      >
        <ShortcutTooltip
          hotkey={appHotkeys["tickets.parent"]}
          label={parent?.title ?? m.tickets_epic_add_chip()}
          keyLabels={keyLabels()}
        >
          <DropdownMenuTrigger
            render={
              <PickerFieldValue
                empty={parent === null}
                aria-label={
                  parent === null
                    ? m.tickets_epic_add_chip()
                    : m.tickets_epic_change_aria_label()
                }
              >
                {parent === null ? (
                  <>
                    <Plus className="size-3.5" strokeWidth={1.75} />
                    <span>{m.tickets_epic_add_chip()}</span>
                  </>
                ) : (
                  <>
                    <Layers className="size-3.5" strokeWidth={1.75} />
                    <span className="max-w-[24ch] truncate">
                      {parent.title}
                    </span>
                  </>
                )}
              </PickerFieldValue>
            }
          />
        </ShortcutTooltip>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="w-max max-w-[min(20rem,calc(100vw-2rem))] min-w-60"
        >
          <DropdownMenuInput
            placeholder={m.tickets_epic_search_placeholder()}
            aria-label={m.tickets_epic_search_placeholder()}
            shortcut={
              <KbdShortcut
                keys={appHotkeys["tickets.parent"].defaultHotkey}
                keyLabels={keyLabels()}
                aria-hidden
              />
            }
          />
          <DropdownMenuList className="max-h-80">
            <DropdownMenuRadioGroup
              value={parent?.id ?? NO_EPIC}
              onValueChange={(id) => {
                if (id === NO_EPIC) {
                  if (parent !== null) onPatch({ parent: null })
                  return
                }
                const epic = epics.find((candidate) => candidate.id === id)
                if (epic !== undefined && id !== parent?.id)
                  onPatch({ parent: parentRef(epic) })
              }}
              items={items}
            />
          </DropdownMenuList>
          <DropdownMenuEmpty
            data-pending={Result.isInitial(result) || undefined}
          >
            {emptyMessage}
          </DropdownMenuEmpty>
        </DropdownMenuContent>
      </DropdownMenu>
      {parent !== null && (
        <PickerFieldOpen
          label={m.tickets_epic_open_action()}
          render={
            <Link
              to="/orgs/$orgSlug/projects/$slug/tickets/$id"
              params={{ orgSlug, slug, id: parent.id }}
              preload="intent"
            />
          }
        />
      )}
    </PickerField>
  )
}
