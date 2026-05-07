import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  CollapsingLabel,
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { AvatarStack, MemberAvatar } from "@/components/MemberAvatar"
import { Hitbox } from "@/components/ui/hitbox"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@/components/ui/input-group"
import {
  ArrowDownAZ,
  Check,
  ChevronDown,
  ListChecks,
  Search,
  SlidersHorizontal,
  UserRound,
  X
} from "lucide-react"
import { STATUS_META, TYPE_META } from "@/lib/ticket-meta"
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority-meta"
import {
  deleteTicketAtom,
  ticketAtom,
  ticketKey,
  ticketsListAtom,
  ticketsListKey,
  updateTicketAtom
} from "@/atoms/tickets"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { CommentsSection } from "./Comments/CommentsSection"
import { MentionScopeProvider } from "@/mentions/scope"
import { CreateTicketRow } from "@/components/CreateTicketRow"
import { TagChip } from "@/components/TagChip"
import { TagEditor } from "@/components/TagEditor"
import { tagsAtom, tagsKey } from "@/atoms/tags"
import { TicketGitChip, TicketGitPanel } from "@/components/TicketGit"
import { Button } from "@/components/ui/button"
import { ConfirmDeleteIcon } from "@/components/ConfirmDeleteIcon"
import { Kbd } from "@/components/ui/kbd"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { cn } from "@/lib/utils"
import { useGlobalShortcut } from "@/lib/use-global-shortcut"
import { meAtom } from "@/atoms/auth"
import type {
  Member,
  Ticket,
  TicketDetail,
  TicketId,
  TicketPriority,
  TicketStatus,
  TicketType,
  TagName
} from "@projectproject/shared"

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
  },
  priority: {
    label: "Priority (high → low)",
    compare: (a: Ticket, b: Ticket) =>
      PRIORITY_META[b.priority].ordinal - PRIORITY_META[a.priority].ordinal
  }
} as const
type SortKey = keyof typeof SORTS

function idNum(t: Ticket): number {
  return Number(t.id.slice(2))
}

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
            <Empty>Couldn't load tickets: {error._tag}</Empty>
          ),
          onDefect: (defect) => (
            <Empty>Something went wrong: {String(defect)}</Empty>
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

function Toolbar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  typeFilter,
  onTypeFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  selectedTags,
  onSelectedTagsChange,
  sortKey,
  onSortChange,
  tickets,
  members,
  myId,
  orgSlug,
  slug,
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
  selectedTags: ReadonlyArray<TagName>
  onSelectedTagsChange: (next: ReadonlyArray<TagName>) => void
  sortKey: SortKey
  onSortChange: (k: SortKey) => void
  tickets: ReadonlyArray<Ticket>
  members: ReadonlyArray<Member>
  myId: string | null
  orgSlug: string
  slug: string
  compact: boolean
  onSearchFocusChange: (focused: boolean) => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  useGlobalShortcut("/", searchRef)

  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const next = Math.round(entry.contentRect.width)
      setWidth((w) => (w === next ? w : next))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const hasActiveFilters =
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    assigneeFilter !== "all" ||
    selectedTags.length > 0 ||
    query.length > 0

  const clearAll = () => {
    onQueryChange("")
    onStatusFilterChange("all")
    onTypeFilterChange("all")
    onAssigneeFilterChange("all")
    onSelectedTagsChange([])
  }
  const counts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const resolved =
      assigneeFilter === "mine" ? (myId ?? "unassigned") : assigneeFilter
    const matchesOtherFilters = (t: Ticket) =>
      (typeFilter === "all" || t.type === typeFilter) &&
      (resolved === "all" ||
        (resolved === "unassigned"
          ? t.assignees.length === 0
          : t.assignees.includes(resolved))) &&
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

  const FULL_FITS_ROW = 1040
  const STATUS_COMPACT_FITS_ROW = 760
  const ALL_COMPACT_FITS_ROW = 600
  const STATUS_COMPACT_FITS_WRAPPED = 540
  const measured = width > 0
  const onSameRow = measured && width >= ALL_COMPACT_FITS_ROW
  const statusCompact = measured
    ? onSameRow
      ? compact || width < FULL_FITS_ROW
      : true
    : false
  const controlsCompact = measured
    ? onSameRow
      ? compact || width < STATUS_COMPACT_FITS_ROW
      : width < STATUS_COMPACT_FITS_WRAPPED
    : false

  return (
    <div
      ref={containerRef}
      className="flex flex-wrap items-center gap-x-2 gap-y-2"
    >
      <InputGroup className="min-w-0 flex-1 basis-[220px]">
        <InputGroupAddon>
          <Search className="size-4" strokeWidth={1.75} />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => onSearchFocusChange(true)}
          onBlur={() => onSearchFocusChange(false)}
          placeholder="Search tickets by title or id…"
          aria-label="Search tickets"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Clear search"
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        ) : !compact ? (
          <Kbd>/</Kbd>
        ) : null}
      </InputGroup>

      <div className="flex flex-wrap items-center gap-2">
        <StatusChips
          value={statusFilter}
          onChange={onStatusFilterChange}
          counts={counts}
          compact={statusCompact}
        />

        <FiltersMenu
          typeFilter={typeFilter}
          onTypeFilterChange={onTypeFilterChange}
          assigneeFilter={assigneeFilter}
          onAssigneeFilterChange={onAssigneeFilterChange}
          selectedTags={selectedTags}
          onSelectedTagsChange={onSelectedTagsChange}
          members={members}
          myId={myId}
          orgSlug={orgSlug}
          slug={slug}
          compact={controlsCompact}
        />

        <SortMenu
          value={sortKey}
          onChange={onSortChange}
          compact={controlsCompact}
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
  )
}

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
    ...(Object.keys(STATUS_META) as TicketStatus[]).map((s) => ({
      key: s,
      label: STATUS_META[s].label,
      icon: STATUS_META[s].icon,
      iconClassName: STATUS_META[s].className,
      badge: counts[s]
    }))
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

