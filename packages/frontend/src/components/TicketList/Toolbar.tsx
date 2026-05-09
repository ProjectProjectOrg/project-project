import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowDownAZ,
  Check,
  ChevronDown,
  Search,
  SlidersHorizontal,
  UserRound,
  X
} from "lucide-react"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { TagChip } from "@/components/TagChip"
import { Kbd } from "@/components/ui/kbd"
import { meAtom } from "@/atoms/auth"
import {
  STATUS_LABELS,
  STATUS_META,
  TYPE_LABELS,
  TYPE_META
} from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"
import { tagsAtom, tagsKey } from "@/atoms/tags"
import {
  assigneeFilterAtom,
  queryAtom,
  searchFocusedAtom,
  selectedTagsAtom,
  sortKeyAtom,
  statusFilterAtom,
  ticketListUiKey,
  typeFilterAtom
} from "@/atoms/ticketListUi"
import { useGlobalShortcut } from "@/lib/use-global-shortcut"
import { cn } from "@/lib/utils"
import type {
  Member,
  Ticket,
  TagName,
  TicketStatus,
  TicketType
} from "@projectproject/shared"
import { SORTS, type SortKey } from "./sort"

const TOOLBAR_BUTTON_CLASS = cn(
  "inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm",
  "text-muted-foreground transition-colors hover:text-foreground",
  "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring outline-none"
)

