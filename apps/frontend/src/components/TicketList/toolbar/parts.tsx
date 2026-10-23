import { useAtomValue } from "@effect/atom-react"
import { type SortKey, NATURAL_SORT_DIR, type TicketStatus } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import {
  ArrowDownAZ,
  ChevronDown,
  Circle,
  Search as SearchIcon,
  X
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useMemo, useRef } from "react"

import { CollapsingLabel } from "@/components/SegmentedTabs"
import { boardStatusesFor } from "@/components/sprints/board-utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { menuItemMetaClass } from "@/components/ui/menu-styles"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { transitions } from "@/lib/springs"
import { statusMetaFor, statusLabelFor } from "@/lib/ticket-meta"
import { useGlobalShortcut } from "@/lib/use-global-shortcut"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { MIN_SEARCH_CHARS } from "../search"
import { SORT_LABELS, sortKeysFor } from "../sort"
import { useTicketToolbar } from "./context"
import { ControlSlot, OptionPicker, ToolbarButton } from "./shared"

export function SearchInput() {
  const { search, searchActive: compact, setFocused } = useTicketToolbar()
  const searchInput = search.draft
  const searchRef = useRef<HTMLInputElement>(null)
  const searchBelowMinChars =
    searchInput.length > 0 && searchInput.length < MIN_SEARCH_CHARS
  useGlobalShortcut("/", searchRef)
  return (
    <InputGroup className="min-w-0 flex-1 basis-[220px]">
      <InputGroupAddon>
        <SearchIcon className="size-4" strokeWidth={1.75} />
      </InputGroupAddon>
      <InputGroupInput
        ref={searchRef}
        value={searchInput}
        onChange={(e) => search.change(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          search.flush()
        }}
        placeholder={m.tickets_search_placeholder()}
        aria-label={m.tickets_search_aria_label()}
        aria-keyshortcuts="/"
      />
      {searchBelowMinChars ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {m.tickets_search_min_hint()}
        </span>
      ) : null}
      {searchInput ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={search.clear}
          aria-label={m.tickets_search_clear_aria_label()}
          className="shrink-0 rounded-xl"
        >
          <X strokeWidth={1.75} />
        </Button>
      ) : !compact ? (
        <Kbd aria-hidden>/</Kbd>
      ) : null}
    </InputGroup>
  )
}

export function Status({
  variant = "toolbar"
}: Readonly<{ variant?: "toolbar" | "panel" }>) {
  const { query, patchFilter, counts, orgSlug, slug, controlsCompact } =
    useTicketToolbar()
  const selected = query.status
  const status = selected?.length === 1 ? selected[0] : "all"
  const setStatus = (status: TicketStatus | "all") =>
    patchFilter({ status: status === "all" ? undefined : [status] })
  const req = useMemo(() => statusesRequest(orgSlug, slug), [orgSlug, slug])
  const result = useAtomValue(statusesFor(req))
  const statuses = Result.isSuccess(result) ? result.value : []
  const slugs = boardStatusesFor(statuses)
  const active = status !== "all"
  const currentMeta = active ? statusMetaFor(status, statuses) : null
  const currentLabel = active
    ? statusLabelFor(status, statuses)
    : m.tickets_status_all()
  const CurrentIcon = currentMeta?.icon ?? Circle

  const options = [
    {
      value: "all" as const,
      label: m.tickets_status_all(),
      icon: (
        <Circle className="size-4 text-muted-foreground" strokeWidth={1.75} />
      ),
      count: counts?.all
    },
    ...slugs.map((s) => {
      const meta = statusMetaFor(s, statuses)
      const SIcon = meta.icon
      return {
        value: s,
        label: statusLabelFor(s, statuses),
        icon: (
          <SIcon
            className={cn("size-4", meta.className)}
            style={meta.color ? { color: meta.color } : undefined}
            strokeWidth={1.75}
          />
        ),
        count: counts?.[s]
      }
    })
  ]
  const countBadge = (count: number | undefined) =>
    counts ? (
      <span data-menu-meta className={menuItemMetaClass}>
        {count ?? 0}
      </span>
    ) : null

  if (variant === "panel")
    return (
      <OptionPicker
        label={m.tickets_filters_section_status()}
        value={status}
        onValueChange={setStatus}
        displayValue={currentLabel}
        items={options.map((option, index) => ({
          separated: index === 0,
          value: option.value,
          textValue: option.label,
          label: (
            <>
              {option.icon}
              <span className="truncate">{option.label}</span>
              {countBadge(option.count)}
            </>
          )
        }))}
      />
    )

  return (
    <ControlSlot>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <ToolbarButton
              active={active}
              aria-label={m.tickets_status_aria_label({ label: currentLabel })}
            >
              <CurrentIcon
                className={cn("size-4", currentMeta?.className)}
                style={
                  currentMeta?.color ? { color: currentMeta.color } : undefined
                }
                strokeWidth={1.75}
              />
              <CollapsingLabel show={!controlsCompact}>
                {currentLabel}
              </CollapsingLabel>
              <span
                className={cn(
                  "min-h-4 min-w-6 rounded-full px-1.5 text-center font-mono text-[10px] tabular-nums",
                  active
                    ? "bg-foreground/10 text-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {counts ? (counts[status] ?? 0) : null}
              </span>
              <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
            </ToolbarButton>
          }
        />
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="w-52"
          finalFocus={false}
        >
          <DropdownMenuRadioGroup
            value={status}
            onValueChange={setStatus}
            items={options.map((option, index) => ({
              separated: index === 0,
              value: option.value,
              closeOnClick: true,
              label: (
                <>
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                  {countBadge(option.count)}
                </>
              )
            }))}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </ControlSlot>
  )
}

export function Sort() {
  const { query, onQueryChange, controlsCompact, estimation } =
    useTicketToolbar()
  const sortKey = query.sort.key
  const setSortKey = (key: SortKey) =>
    onQueryChange({ ...query, sort: { key, dir: NATURAL_SORT_DIR[key] } })
  return (
    <motion.div layout="position" transition={transitions.layout}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <ToolbarButton
              aria-label={m.tickets_sort_aria_label({
                label: SORT_LABELS[sortKey]()
              })}
            >
              <ArrowDownAZ className="size-4" strokeWidth={1.75} />
              <CollapsingLabel show={!controlsCompact}>
                {SORT_LABELS[sortKey]()}
              </CollapsingLabel>
              <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
            </ToolbarButton>
          }
        />
        <DropdownMenuContent align="end" sideOffset={6} className="w-44">
          <DropdownMenuRadioGroup
            value={sortKey}
            onValueChange={setSortKey}
            items={sortKeysFor(estimation).map((k) => ({
              value: k,
              closeOnClick: true,
              label: SORT_LABELS[k]()
            }))}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  )
}

export function ClearAll() {
  const { hasActiveFilters, clearAll } = useTicketToolbar()
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {hasActiveFilters && (
        <motion.button
          key="clear"
          type="button"
          onClick={clearAll}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={transitions.pop}
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-destructive/40 bg-destructive/10 text-destructive transition-colors duration-100 active:scale-[0.97]",
            "hover:border-destructive/60 hover:bg-destructive/15",
            "ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          title={m.tickets_filters_clear_all()}
          aria-label={m.tickets_filters_clear_all()}
        >
          <X className="size-4 shrink-0" strokeWidth={1.75} />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