function FiltersMenu({
  typeFilter,
  onTypeFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  selectedTags,
  onSelectedTagsChange,
  members,
  myId,
  orgSlug,
  slug,
  compact
}: {
  typeFilter: TicketType | "all"
  onTypeFilterChange: (v: TicketType | "all") => void
  assigneeFilter: string
  onAssigneeFilterChange: (v: string) => void
  selectedTags: ReadonlyArray<TagName>
  onSelectedTagsChange: (next: ReadonlyArray<TagName>) => void
  members: ReadonlyArray<Member>
  myId: string | null
  orgSlug: string
  slug: string
  compact: boolean
}) {
  const tags = useAtomValue(tagsAtom(tagsKey(orgSlug, slug)))
  const tagList = Result.isSuccess(tags) ? tags.value : []
  const toggleTag = (name: TagName) => {
    onSelectedTagsChange(
      selectedTags.includes(name)
        ? selectedTags.filter((t) => t !== name)
        : [...selectedTags, name]
    )
  }
  const activeCount =
    (typeFilter !== "all" ? 1 : 0) +
    (assigneeFilter !== "all" ? 1 : 0) +
    (selectedTags.length > 0 ? 1 : 0)
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

        {tagList.length > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            <SectionLabel>Tags</SectionLabel>
            <div className="flex flex-wrap gap-1 px-2 pb-1.5 pt-0.5">
              {tagList.map((tag) => {
                const selected = selectedTags.includes(tag.name)
                return (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      toggleTag(tag.name)
                    }}
                    aria-pressed={selected}
                    className="rounded-md outline-none transition-transform duration-100 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
                  >
                    <TagChip
                      name={tag.name}
                      color={tag.color ?? null}
                      size="xs"
                      intensity={selected ? "strong" : "soft"}
                      className={cn(!selected && "opacity-60")}
                    />
                  </button>
                )
              })}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
          <CollapsingLabel show={!compact}>
            {SORTS[value].label}
          </CollapsingLabel>
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

