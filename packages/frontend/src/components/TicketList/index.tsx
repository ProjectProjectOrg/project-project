import { Result, useAtomValue } from "@effect-atom/atom-react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Schema } from "effect"
import { useCallback, useEffect } from "react"
import { CreateTicketRow } from "@/components/CreateTicketRow"
import { Empty } from "@/components/ui/empty"
import { m } from "@/paraglide/messages"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import { ticketListUiKey } from "@/atoms/ticketListUi"
import { TicketId, type Group, type Member } from "@projectproject/shared"
import type { ReactNode } from "react"
import type { Ticket } from "@projectproject/shared"
import { FilteredList } from "./FilteredList"
import { Toolbar } from "./Toolbar"

const makeTicketId = Schema.decodeUnknownSync(TicketId)

function ticketIdFromSearch(value: string | undefined): TicketId | null {
  if (!value) return null
  try {
    return makeTicketId(value)
  } catch {
    return null
  }
}

export function TicketList({
  orgSlug,
  slug,
  members,
  uiKey,
  filterIds,
  extraRowActions,
  sprintMembership
}: {
  orgSlug: string
  slug: string
  members: ReadonlyArray<Member>
  uiKey?: string
  filterIds?: ReadonlySet<TicketId>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
}) {
  const resolvedUiKey = uiKey ?? ticketListUiKey(orgSlug, slug)
  const list = useAtomValue(ticketsListAtom(ticketsListKey(orgSlug, slug)))
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as {
    ticket?: string
    focusBody?: number
  }
  const expandedId = ticketIdFromSearch(search.ticket)
  const focusBody = search.focusBody === 1

  const setExpanded = useCallback(
    (id: TicketId | null) => {
      navigate({
        to: ".",
        search: (prev) => ({
          ...prev,
          ticket: id ?? undefined,
          focusBody: undefined
        }),
        replace: true
      })
    },
    [navigate]
  )

  const consumeFocusBody = useCallback(() => {
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, focusBody: undefined }),
      replace: true
    })
  }, [navigate])

  useEffect(() => {
    if (!expandedId) return
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return
      const t = e.target as HTMLElement | null
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t && t.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      setExpanded(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [expandedId, setExpanded])

  return (
    <div className="group/list flex flex-col gap-3">
      <CreateTicketRow orgSlug={orgSlug} slug={slug} />

      <div className="flex flex-col gap-3 transition-opacity duration-200 ease-out group-has-[form[data-active]]/list:opacity-35">
        {Result.isSuccess(list) && list.value.length > 0 && (
          <Toolbar
            orgSlug={orgSlug}
            slug={slug}
            uiKey={resolvedUiKey}
            tickets={list.value}
            members={members}
          />
        )}

        {Result.matchWithError(list, {
          onInitial: () => (
            <div className="skeleton h-24 rounded-xl border border-border bg-background" />
          ),
          onError: (error) => (
            <Empty className="border border-dashed border-border">
              {m.tickets_list_load_error({ error: error._tag })}
            </Empty>
          ),
          onDefect: (defect) => (
            <Empty className="border border-dashed border-border">
              {m.tickets_list_defect({ defect: String(defect) })}
            </Empty>
          ),
          onSuccess: ({ value }) => (
            <FilteredList
              orgSlug={orgSlug}
              slug={slug}
              uiKey={resolvedUiKey}
              tickets={
                filterIds
                  ? value.filter((t) => filterIds.has(t.id))
                  : value
              }
              members={members}
              expandedId={expandedId}
              onExpand={setExpanded}
              focusBody={focusBody}
              onConsumeFocusBody={consumeFocusBody}
              extraRowActions={extraRowActions}
              sprintMembership={sprintMembership}
            />
          )
        })}
      </div>
    </div>
  )
}
