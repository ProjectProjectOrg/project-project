import { Result, useAtomValue } from "@effect-atom/atom-react"
import * as DateTime from "effect/DateTime"
import { useEffect, useRef, useState } from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
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
import { ticketsCountAtom, ticketsCountKey } from "@/atoms/tickets"
import {
  projectKey as sprintsProjectKey,
  sprintsListAtom
} from "@/atoms/sprints"
import {
  NATURAL_SORT_DIR,
  sprintState,
  ticketListQueryToSearch,
  type GroupId,
  type Member,
  type SortKey,
  type TagName,
  type TicketCountQuery,
  type TicketFilter,
  type TicketListQuery,
  type TicketStatus,
  type TicketType
} from "@projectproject/shared"
import { SPRINT_STATE_META } from "@/components/sprints/SprintChip"
import { useGlobalShortcut } from "@/lib/use-global-shortcut"
import { cn } from "@/lib/utils"
import { SORT_LABELS } from "./sort"
import { TICKET_SEARCH_KEYS } from "./url"

type SearchValue = string | ReadonlyArray<string> | undefined
type SearchRecord = { readonly [k: string]: SearchValue }

const TOOLBAR_BUTTON_CLASS = cn(
  "inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm",
  "text-muted-foreground transition-all duration-100 hover:text-foreground active:scale-[0.97]",
  "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring outline-none"
)

type SprintFilterValue = "all" | "unassigned" | GroupId

const pruneFilter = (f: TicketFilter | undefined): TicketFilter | undefined => {
  if (!f) return undefined
  const hasAny =
    (f.status && f.status.length > 0) ||
    (f.type && f.type.length > 0) ||
    (f.assignee && f.assignee.length > 0) ||
    (f.tags && f.tags.length > 0) ||
    (f.groupId && f.groupId.length > 0) ||
    f.hasBranch !== undefined ||
    f.hasPr !== undefined ||
    f.updatedAfter !== undefined
  return hasAny ? f : undefined
}