function FilteredList({
  orgSlug,
  slug,
  tickets,
  query,
  onClearSearch,
  statusFilter,
  typeFilter,
  assigneeFilter,
  selectedTags,
  sortKey,
  expandedId,
  onExpand,
  focusBody,
  onConsumeFocusBody,
  members
}: {
  orgSlug: string
  slug: string
  tickets: ReadonlyArray<Ticket>
  query: string
  onClearSearch: () => void
  statusFilter: TicketStatus | "all"
  typeFilter: TicketType | "all"
  assigneeFilter: "all" | "unassigned" | string
  selectedTags: ReadonlyArray<TagName>
  sortKey: SortKey
  expandedId: TicketId | null
  onExpand: (id: TicketId | null) => void
  focusBody: boolean
  onConsumeFocusBody: () => void
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
            ? t.assignees.length === 0
            : t.assignees.includes(assigneeFilter)
      )
      .filter((t) => selectedTags.every((sel) => t.tags.includes(sel)))
      .filter((t) => {
        if (!q) return true
        return (
          t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
        )
      })
      .slice()
      .sort(SORTS[sortKey].compare)
  }, [
    tickets,
    query,
    statusFilter,
    typeFilter,
    assigneeFilter,
    selectedTags,
    sortKey
  ])

  if (tickets.length === 0) {
    return <NoTicketsYet />
  }
  if (filtered.length === 0) {
    if (query.trim().length > 0) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          <span>
            No tickets match{" "}
            <span className="font-mono text-foreground">"{query}"</span>.
          </span>
          <Button
            type="button"
            variant="tertiary"
            size="xs"
            leadingIcon={X}
            onClick={onClearSearch}
          >
            Clear search
          </Button>
        </div>
      )
    }
    return <Empty>No tickets match your filters.</Empty>
  }

  return (
    <ul className="grid grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto_auto_auto] divide-y divide-border rounded-xl border border-border bg-background">
      {filtered.map((t) => {
        const isExpanded = expandedId === t.id
        return (
          <li
            key={t.id}
            data-expanded={isExpanded || undefined}
            className="col-span-full grid grid-cols-subgrid transition-opacity duration-200 ease-out [ul:has(>li[data-expanded])>&:not([data-expanded])]:opacity-40 [ul:has(>li[data-expanded])>&:not([data-expanded]):hover]:opacity-100"
          >
            <Row
              orgSlug={orgSlug}
              slug={slug}
              ticket={t}
              members={members}
              isExpanded={isExpanded}
              onToggle={() => onExpand(isExpanded ? null : t.id)}
              focusBody={focusBody && isExpanded}
              onConsumeFocusBody={onConsumeFocusBody}
            />
          </li>
        )
      })}
    </ul>
  )
}

function Row({
  orgSlug,
  slug,
  ticket,
  members,
  isExpanded,
  onToggle,
  focusBody,
  onConsumeFocusBody
}: {
  orgSlug: string
  slug: string
  ticket: Ticket
  members: ReadonlyArray<Member>
  isExpanded: boolean
  onToggle: () => void
  focusBody: boolean
  onConsumeFocusBody: () => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusBody || !isExpanded) return
    rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focusBody, isExpanded])
  return (
    <div ref={rowRef} className="col-span-full grid grid-cols-subgrid">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className={cn(
          "col-span-full grid grid-cols-subgrid items-center gap-3 px-3 py-2.5 text-left transition-colors",
          isExpanded ? "bg-accent/40" : "hover:bg-accent/30"
        )}
      >
        <StatusButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          stopPropagation
        />
        <PriorityButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          stopPropagation
        />
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {ticket.id}
        </span>
        <span className="min-w-0 truncate text-sm font-medium">
          {ticket.title}
        </span>
        <AssigneeRowTrigger
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          members={members}
          className="hidden sm:inline-flex"
        />
        <TicketGitChip orgSlug={orgSlug} slug={slug} ticketId={ticket.id} />
        <TypeButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          className="hidden sm:inline-flex"
        />
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            isExpanded && "rotate-180"
          )}
          strokeWidth={1.75}
        />
      </button>
      {isExpanded && (
        <div className="col-span-full">
          <Expanded
            orgSlug={orgSlug}
            slug={slug}
            id={ticket.id}
            members={members}
            focusBody={focusBody}
            onConsumeFocusBody={onConsumeFocusBody}
          />
        </div>
      )}
    </div>
  )
}

