// Inline-expanding ticket list.
//
// Each row collapses to a one-liner; clicking expands it in place to a full
// editor + metadata panel — same content the old separate page had, but
// without losing list context. The URL carries `?ticket=T-N` so the
// expansion is deep-linkable.
//
// Search / filter / sort live above the list. All client-side: the full list
// is already in memory via `ticketsListAtom`. The search bar is local state
// (no need to persist), the expanded id is URL state (worth deep-linking).
//
// Why no TanStack Table yet: one search + one status filter + one sort key
// fits cleanly into ~40 lines of plain TS. Migrate when columns gain
// individual sortability or virtualization is needed.

import {
  Result,
  useAtomSet,
  useAtomValue
} from "@effect-atom/atom-react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  CollapsingLabel,
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { MemberAvatar } from "@/components/MemberAvatar"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@/components/ui/input-group"
import {
  ArrowDownAZ,
  Bug,
  Check,
  ChevronDown,
  CircleDashed,
  CircleDot,
  Hammer,
  HelpCircle,
  ListChecks,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  X
} from "lucide-react"
import {
  deleteTicketAtom,
  ticketAtom,
  ticketKey,
  ticketsListAtom,
  updateTicketAtom
} from "@/atoms/tickets"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  LexicalEditor,
  type SaveStatus
} from "@/components/LexicalEditor"
import { CreateTicketRow } from "@/components/CreateTicketRow"
import { TicketGitChip, TicketGitPanel } from "@/components/TicketGit"
import { useProject } from "@/routes/_authed/projects/$slug/-context"
import { cn } from "@/lib/utils"
import { meAtom } from "@/atoms/auth"
import type {
  Member,
  Ticket,
  TicketDetail,
  TicketId,
  TicketStatus,
  TicketType
} from "@projectproject/shared"

// --- Tokens ---------------------------------------------------------------

const STATUS_META: Record<
  TicketStatus,
  { label: string; icon: typeof Check; className: string }
> = {
  todo: { label: "Todo", icon: CircleDashed, className: "text-muted-foreground" },
  in_progress: {
    label: "In progress",
    icon: CircleDot,
    className: "text-blue-500"
  },
  done: { label: "Done", icon: Check, className: "text-emerald-500" }
}

const TYPE_META: Record<TicketType, { label: string; icon: typeof Sparkles; tint: string }> = {
  feat: {
    label: "Feature",
    icon: Sparkles,
    tint: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
  },
  bug: {
    label: "Bug",
    icon: Bug,
    tint: "bg-red-500/10 text-red-700 dark:text-red-400"
  },
  chore: {
    label: "Chore",
    icon: Hammer,
    tint: "bg-amber-500/10 text-amber-700 dark:text-amber-400"
  },
  other: { label: "Other", icon: HelpCircle, tint: "bg-muted text-muted-foreground" }
}

const SORTS = {
  id: { label: "ID", compare: (a: Ticket, b: Ticket) => idNum(a) - idNum(b) },
  updated: {
    label: "Recently updated",
    compare: (a: Ticket, b: Ticket) =>
      b.updatedAt.getTime() - a.updatedAt.getTime()
  },
  created: {
    label: "Recently created",
    compare: (a: Ticket, b: Ticket) =>
      b.createdAt.getTime() - a.createdAt.getTime()
  },
  title: {
    label: "Title",
    compare: (a: Ticket, b: Ticket) => a.title.localeCompare(b.title)
  }
} as const
type SortKey = keyof typeof SORTS

function idNum(t: Ticket): number {
  return Number(t.id.slice(2))
}

// --- Public API ------------------------------------------------------------