export function Toolbar({
  orgSlug,
  slug,
  query,
  members,
  showSprintFilter = false
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  showSprintFilter?: boolean
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const me = useAtomValue(meAtom)
  const myId = Result.isSuccess(me) ? me.value.id : null

  const filter = query.filter
  const status: TicketStatus | "all" =
    filter?.status?.length === 1 ? filter.status[0]! : "all"
  const typeFilter: TicketType | "all" =
    filter?.type?.length === 1 ? filter.type[0]! : "all"
  const assigneeFilter: string =
    filter?.assignee?.length === 1
      ? filter.assignee[0] === null
        ? "unassigned"
        : (filter.assignee[0] as string)
      : "all"
  const selectedTags: ReadonlyArray<TagName> =
    (filter?.tags as ReadonlyArray<TagName> | undefined) ?? []
  const sprintFilter: SprintFilterValue =
    filter?.groupId?.length === 1
      ? filter.groupId[0] === null
        ? "unassigned"
        : (filter.groupId[0] as SprintFilterValue)
      : "all"
  const sortKey: SortKey = query.sort.key
  const queryStr = query.q ?? ""

  const updateQuery = (next: TicketListQuery) => {
    const nextSearch = ticketListQueryToSearch({ ...next, cursor: undefined })
    void navigate({
      to: router.state.location.pathname,
      search: (prev: SearchRecord): SearchRecord => {
        const cleared: { [k: string]: SearchValue } = { ...prev }
        for (const k of TICKET_SEARCH_KEYS) cleared[k] = undefined
        return { ...cleared, ...nextSearch }
      },
      replace: true
    })
  }

  const setStatus = (s: TicketStatus | "all") => {
    const nextFilter: TicketFilter = {
      ...filter,
      status: s === "all" ? undefined : [s]
    }
    updateQuery({ ...query, filter: pruneFilter(nextFilter) })
  }

  const setTypeFilter = (t: TicketType | "all") => {
    const nextFilter: TicketFilter = {
      ...filter,
      type: t === "all" ? undefined : [t]
    }
    updateQuery({ ...query, filter: pruneFilter(nextFilter) })
  }

  const setAssigneeFilter = (a: string) => {
    let nextAssignee: TicketFilter["assignee"]
    if (a === "all") nextAssignee = undefined
    else if (a === "mine") nextAssignee = ["mine"]
    else if (a === "unassigned") nextAssignee = [null]
    else nextAssignee = [a]
    const nextFilter: TicketFilter = {
      ...filter,
      assignee: nextAssignee
    }
    updateQuery({ ...query, filter: pruneFilter(nextFilter) })
  }

  const setSelectedTags = (tags: ReadonlyArray<TagName>) => {
    const nextFilter: TicketFilter = {
      ...filter,
      tags: tags.length === 0 ? undefined : tags
    }
    updateQuery({ ...query, filter: pruneFilter(nextFilter) })
  }

  const setSprintFilter = (s: SprintFilterValue) => {
    let nextGroupId: TicketFilter["groupId"]
    if (s === "all") nextGroupId = undefined
    else if (s === "unassigned") nextGroupId = [null]
    else nextGroupId = [s]
    const nextFilter: TicketFilter = {
      ...filter,
      groupId: nextGroupId
    }
    updateQuery({ ...query, filter: pruneFilter(nextFilter) })
  }

  const setSortKey = (k: SortKey) => {
    updateQuery({
      ...query,
      sort: { key: k, dir: NATURAL_SORT_DIR[k] }
    })
  }

  const [queryInput, setQueryInput] = useState(queryStr)
  useEffect(() => {
    setQueryInput(queryStr)
  }, [queryStr])

  const latestQueryRef = useRef(query)
  useEffect(() => {
    latestQueryRef.current = query
  }, [query])

  const queryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (queryDebounceRef.current) {
        clearTimeout(queryDebounceRef.current)
        queryDebounceRef.current = null
      }
    },
    []
  )
  const setSearchQuery = (q: string) => {
    setQueryInput(q)
    if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current)
    // @effect-diagnostics-next-line globalTimers:off
    queryDebounceRef.current = setTimeout(() => {
      updateQuery({
        ...latestQueryRef.current,
        q: q.length > 0 ? q : undefined
      })
    }, 200)
  }
  const flushSearch = () => {
    if (queryDebounceRef.current) {
      clearTimeout(queryDebounceRef.current)
      queryDebounceRef.current = null
    }
    if (queryInput !== queryStr) {
      updateQuery({
        ...latestQueryRef.current,
        q: queryInput.length > 0 ? queryInput : undefined
      })
    }
  }
  const clearSearch = () => {
    setQueryInput("")
    if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current)
    updateQuery({ ...latestQueryRef.current, q: undefined })
  }

  const [searchFocused, setSearchFocused] = useState(false)
  const compact = searchFocused || queryInput.length > 0

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
    status !== "all" ||
    typeFilter !== "all" ||
    assigneeFilter !== "all" ||
    selectedTags.length > 0 ||
    (showSprintFilter && sprintFilter !== "all") ||
    queryStr.length > 0

  const clearAll = () => {
    updateQuery({ sort: query.sort })
  }

  const countQuery: TicketCountQuery = {
    filter: filter,
    q: query.q
  }
  const countsResult = useAtomValue(
    ticketsCountAtom(ticketsCountKey(orgSlug, slug, countQuery))
  )
  const previousCountsRef = useRef<Record<TicketStatus | "all", number> | null>(
    null
  )
  if (Result.isSuccess(countsResult)) {
    previousCountsRef.current = {
      all: countsResult.value.total,
      todo: countsResult.value.byStatus.todo ?? 0,
      in_progress: countsResult.value.byStatus.in_progress ?? 0,
      done: countsResult.value.byStatus.done ?? 0
    }
  }
  const counts: Record<TicketStatus | "all", number> = previousCountsRef.current ?? {
    all: 0,
    todo: 0,
    in_progress: 0,
    done: 0
  }

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
          value={queryInput}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => {
            setSearchFocused(false)
            flushSearch()
          }}
          placeholder={m.tickets_search_placeholder()}
          aria-label={m.tickets_search_aria_label()}
        />
        {queryInput ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={clearSearch}
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
          value={status}
          onChange={setStatus}
          counts={counts}
          compact={statusCompact}
        />

        <FiltersMenu
          orgSlug={orgSlug}
          slug={slug}
          members={members}
          myId={myId}
          compact={controlsCompact}
          showSprintFilter={showSprintFilter}
          typeFilter={typeFilter}
          assigneeFilter={assigneeFilter}
          selectedTags={selectedTags}
          sprintFilter={sprintFilter}
          onTypeChange={setTypeFilter}
          onAssigneeChange={setAssigneeFilter}
          onTagsChange={setSelectedTags}
          onSprintChange={setSprintFilter}
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
                "grid h-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-destructive/40 bg-destructive/10 text-destructive transition-all duration-100 active:scale-[0.97]",
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
  compact,
  showSprintFilter,
  typeFilter,
  assigneeFilter,
  selectedTags,
  sprintFilter,
  onTypeChange,
  onAssigneeChange,
  onTagsChange,
  onSprintChange
}: {
  orgSlug: string
  slug: string
  members: ReadonlyArray<Member>
  myId: string | null
  compact: boolean
  showSprintFilter: boolean
  typeFilter: TicketType | "all"
  assigneeFilter: string
  selectedTags: ReadonlyArray<TagName>
  sprintFilter: SprintFilterValue
  onTypeChange: (t: TicketType | "all") => void
  onAssigneeChange: (a: string) => void
  onTagsChange: (tags: ReadonlyArray<TagName>) => void
  onSprintChange: (s: SprintFilterValue) => void
}) {
  const tags = useAtomValue(tagsAtom(tagsKey(orgSlug, slug)))
  const tagList = Result.isSuccess(tags) ? tags.value : []
  const sprintsList = useAtomValue(
    sprintsListAtom(sprintsProjectKey(orgSlug, slug))
  )
  const allSprints = Result.isSuccess(sprintsList) ? sprintsList.value : []
  const now = DateTime.toDate(DateTime.unsafeNow())
  const sprintOptions = showSprintFilter
    ? allSprints.filter((s) => {
        const st = sprintState(s, now)
        return st === "active" || st === "planned"
      })
    : []
  const toggleTag = (name: TagName) => {
    onTagsChange(
      selectedTags.includes(name)
        ? selectedTags.filter((t) => t !== name)
        : [...selectedTags, name]
    )
  }
  const activeCount =
    (typeFilter !== "all" ? 1 : 0) +
    (assigneeFilter !== "all" ? 1 : 0) +
    (selectedTags.length > 0 ? 1 : 0) +
    (showSprintFilter && sprintFilter !== "all" ? 1 : 0)
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
          closeOnClick={false}
          onClick={() => onTypeChange("all")}
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
              closeOnClick={false}
              onClick={() => onTypeChange(t)}
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
          closeOnClick={false}
          onClick={() => onAssigneeChange("all")}
          className="cursor-pointer"
        >
          {m.tickets_filters_assignee_anyone()}
          {assigneeFilter === "all" && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        {myId && (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => onAssigneeChange("mine")}
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
          closeOnClick={false}
          onClick={() => onAssigneeChange("unassigned")}
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
            closeOnClick={false}
            onClick={() => onAssigneeChange(member.id)}
            className="cursor-pointer"
          >
            <MemberAvatar member={member} size={20} />
            <span className="truncate">{member.name}</span>
            {assigneeFilter === member.id && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ))}

        {showSprintFilter && (
          <>
            <div className="my-1 h-px bg-border" />
            <SectionLabel>{m.tickets_filters_section_sprint()}</SectionLabel>
            <DropdownMenuItem
              closeOnClick={false}
              onClick={() => onSprintChange("all")}
              className="cursor-pointer"
            >
              {m.tickets_filters_sprint_any()}
              {sprintFilter === "all" && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              closeOnClick={false}
              onClick={() => onSprintChange("unassigned")}
              className="cursor-pointer"
            >
              {m.tickets_filters_sprint_none()}
              {sprintFilter === "unassigned" && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
            {sprintOptions.length > 0 && (
              <div className="my-1 h-px bg-border" />
            )}
            {sprintOptions.map((s) => {
              const meta = SPRINT_STATE_META[sprintState(s, now)]
              const SIcon = meta.icon
              return (
                <DropdownMenuItem
                  key={s.id}
                  closeOnClick={false}
                  onClick={() => onSprintChange(s.id)}
                  className="cursor-pointer"
                >
                  <SIcon
                    className={cn("size-4", meta.className)}
                    strokeWidth={1.75}
                  />
                  <span className="truncate">{s.name}</span>
                  {sprintFilter === s.id && (
                    <Check className="ml-auto size-3.5 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
              )
            })}
          </>
        )}

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
    <div className="px-2 pt-1 pb-0.5 text-[11px] text-muted-foreground">
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
              label: SORT_LABELS[value]()
            })}
          >
            <ArrowDownAZ className="size-4" strokeWidth={1.75} />
            <CollapsingLabel show={!compact}>
              {SORT_LABELS[value]()}
            </CollapsingLabel>
            <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-44">
        {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
          <DropdownMenuItem
            key={k}
            onClick={() => onChange(k)}
            className="cursor-pointer"
          >
            {SORT_LABELS[k]()}
            {value === k && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
