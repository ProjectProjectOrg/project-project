import { Search as SearchIcon, X } from "lucide-react"
import { useRef } from "react"

import { Button } from "@/components/ui/button"
import { CollapsingLabel } from "@/components/ui/collapsing-label"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { MIN_SEARCH_CHARS } from "../search"
import { useTicketToolbar } from "./context"

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
        <span className="shrink-0 text-caption text-muted-foreground">
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

export function ClearAll() {
  const { hasActiveFilters, clearAll } = useTicketToolbar()
  return (
    <CollapsingLabel show={hasActiveFilters}>
      <button
        type="button"
        onClick={clearAll}
        disabled={!hasActiveFilters}
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-destructive/40 bg-destructive/10 text-destructive transition-colors duration-100 active:scale-[0.97]",
          "hover:border-destructive/60 hover:bg-destructive/15",
          "outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        )}
        title={m.tickets_filters_clear_all()}
        aria-label={m.tickets_filters_clear_all()}
      >
        <X className="size-4 shrink-0" strokeWidth={1.75} />
      </button>
    </CollapsingLabel>
  )
}
