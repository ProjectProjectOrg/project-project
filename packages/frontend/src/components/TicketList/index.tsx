import { Result, useAtomValue } from "@effect-atom/atom-react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { CreateTicketRow } from "@/components/CreateTicketRow"
import { meAtom } from "@/atoms/auth"
import { m } from "@/paraglide/messages"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import type {
  Member,
  TagName,
  TicketId,
  TicketStatus,
  TicketType
} from "@projectproject/shared"
import { Empty, FilteredList } from "./FilteredList"
import { type SortKey } from "./sort"
import { Toolbar } from "./Toolbar"

export function TicketList({
  orgSlug,
  slug,
  members
}: {
  orgSlug: string
  slug: string
  members: ReadonlyArray<Member>
}) {
  const list = useAtomValue(ticketsListAtom(ticketsListKey(orgSlug, slug)))
  const me = useAtomValue(meAtom)
  const myId = Result.isSuccess(me) ? me.value.id : null
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as {
    ticket?: string
    focusBody?: number
  }
  const expandedId = (search.ticket ?? null) as TicketId | null
  const focusBody = search.focusBody === 1

  const setExpanded = (id: TicketId | null) => {
    navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        ticket: id ?? undefined,
        focusBody: undefined
      }),
      replace: true
    })
  }

  const consumeFocusBody = () => {
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, focusBody: undefined }),
      replace: true
    })
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId])

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all")
  const [typeFilter, setTypeFilter] = useState<TicketType | "all">("all")
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all")
  const [selectedTags, setSelectedTags] = useState<ReadonlyArray<TagName>>([])
  const [sortKey, setSortKey] = useState<SortKey>("id")
  const [searchFocused, setSearchFocused] = useState(false)

  const compactFilters = searchFocused || query.length > 0

  const resolvedAssignee: "all" | "unassigned" | string =
    assigneeFilter === "mine" ? (myId ?? "unassigned") : assigneeFilter

  return (
    <div className="group/list flex flex-col gap-3">
      <CreateTicketRow orgSlug={orgSlug} slug={slug} />

      <div className="flex flex-col gap-3 transition-opacity duration-200 ease-out group-has-[form[data-active]]/list:opacity-35">
        {Result.isSuccess(list) && list.value.length > 0 && (
          <Toolbar
            query={query}
            onQueryChange={setQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            assigneeFilter={assigneeFilter}
            onAssigneeFilterChange={setAssigneeFilter}
            selectedTags={selectedTags}
            onSelectedTagsChange={setSelectedTags}
            sortKey={sortKey}
            onSortChange={setSortKey}
            tickets={list.value}
            members={members}
            myId={myId}
            orgSlug={orgSlug}
            slug={slug}
            compact={compactFilters}
            onSearchFocusChange={setSearchFocused}
          />
        )}

        {Result.matchWithError(list, {
          onInitial: () => (
            <div className="skeleton h-24 rounded-xl border border-border bg-background" />
          ),
          onError: (error) => (
            <Empty>{m.tickets_list_load_error({ error: error._tag })}</Empty>
          ),
          onDefect: (defect) => (
            <Empty>{m.tickets_list_defect({ defect: String(defect) })}</Empty>
          ),
          onSuccess: ({ value }) => (
            <FilteredList
              orgSlug={orgSlug}
              slug={slug}
              tickets={value}
              query={query}
              onClearSearch={() => setQuery("")}
              statusFilter={statusFilter}
              typeFilter={typeFilter}
              assigneeFilter={resolvedAssignee}
              selectedTags={selectedTags}
              sortKey={sortKey}
              expandedId={expandedId}
              onExpand={setExpanded}
              focusBody={focusBody}
              onConsumeFocusBody={consumeFocusBody}
              members={members}
            />
          )
        })}
      </div>
    </div>
  )
}