export function TicketList({
  slug,
  members
}: {
  slug: string
  members: ReadonlyArray<Member>
}) {
  const list = useAtomValue(ticketsListAtom(slug))
  const me = useAtomValue(meAtom)
  const myId = Result.isSuccess(me) ? me.value.id : null
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { ticket?: string }
  const expandedId = (search.ticket ?? null) as TicketId | null

  const setExpanded = (id: TicketId | null) => {
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, ticket: id ?? undefined }),
      replace: true
    })
  }

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all")
  const [typeFilter, setTypeFilter] = useState<TicketType | "all">("all")
  // Assignee filter values: "all" | "unassigned" | "mine" | <user-id>.
  // "mine" is a shortcut that resolves to the current viewer's id at filter
  // time; cheaper UX than making the user pick themselves out of the list.
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all")
  const [sortKey, setSortKey] = useState<SortKey>("id")
  const [searchFocused, setSearchFocused] = useState(false)
  const [creating, setCreating] = useState(false)

  // Two intent signals shape the rest of the UI:
  //
  //   - `compactFilters` collapses filter/sort labels so the search bar can
  //     breathe. Stays compact while the search has focus OR carries a
  //     query — clicking a filter mid-search shouldn't make labels pop back
  //     in and shift target positions under the cursor.
  //
  //   - `creating` (CreateTicketRow has focus) dims the rest of the surface
  //     below the input. Pure visual hint — clicks still work, but the dim
  //     pulls attention to the new ticket the user is composing.
  const compactFilters = searchFocused || query.length > 0

  // Resolve the assignee filter to the actual id that should match a ticket.
  //   "all"        — no filter
  //   "unassigned" — sentinel string for "no assignee"
  //   "mine"       — current viewer's id (or null if not signed in)
  //   "<user-id>"  — that exact user id
  const resolvedAssignee: "all" | "unassigned" | string =
    assigneeFilter === "mine" ? myId ?? "unassigned" : assigneeFilter

  return (
    <div className="flex flex-col gap-3">
      <CreateTicketRow slug={slug} onFocusChange={setCreating} />

      <motion.div
        animate={{ opacity: creating ? 0.35 : 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="flex flex-col gap-3"
      >
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
            sortKey={sortKey}
            onSortChange={setSortKey}
            tickets={list.value}
            members={members}
            myId={myId}
            compact={compactFilters}
            onSearchFocusChange={setSearchFocused}
          />
        )}

        {Result.matchWithError(list, {
          onInitial: () => (
            <div className="h-24 animate-pulse rounded-xl border border-border bg-background" />
          ),
          onError: (error) => (
            <Empty>Couldn't load tickets: {error._tag}</Empty>
          ),
          onDefect: (defect) => (
            <Empty>Something went wrong: {String(defect)}</Empty>
          ),
          onSuccess: ({ value }) => (
            <FilteredList
              slug={slug}
              tickets={value}
              query={query}
              statusFilter={statusFilter}
              typeFilter={typeFilter}
              assigneeFilter={resolvedAssignee}
              sortKey={sortKey}
              expandedId={expandedId}
              onExpand={setExpanded}
              members={members}
            />
          )
        })}
      </motion.div>
    </div>
  )
}

// --- Toolbar ---------------------------------------------------------------