export function Toolbar({
  orgSlug,
  slug,
  tickets,
  members
}: {
  orgSlug: string
  slug: string
  tickets: ReadonlyArray<Ticket>
  members: ReadonlyArray<Member>
}) {
  const key = ticketListUiKey(orgSlug, slug)
  const [query, setQuery] = useAtom(queryAtom(key))
  const [statusFilter, setStatusFilter] = useAtom(statusFilterAtom(key))
  const [typeFilter, setTypeFilter] = useAtom(typeFilterAtom(key))
  const [assigneeFilter, setAssigneeFilter] = useAtom(assigneeFilterAtom(key))
  const [selectedTags, setSelectedTags] = useAtom(selectedTagsAtom(key))
  const [sortKey, setSortKey] = useAtom(sortKeyAtom(key))
  const [searchFocused, setSearchFocused] = useAtom(searchFocusedAtom(key))
  const me = useAtomValue(meAtom)
  const myId = Result.isSuccess(me) ? me.value.id : null

  const compact = searchFocused || query.length > 0

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
    setQuery("")
    setStatusFilter("all")
    setTypeFilter("all")
    setAssigneeFilter("all")
    setSelectedTags([])
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
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder={m.tickets_search_placeholder()}
          aria-label={m.tickets_search_aria_label()}
        />
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setQuery("")}
            aria-label={m.tickets_search_clear_aria_label()}
            className="shrink-0 rounded-xl"
          >
            <X strokeWidth={1.75} />
          </Button>
        ) : !compact ? (
          <Kbd>/</Kbd>
        ) : null}
      </InputGroup>

      <div className="flex flex-wrap items-center gap-2">
        <StatusChips
          value={statusFilter}
          onChange={setStatusFilter}
          counts={counts}
          compact={statusCompact}
        />

        <FiltersMenu
          orgSlug={orgSlug}
          slug={slug}
          members={members}
          myId={myId}
          compact={controlsCompact}
        />

        <SortMenu
          value={sortKey}
          onChange={setSortKey}
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
              title={m.tickets_filters_clear_all()}
              aria-label={m.tickets_filters_clear_all()}
            >
              <X className="size-4 shrink-0" strokeWidth={1.75} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

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
    { key: "all", label: m.tickets_status_all(), badge: counts.all },
    ...(Object.keys(STATUS_META) as TicketStatus[]).map((s) => ({
      key: s,
      label: STATUS_LABELS[s](),
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
            compact
              ? m.tickets_status_chip_aria_label({
                  label: item.label,
                  count: counts[item.key]
                })
              : undefined
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
  orgSlug,
  slug,
  members,
  myId,
  compact
}: {
  orgSlug: string
  slug: string
  members: ReadonlyArray<Member>
  myId: string | null
  compact: boolean
}) {
  const key = ticketListUiKey(orgSlug, slug)
  const [typeFilter, setTypeFilter] = useAtom(typeFilterAtom(key))
  const [assigneeFilter, setAssigneeFilter] = useAtom(assigneeFilterAtom(key))
  const [selectedTags, setSelectedTags] = useAtom(selectedTagsAtom(key))
  const tags = useAtomValue(tagsAtom(tagsKey(orgSlug, slug)))
  const tagList = Result.isSuccess(tags) ? tags.value : []
  const toggleTag = (name: TagName) => {
    setSelectedTags(
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
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              TOOLBAR_BUTTON_CLASS,
              active && "bg-accent text-foreground hover:text-foreground"
            )}
            aria-label={
              compact && activeCount > 0
                ? m.tickets_filters_active_aria_label({ count: activeCount })
                : m.tickets_filters_aria_label()
            }
            aria-pressed={active}
          >
            <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            <CollapsingLabel show={!compact}>
              {m.tickets_filters_label()}
            </CollapsingLabel>
            {activeCount > 0 && (
              <span className="rounded-full bg-foreground/10 px-1.5 font-mono text-[10px] tabular-nums text-foreground">
                {activeCount}
              </span>
            )}
            <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-56"
        finalFocus={false}
      >
        <SectionLabel>{m.tickets_filters_section_type()}</SectionLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            setTypeFilter("all")
          }}
          className="cursor-pointer"
        >
          {m.tickets_filters_all_types()}
          {typeFilter === "all" && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
          const meta = TYPE_META[t]
          const TIcon = meta.icon
          return (
            <DropdownMenuItem
              key={t}
              onSelect={(e) => {
                e.preventDefault()
                setTypeFilter(t)
              }}
              className="cursor-pointer"
            >
              <TIcon className="size-4" strokeWidth={1.75} />
              {TYPE_LABELS[t]()}
              {typeFilter === t && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}

        <div className="my-1 h-px bg-border" />
        <SectionLabel>{m.tickets_filters_section_assignee()}</SectionLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            setAssigneeFilter("all")
          }}
          className="cursor-pointer"
        >
          {m.tickets_filters_assignee_anyone()}
          {assigneeFilter === "all" && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        {myId && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setAssigneeFilter("mine")
            }}
            className="cursor-pointer"
          >
            <UserRound className="size-4" strokeWidth={1.75} />
            {m.tickets_filters_assignee_mine()}
            {assigneeFilter === "mine" && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            setAssigneeFilter("unassigned")
          }}
          className="cursor-pointer"
        >
          {m.tickets_filters_assignee_unassigned()}
          {assigneeFilter === "unassigned" && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        {members.length > 0 && <div className="my-1 h-px bg-border" />}
        {members.map((member) => (
          <DropdownMenuItem
            key={member.id}
            onSelect={(e) => {
              e.preventDefault()
              setAssigneeFilter(member.id)
            }}
            className="cursor-pointer"
          >
            <MemberAvatar member={member} size={20} />
            <span className="truncate">{member.name}</span>
            {assigneeFilter === member.id && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ))}

        {tagList.length > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            <SectionLabel>{m.tickets_filters_section_tags()}</SectionLabel>
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
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={TOOLBAR_BUTTON_CLASS}
            aria-label={m.tickets_sort_aria_label({
              label: SORTS[value].label()
            })}
          >
            <ArrowDownAZ className="size-4" strokeWidth={1.75} />
            <CollapsingLabel show={!compact}>
              {SORTS[value].label()}
            </CollapsingLabel>
            <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-44">
        {(Object.keys(SORTS) as SortKey[]).map((k) => (
          <DropdownMenuItem
            key={k}
            onSelect={() => onChange(k)}
            className="cursor-pointer"
          >
            {SORTS[k].label()}
            {value === k && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
