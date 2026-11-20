import { Button } from "@pp/ui/button"
import { Search as SearchIcon, X } from "@pp/ui/icons"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@pp/ui/input-group"
import { KbdShortcut } from "@pp/ui/kbd"
import { useRef } from "react"

import { useGlobalShortcut } from "@/hooks/useGlobalShortcut"
import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

import { MIN_SEARCH_CHARS } from "../search"
import { useTicketToolbar } from "./context"

export function SearchInput() {
  const { search, searchActive: compact, setFocused } = useTicketToolbar()
  const searchInput = search.draft
  const searchRef = useRef<HTMLInputElement>(null)
  const searchBelowMinChars =
    searchInput.length > 0 && searchInput.length < MIN_SEARCH_CHARS
  useGlobalShortcut(appHotkeys["tickets.search"], searchRef)
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
        aria-keyshortcuts={appHotkeys["tickets.search"].defaultHotkey}
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
          className="shrink-0"
        >
          <X strokeWidth={1.75} />
        </Button>
      ) : !compact ? (
        <KbdShortcut
          keys={appHotkeys["tickets.search"].defaultHotkey}
          keyLabels={keyLabels()}
          aria-hidden
        />
      ) : null}
    </InputGroup>
  )
}