function Toolbar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  typeFilter,
  onTypeFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  sortKey,
  onSortChange,
  tickets,
  members,
  myId,
  compact,
  onSearchFocusChange
}: {
  query: string
  onQueryChange: (q: string) => void
  statusFilter: TicketStatus | "all"
  onStatusFilterChange: (s: TicketStatus | "all") => void
  typeFilter: TicketType | "all"
  onTypeFilterChange: (t: TicketType | "all") => void
  assigneeFilter: string
  onAssigneeFilterChange: (a: string) => void
  sortKey: SortKey
  onSortChange: (k: SortKey) => void
  tickets: ReadonlyArray<Ticket>
  members: ReadonlyArray<Member>
  myId: string | null
  compact: boolean
  onSearchFocusChange: (focused: boolean) => void
}) {
  // Sort is intentionally NOT counted as an "active filter" — it's always
  // set to *some* value, and users don't think of "sort by Recently updated"
  // as something they need to clear. Keep the Clear button scoped to the
  // four things that actually narrow the visible set.
  const hasActiveFilters =
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    assigneeFilter !== "all" ||
    query.length > 0

  const clearAll = () => {
    onQueryChange("")
    onStatusFilterChange("all")
    onTypeFilterChange("all")
    onAssigneeFilterChange("all")
  }
  // Per-status counts. Each chip's number should answer "if I clicked this
  // chip, how many tickets would I see?" — so we apply every *other* active
  // filter (type + assignee + search query) when counting, but NOT the
  // status filter itself (otherwise picking Todo would make every other
  // chip read 0, which is circular and useless).
  const counts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const resolved =
      assigneeFilter === "mine" ? myId ?? "unassigned" : assigneeFilter
    const matchesOtherFilters = (t: Ticket) =>
      (typeFilter === "all" || t.type === typeFilter) &&
      (resolved === "all" ||
        (resolved === "unassigned"
          ? t.assignee === null
          : t.assignee === resolved)) &&
      (q === "" ||
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q))

    const c: Record<TicketStatus | "all", number> = {
      all: 0,
      todo: 0,
      in_progress: 0,
      done: 0
    }
    for (const t of tickets) {
      if (!matchesOtherFilters(t)) continue
      c.all++
      c[t.status]++
    }
    return c
  }, [tickets, typeFilter, assigneeFilter, myId, query])

  // Every toolbar control wears the same chrome: `rounded-xl border bg-background
  // px-3 py-2`, mirroring the CreateTicketRow above. Inputs render with no
  // border of their own; auxiliary controls (status chips, type, sort) match
  // height and rounding so the row reads as a single visual band.
  //
  // Layout: `@container` on the wrapper drives a two-stage layout. Below the
  // breakpoint the search bar stacks above the filter group on its own row;
  // above it everything sits inline. The filter group is its own flex
  // container so chips/sort/clear stay together — Clear in particular never
  // gets orphaned onto a third row.
  return (
    <div className="@container">
      <div className="flex flex-col gap-2 @3xl:flex-row @3xl:items-center">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <Search className="size-4" strokeWidth={1.75} />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => onSearchFocusChange(true)}
            onBlur={() => onSearchFocusChange(false)}
            placeholder="Search tickets by title or id…"
            aria-label="Search tickets"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          )}
        </InputGroup>

        <div className="flex flex-nowrap items-center gap-2">
          <StatusChips
            value={statusFilter}
            onChange={onStatusFilterChange}
            counts={counts}
            compact={compact}
          />

          <FiltersMenu
            typeFilter={typeFilter}
            onTypeFilterChange={onTypeFilterChange}
            assigneeFilter={assigneeFilter}
            onAssigneeFilterChange={onAssigneeFilterChange}
            members={members}
            myId={myId}
            compact={compact}
          />

          <SortMenu
            value={sortKey}
            onChange={onSortChange}
            compact={compact}
          />

          <AnimatePresence initial={false}>
            {hasActiveFilters && (
              <motion.button
                key="clear"
                type="button"
                onClick={clearAll}
                initial={{ opacity: 0, width: 0, marginLeft: -8 }}
                animate={{ opacity: 1, width: 36, marginLeft: 0 }}
                exit={{ opacity: 0, width: 0, marginLeft: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                // Icon-only: matches every other toolbar control's height
                // (h-9 = 36px) and stays narrow enough that it doesn't push
                // the status-chip strip to a new row at typical widths.
                // Square footprint (36×36) reads as a single utility
                // affordance rather than another labeled filter button.
                className={cn(
                  "grid h-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-destructive/40 bg-destructive/10 text-destructive transition-colors",
                  "hover:bg-destructive/15 hover:border-destructive/60",
                  "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring outline-none"
                )}
                title="Clear all filters"
                aria-label="Clear all filters"
              >
                <X className="size-4 shrink-0" strokeWidth={1.75} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}


// Shared chrome for non-input toolbar controls (filters menu, sort menu).
// Same height (`h-9`) and surface as the InputGroup and the status-chip
// strip outer container, so the toolbar reads as one continuous band.
const TOOLBAR_BUTTON_CLASS = cn(
  "inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm",
  "text-muted-foreground transition-colors hover:text-foreground",
  "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring outline-none"
)

function StatusChips({
  value,
  onChange,
  counts,
  compact
}: {
  value: TicketStatus | "all"
  onChange: (v: TicketStatus | "all") => void
  counts: Record<TicketStatus | "all", number>
  compact: boolean
}) {
  const items: ReadonlyArray<SegmentedItem<TicketStatus | "all">> = [
    { key: "all", label: "All", badge: counts.all },
    {
      key: "todo",
      label: "Todo",
      icon: CircleDashed,
      iconClassName: STATUS_META.todo.className,
      badge: counts.todo
    },
    {
      key: "in_progress",
      label: "In progress",
      icon: CircleDot,
      iconClassName: STATUS_META.in_progress.className,
      badge: counts.in_progress
    },
    {
      key: "done",
      label: "Done",
      icon: Check,
      iconClassName: STATUS_META.done.className,
      badge: counts.done
    }
  ]
  return (
    <SegmentedTabs
      items={items}
      layoutId="status-chips"
      isActive={(k) => k === value}
      compact={compact}
      renderItem={(item, content, { active }) => (
        <button
          type="button"
          onClick={() => onChange(item.key)}
          aria-pressed={active}
          aria-label={
            compact ? `${item.label} (${counts[item.key]})` : undefined
          }
          className={SEGMENTED_ITEM_CLASS(active)}
        >
          {content}
        </button>
      )}
    />
  )
}

// Combined Type + Assignee filter. The toolbar used to render two separate
// dropdowns; combining them keeps the search bar wide enough to render its
// full placeholder, and reduces visual noise. The button shows a count badge
// when any sub-filter is active so the user can see at a glance whether
// they have something narrowing the list.
//
// Layout inside the menu: small uppercase section labels (TYPE / ASSIGNEE)
// separate the groups. Each item is a single-select within its group;
// selecting an item updates that one filter and leaves the menu open so the
// user can also adjust the other group in one trip.
function FiltersMenu({
  typeFilter,
  onTypeFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  members,
  myId,
  compact
}: {
  typeFilter: TicketType | "all"
  onTypeFilterChange: (v: TicketType | "all") => void
  assigneeFilter: string
  onAssigneeFilterChange: (v: string) => void
  members: ReadonlyArray<Member>
  myId: string | null
  compact: boolean
}) {
  const activeCount =
    (typeFilter !== "all" ? 1 : 0) + (assigneeFilter !== "all" ? 1 : 0)
  const active = activeCount > 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            TOOLBAR_BUTTON_CLASS,
            active && "bg-accent text-foreground hover:text-foreground"
          )}
          aria-label={
            compact && activeCount > 0
              ? `Filters (${activeCount} active)`
              : "Filters"
          }
          aria-pressed={active}
        >
          <SlidersHorizontal className="size-4" strokeWidth={1.75} />
          <CollapsingLabel show={!compact}>Filters</CollapsingLabel>
          {activeCount > 0 && (
            <span className="rounded-full bg-foreground/10 px-1.5 font-mono text-[10px] tabular-nums text-foreground">
              {activeCount}
            </span>
          )}
          <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-56"
        // Keep the menu open after selection so users can configure both
        // sections in a single trip — common when "show me my open bugs".
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <SectionLabel>Type</SectionLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onTypeFilterChange("all")
          }}
          className="cursor-pointer"
        >
          All types
          {typeFilter === "all" && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
          const m = TYPE_META[t]
          const TIcon = m.icon
          return (
            <DropdownMenuItem
              key={t}
              onSelect={(e) => {
                e.preventDefault()
                onTypeFilterChange(t)
              }}
              className="cursor-pointer"
            >
              <TIcon className="size-4" strokeWidth={1.75} />
              {m.label}
              {typeFilter === t && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}

        <div className="my-1 h-px bg-border" />
        <SectionLabel>Assignee</SectionLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onAssigneeFilterChange("all")
          }}
          className="cursor-pointer"
        >
          Anyone
          {assigneeFilter === "all" && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        {myId && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              onAssigneeFilterChange("mine")
            }}
            className="cursor-pointer"
          >
            <UserRound className="size-4" strokeWidth={1.75} />
            Mine
            {assigneeFilter === "mine" && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onAssigneeFilterChange("unassigned")
          }}
          className="cursor-pointer"
        >
          Unassigned
          {assigneeFilter === "unassigned" && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        {members.length > 0 && <div className="my-1 h-px bg-border" />}
        {members.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={(e) => {
              e.preventDefault()
              onAssigneeFilterChange(m.id)
            }}
            className="cursor-pointer"
          >
            <MemberAvatar member={m} size={20} />
            <span className="truncate">{m.name}</span>
            {assigneeFilter === m.id && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Tiny uppercase header used inside the Filters menu to delimit Type and
// Assignee sections. Pulled out so both groups read identically.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-1 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

function SortMenu({
  value,
  onChange,
  compact
}: {
  value: SortKey
  onChange: (k: SortKey) => void
  compact: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={TOOLBAR_BUTTON_CLASS}
          aria-label={`Sort tickets (${SORTS[value].label})`}
        >
          <ArrowDownAZ className="size-4" strokeWidth={1.75} />
          <CollapsingLabel show={!compact}>{SORTS[value].label}</CollapsingLabel>
          <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-44">
        {(Object.keys(SORTS) as SortKey[]).map((k) => (
          <DropdownMenuItem
            key={k}
            onSelect={() => onChange(k)}
            className="cursor-pointer"
          >
            {SORTS[k].label}
            {value === k && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// --- List + rows -----------------------------------------------------------

function FilteredList({
  slug,
  tickets,
  query,
  statusFilter,
  typeFilter,
  assigneeFilter,
  sortKey,
  expandedId,
  onExpand,
  members
}: {
  slug: string
  tickets: ReadonlyArray<Ticket>
  query: string
  statusFilter: TicketStatus | "all"
  typeFilter: TicketType | "all"
  // Already resolved at the parent — "mine" has been mapped to the viewer's
  // id (or "unassigned" if not signed in). Keeps the filter loop dumb.
  assigneeFilter: "all" | "unassigned" | string
  sortKey: SortKey
  expandedId: TicketId | null
  onExpand: (id: TicketId | null) => void
  members: ReadonlyArray<Member>
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tickets
      .filter((t) => statusFilter === "all" || t.status === statusFilter)
      .filter((t) => typeFilter === "all" || t.type === typeFilter)
      .filter((t) =>
        assigneeFilter === "all"
          ? true
          : assigneeFilter === "unassigned"
            ? t.assignee === null
            : t.assignee === assigneeFilter
      )
      .filter((t) => {
        if (!q) return true
        return (
          t.title.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q)
        )
      })
      .slice()
      .sort(SORTS[sortKey].compare)
  }, [tickets, query, statusFilter, typeFilter, assigneeFilter, sortKey])

  if (tickets.length === 0) {
    return <NoTicketsYet />
  }
  if (filtered.length === 0) {
    return <Empty>No tickets match your filters.</Empty>
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-background">
      {filtered.map((t) => (
        <li key={t.id}>
          <Row
            slug={slug}
            ticket={t}
            members={members}
            isExpanded={expandedId === t.id}
            onToggle={() => onExpand(expandedId === t.id ? null : t.id)}
          />
        </li>
      ))}
    </ul>
  )
}

function Row({
  slug,
  ticket,
  members,
  isExpanded,
  onToggle
}: {
  slug: string
  ticket: Ticket
  members: ReadonlyArray<Member>
  isExpanded: boolean
  onToggle: () => void
}) {
  const assignee = ticket.assignee
    ? (members.find((m) => m.id === ticket.assignee) ?? null)
    : null
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className={cn(
          // px-3 + size-6 status button → leading icon center sits in the
          // same column as the create row's type button and the search bar's
          // Search icon. py-2.5 keeps the row a touch taller than an input
          // so the list reads as list rows, not as more form inputs.
          "flex w-full items-center gap-3 pl-3 pr-3 py-2.5 text-left transition-colors",
          isExpanded ? "bg-accent/40" : "hover:bg-accent/30"
        )}
      >
        <StatusButton slug={slug} ticket={ticket} stopPropagation />
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {ticket.id}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {ticket.title}
        </span>
        {assignee && (
          <MemberAvatar
            member={assignee}
            size={20}
            className="hidden sm:inline-grid"
          />
        )}
        <TicketGitChip slug={slug} ticketId={ticket.id} />
        <span
          className={cn(
            "hidden shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] sm:inline",
            TYPE_META[ticket.type].tint
          )}
        >
          {TYPE_META[ticket.type].label.toLowerCase()}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            isExpanded && "rotate-180"
          )}
          strokeWidth={1.75}
        />
      </button>
      {isExpanded && <Expanded slug={slug} id={ticket.id} members={members} />}
    </div>
  )
}

// --- Expanded body --------------------------------------------------------
// Loaded lazily — the row only fetches the body when it's actually opened.

function Expanded({
  slug,
  id,
  members
}: {
  slug: string
  id: TicketId
  members: ReadonlyArray<Member>
}) {
  const detail = useAtomValue(ticketAtom(ticketKey(slug, id)))
  return (
    <div className="border-t border-border/60 bg-muted/30 px-4 py-4">
      {Result.matchWithError(detail, {
        onInitial: () => (
          <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
        ),
        onError: (error) => (
          <p className="text-sm text-muted-foreground">
            Couldn't load detail: {error._tag}
          </p>
        ),
        onDefect: (defect) => (
          <p className="text-sm text-muted-foreground">
            Something went wrong: {String(defect)}
          </p>
        ),
        onSuccess: ({ value }) => (
          <ExpandedDetail slug={slug} ticket={value} members={members} />
        )
      })}
    </div>
  )
}

function ExpandedDetail({
  slug,
  ticket,
  members
}: {
  slug: string
  ticket: TicketDetail
  members: ReadonlyArray<Member>
}) {
  const update = useAtomSet(updateTicketAtom)
  const remove = useAtomSet(deleteTicketAtom)
  const [bodyStatus, setBodyStatus] = useState<SaveStatus>("idle")
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TitleField slug={slug} ticket={ticket} />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <TypeButton slug={slug} ticket={ticket} />
            <AssigneePicker
              slug={slug}
              ticket={ticket}
              members={members}
            />
            <span>·</span>
            <span title={ticket.createdAt.toLocaleString()}>
              created {ticket.createdAt.toLocaleDateString()}
            </span>
            <span>·</span>
            <span title={ticket.updatedAt.toLocaleString()}>
              updated {ticket.updatedAt.toLocaleDateString()}
            </span>
          </div>
        </div>
        <SaveIndicator status={bodyStatus} />
        <button
          type="button"
          disabled={deleting}
          onClick={async () => {
            setDeleting(true)
            try {
              await remove({ slug, id: ticket.id })
              navigate({
                to: ".",
                search: (prev) => ({ ...(prev as object), ticket: undefined }),
                replace: true
              })
            } catch {
              setDeleting(false)
            }
          }}
          aria-label="Delete ticket"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring outline-none"
        >
          <Trash2 className="size-4" strokeWidth={1.75} />
        </button>
      </div>

      <ExpandedGitPanel slug={slug} ticket={ticket} />

      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <LexicalEditor
          key={`${slug}/${ticket.id}`}
          markdown={ticket.body}
          onChange={(next) => update({ slug, id: ticket.id, body: next })}
          onStatusChange={setBodyStatus}
        />
      </div>
    </div>
  )
}

// Reads project context for the github connection — only renders when a repo
// is connected, so unconnected projects don't see the panel at all.
function ExpandedGitPanel({
  slug,
  ticket
}: {
  slug: string
  ticket: TicketDetail
}) {
  const project = useProject()
  if (!project.github) return null
  return (
    <TicketGitPanel
      slug={slug}
      ticket={ticket}
      github={project.github}
      branchTemplate={null}
    />
  )
}

// --- Inline-edit pieces (extracted from the old detail page) --------------

function TitleField({ slug, ticket }: { slug: string; ticket: TicketDetail }) {
  const update = useAtomSet(updateTicketAtom)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(ticket.title)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!editing) setDraft(ticket.title)
  }, [editing, ticket.title])

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === ticket.title) {
      setEditing(false)
      setDraft(ticket.title)
      return
    }
    setSaving(true)
    try {
      await update({ slug, id: ticket.id, title: trimmed })
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }
  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      void commit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      setDraft(ticket.title)
      setEditing(false)
    }
  }
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="-mx-1 truncate rounded px-1 text-left text-base font-semibold tracking-tight hover:bg-accent/40"
      >
        {ticket.title}
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={handleKey}
      className="-mx-1 w-full rounded bg-transparent px-1 text-base font-semibold tracking-tight outline-none ring-2 ring-ring/50"
      maxLength={200}
      aria-label="Ticket title"
    />
  )
}