function Expanded({
  orgSlug,
  slug,
  id,
  members,
  focusBody,
  onConsumeFocusBody
}: {
  orgSlug: string
  slug: string
  id: TicketId
  members: ReadonlyArray<Member>
  focusBody: boolean
  onConsumeFocusBody: () => void
}) {
  const detail = useAtomValue(ticketAtom(ticketKey(orgSlug, slug, id)))
  return (
    <div className="border-t border-border/60 bg-muted/30 px-4 py-4">
      {Result.matchWithError(detail, {
        onInitial: () => (
          <div className="skeleton h-24 rounded-lg bg-muted/60" />
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
          <ExpandedDetail
            orgSlug={orgSlug}
            slug={slug}
            ticket={value}
            members={members}
            focusBody={focusBody}
            onConsumeFocusBody={onConsumeFocusBody}
          />
        )
      })}
    </div>
  )
}

function ExpandedDetail({
  orgSlug,
  slug,
  ticket,
  members,
  focusBody,
  onConsumeFocusBody
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  focusBody: boolean
  onConsumeFocusBody: () => void
}) {
  const update = useAtomSet(updateTicketAtom)
  const remove = useAtomSet(deleteTicketAtom)
  const [bodyStatus, setBodyStatus] = useState<SaveStatus>("idle")
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()
  const autoFocusBody = useRef(focusBody).current
  useEffect(() => {
    if (focusBody) onConsumeFocusBody()
  }, [focusBody, onConsumeFocusBody])

  const project = useProject()
  const me = useAtomValue(meAtom)
  const myRole = Result.isSuccess(me)
    ? (project.members.find((m) => m.id === me.value.id)?.role ?? "member")
    : "member"
  const canManageTags = myRole === "owner" || myRole === "admin"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TitleField orgSlug={orgSlug} slug={slug} ticket={ticket} />
        </div>
        <SaveIndicator status={bodyStatus} />
        <ConfirmDeleteIcon
          ariaLabel="Delete ticket"
          message="Delete this ticket?"
          disabled={deleting}
          onConfirm={async () => {
            setDeleting(true)
            try {
              await remove({ orgSlug, slug, id: ticket.id })
              navigate({
                to: ".",
                search: (prev) => ({ ...(prev as object), ticket: undefined }),
                replace: true
              })
            } catch (e) {
              setDeleting(false)
              throw e
            }
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <PriorityBadgeTrigger orgSlug={orgSlug} slug={slug} ticket={ticket} />
        <TypeBadgeTrigger orgSlug={orgSlug} slug={slug} ticket={ticket} />
        <AssigneePicker
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          members={members}
        />
        <span className="ml-auto flex items-center gap-2">
          <span title={ticket.createdAt.toLocaleString()}>
            created {ticket.createdAt.toLocaleDateString()}
          </span>
          <span>·</span>
          <span title={ticket.updatedAt.toLocaleString()}>
            updated {ticket.updatedAt.toLocaleDateString()}
          </span>
        </span>
      </div>

      <TagEditor
        orgSlug={orgSlug}
        slug={slug}
        ticket={ticket}
        canManageTags={canManageTags}
      />

      <ExpandedGitPanel orgSlug={orgSlug} slug={slug} ticket={ticket} />

      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <MentionScopeProvider scope={{ orgSlug, slug }}>
          <LexicalEditor
            key={`${slug}/${ticket.id}`}
            markdown={ticket.body}
            onChange={(next) =>
              update({ orgSlug, slug, id: ticket.id, body: next })
            }
            onStatusChange={setBodyStatus}
            autoFocus={autoFocusBody}
          />
        </MentionScopeProvider>
      </div>

      <CommentsSection orgSlug={orgSlug} slug={slug} ticketId={ticket.id} />
    </div>
  )
}

function ExpandedGitPanel({
  orgSlug,
  slug,
  ticket
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
}) {
  const project = useProject()
  if (!project.github) return null
  return (
    <TicketGitPanel
      orgSlug={orgSlug}
      slug={slug}
      ticket={ticket}
      github={project.github}
      branchTemplate={null}
    />
  )
}

function TitleField({
  orgSlug,
  slug,
  ticket
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
}) {
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
      await update({ orgSlug, slug, id: ticket.id, title: trimmed })
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
        className="-mx-1 truncate rounded px-1 text-left text-base font-semibold tracking-tight transition-colors hover:bg-accent/40"
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

function TypeBadgeTrigger({
  orgSlug,
  slug,
  ticket,
  className
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; type: TicketType }
  className?: string
}) {
  const update = useAtomSet(updateTicketAtom)
  const meta = TYPE_META[ticket.type]
  const Icon = meta.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Type: ${meta.label}. Click to change.`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground",
            className
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
          <span>{meta.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-40"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
          const m = TYPE_META[t]
          const TIcon = m.icon
          return (
            <DropdownMenuItem
              key={t}
              onSelect={() => {
                if (t === ticket.type) return
                update({ orgSlug, slug, id: ticket.id, type: t })
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

function TypeButton({
  orgSlug,
  slug,
  ticket,
  className
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; type: TicketType }
  className?: string
}) {
  const update = useAtomSet(updateTicketAtom)
  const meta = TYPE_META[ticket.type]
  const Icon = meta.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Type: ${meta.label}. Click to change.`}
          className={className}
        >
          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors group-hover/hitbox:bg-accent group-hover/hitbox:text-foreground">
            <Icon className="size-3.5" strokeWidth={1.75} />
            <span>{meta.label}</span>
          </span>
        </Hitbox>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-40"
        onClick={(e) => e.stopPropagation()}
      >
        {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
          const m = TYPE_META[t]
          const TIcon = m.icon
          return (
            <DropdownMenuItem
              key={t}
              onSelect={() => {
                if (t === ticket.type) return
                update({ orgSlug, slug, id: ticket.id, type: t })
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

function AssigneeMenuContent({
  orgSlug,
  slug,
  ticket,
  members
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; assignees: ReadonlyArray<string> }
  members: ReadonlyArray<Member>
}) {
  const update = useAtomSet(updateTicketAtom)
  const assignees = ticket.assignees
  const setAssignees = (next: ReadonlyArray<string>) => {
    update({ orgSlug, slug, id: ticket.id, assignees: next })
  }
  const toggle = (id: string) => {
    setAssignees(
      assignees.includes(id)
        ? assignees.filter((a) => a !== id)
        : [...assignees, id]
    )
  }
  return (
    <DropdownMenuContent
      align="start"
      sideOffset={6}
      className="w-56"
      onClick={(e) => e.stopPropagation()}
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault()
          if (assignees.length > 0) setAssignees([])
        }}
        className="cursor-pointer"
      >
        <UserRound className="size-4" strokeWidth={1.75} />
        Unassigned
        {assignees.length === 0 && (
          <Check className="ml-auto size-3.5 text-muted-foreground" />
        )}
      </DropdownMenuItem>
      {members.length > 0 && <div className="my-1 h-px bg-border" />}
      {members.map((m) => {
        const selected = assignees.includes(m.id)
        return (
          <DropdownMenuItem
            key={m.id}
            onSelect={(e) => {
              e.preventDefault()
              toggle(m.id)
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
            {selected && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )
      })}
    </DropdownMenuContent>
  )
}

function AssigneePicker({
  orgSlug,
  slug,
  ticket,
  members
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; assignees: ReadonlyArray<string> }
  members: ReadonlyArray<Member>
}) {
  const resolved = ticket.assignees
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is Member => !!m)
  const label =
    resolved.length === 0
      ? "Unassigned"
      : resolved.length === 1
        ? resolved[0].name
        : `${resolved.length} people`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Assignees: ${label}. Click to change.`}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
        >
          {resolved.length === 0 ? (
            <UserRound className="size-3.5" strokeWidth={1.75} />
          ) : resolved.length === 1 ? (
            <MemberAvatar member={resolved[0]} size={18} />
          ) : (
            <AvatarStack subjects={resolved} size={18} max={3} />
          )}
          <span>{label}</span>
        </button>
      </DropdownMenuTrigger>
      <AssigneeMenuContent
        orgSlug={orgSlug}
        slug={slug}
        ticket={ticket}
        members={members}
      />
    </DropdownMenu>
  )
}

function AssigneeRowTrigger({
  orgSlug,
  slug,
  ticket,
  members,
  className
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; assignees: ReadonlyArray<string> }
  members: ReadonlyArray<Member>
  className?: string
}) {
  const resolved = ticket.assignees
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is Member => !!m)
  const label =
    resolved.length === 0
      ? "Unassigned. Click to assign."
      : resolved.length === 1
        ? `Assigned to ${resolved[0].name}. Click to change.`
        : `${resolved.length} people assigned. Click to change.`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => e.stopPropagation()}
          aria-label={label}
          className={className}
        >
          <span className="inline-flex items-center text-muted-foreground transition-colors group-hover/hitbox:text-foreground">
            {resolved.length === 0 ? (
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted">
                <UserRound className="size-3" strokeWidth={1.75} />
              </span>
            ) : resolved.length === 1 ? (
              <MemberAvatar member={resolved[0]} size={20} />
            ) : (
              <AvatarStack subjects={resolved} size={20} max={3} />
            )}
          </span>
        </Hitbox>
      </DropdownMenuTrigger>
      <AssigneeMenuContent
        orgSlug={orgSlug}
        slug={slug}
        ticket={ticket}
        members={members}
      />
    </DropdownMenu>
  )
}

function StatusButton({
  orgSlug,
  slug,
  ticket,
  stopPropagation
}: {
  orgSlug: string
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
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => stopPropagation && e.stopPropagation()}
          aria-label={`Status: ${meta.label}. Click to change.`}
          title={meta.label}
        >
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full transition-colors group-hover/hitbox:bg-accent",
              meta.className
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </span>
        </Hitbox>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-44"
        onClick={(e) => e.stopPropagation()}
      >
        {(Object.keys(STATUS_META) as TicketStatus[]).map((status) => {
          const m = STATUS_META[status]
          const SIcon = m.icon
          return (
            <DropdownMenuItem
              key={status}
              onSelect={() => {
                if (status === ticket.status) return
                update({ orgSlug, slug, id: ticket.id, status })
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

function PriorityButton({
  orgSlug,
  slug,
  ticket,
  stopPropagation
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; priority: TicketPriority }
  stopPropagation?: boolean
}) {
  const update = useAtomSet(updateTicketAtom)
  const meta = PRIORITY_META[ticket.priority]
  const Icon = meta.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => stopPropagation && e.stopPropagation()}
          aria-label={`Priority: ${meta.label}. Click to change.`}
          title={meta.label}
        >
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full transition-colors group-hover/hitbox:bg-accent",
              meta.className
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </span>
        </Hitbox>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-44"
        onClick={(e) => e.stopPropagation()}
      >
        {PRIORITY_ORDER.map((p) => {
          const m = PRIORITY_META[p]
          const PIcon = m.icon
          return (
            <DropdownMenuItem
              key={p}
              onSelect={() => {
                if (p === ticket.priority) return
                update({ orgSlug, slug, id: ticket.id, priority: p })
              }}
              className="cursor-pointer"
            >
              <PIcon className={cn("size-4", m.className)} strokeWidth={1.75} />
              {m.label}
              {p === ticket.priority && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PriorityBadgeTrigger({
  orgSlug,
  slug,
  ticket,
  className
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; priority: TicketPriority }
  className?: string
}) {
  const update = useAtomSet(updateTicketAtom)
  const meta = PRIORITY_META[ticket.priority]
  const Icon = meta.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Priority: ${meta.label}. Click to change.`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground",
            className
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
          <span>{meta.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-40"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        {PRIORITY_ORDER.map((p) => {
          const m = PRIORITY_META[p]
          const PIcon = m.icon
          return (
            <DropdownMenuItem
              key={p}
              onSelect={() => {
                if (p === ticket.priority) return
                update({ orgSlug, slug, id: ticket.id, priority: p })
              }}
              className="cursor-pointer"
            >
              <PIcon className={cn("size-4", m.className)} strokeWidth={1.75} />
              {m.label}
              {p === ticket.priority && (
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

void useRef