function TypeButton({
  slug,
  ticket
}: {
  slug: string
  ticket: { id: TicketId; type: TicketType }
}) {
  const update = useAtomSet(updateTicketAtom)
  const meta = TYPE_META[ticket.type]
  const Icon = meta.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Type: ${meta.label}. Click to change.`}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
          <span>{meta.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-40">
        {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
          const m = TYPE_META[t]
          const TIcon = m.icon
          return (
            <DropdownMenuItem
              key={t}
              onSelect={() => {
                if (t === ticket.type) return
                update({ slug, id: ticket.id, type: t })
              }}
              className="cursor-pointer"
            >
              <TIcon className="size-4" strokeWidth={1.75} />
              {m.label}
              {t === ticket.type && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AssigneePicker({
  slug,
  ticket,
  members
}: {
  slug: string
  ticket: { id: TicketId; assignee: string | null }
  members: ReadonlyArray<Member>
}) {
  const update = useAtomSet(updateTicketAtom)
  const assignee = ticket.assignee
    ? (members.find((m) => m.id === ticket.assignee) ?? null)
    : null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            assignee
              ? `Assigned to ${assignee.name}. Click to change.`
              : "Unassigned. Click to assign."
          }
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
        >
          {assignee ? (
            <>
              <MemberAvatar member={assignee} size={18} />
              <span>{assignee.name}</span>
            </>
          ) : (
            <>
              <UserRound className="size-3.5" strokeWidth={1.75} />
              <span>Unassigned</span>
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-56">
        <DropdownMenuItem
          onSelect={() => {
            if (ticket.assignee !== null) {
              update({ slug, id: ticket.id, assignee: null })
            }
          }}
          className="cursor-pointer"
        >
          <UserRound className="size-4" strokeWidth={1.75} />
          Unassigned
          {ticket.assignee === null && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        {members.length > 0 && <div className="my-1 h-px bg-border" />}
        {members.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => {
              if (ticket.assignee !== m.id) {
                update({ slug, id: ticket.id, assignee: m.id })
              }
            }}
            className="cursor-pointer"
          >
            <MemberAvatar member={m} size={20} />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm">{m.name}</div>
              {m.username && (
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  @{m.username}
                </div>
              )}
            </div>
            {ticket.assignee === m.id && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StatusButton({
  slug,
  ticket,
  stopPropagation
}: {
  slug: string
  ticket: { id: TicketId; status: TicketStatus }
  stopPropagation?: boolean
}) {
  const update = useAtomSet(updateTicketAtom)
  const meta = STATUS_META[ticket.status]
  const Icon = meta.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => stopPropagation && e.stopPropagation()}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-accent",
            meta.className
          )}
          aria-label={`Status: ${meta.label}. Click to change.`}
          title={meta.label}
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-44">
        {(Object.keys(STATUS_META) as TicketStatus[]).map((status) => {
          const m = STATUS_META[status]
          const SIcon = m.icon
          return (
            <DropdownMenuItem
              key={status}
              onSelect={() => {
                if (status === ticket.status) return
                update({ slug, id: ticket.id, status })
              }}
              className="cursor-pointer"
            >
              <SIcon className={cn("size-4", m.className)} strokeWidth={1.75} />
              {m.label}
              {status === ticket.status && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label =
    status === "saving"
      ? "Saving…"
      : status === "dirty"
        ? "Unsaved changes"
        : status === "saved"
          ? "Saved"
          : null
  if (!label) return null
  return (
    <span className="self-center text-xs text-muted-foreground tabular-nums">
      {label}
    </span>
  )
}

// Friendlier first-time empty state — matches the projects-list "no projects
// yet" treatment so empty surfaces across the app speak with one voice.
function NoTicketsYet() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-background/50 px-4 py-10 text-center">
      <div className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
        <ListChecks className="size-5" strokeWidth={1.75} />
      </div>
      <div className="text-sm font-medium">No tickets yet</div>
      <p className="max-w-xs text-xs text-muted-foreground">
        Type a title in the row above and press Enter. Each ticket becomes a
        markdown file under <span className="font-mono">tickets/</span>.
      </p>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

// `useRef` re-export silences an unused-import warning on platforms where the
// linter doesn't track JSX hook usage; safe to remove if it complains.
void useRef
