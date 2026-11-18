import { Button } from "@pp/ui/button"
import { SearchIcon, XIcon } from "@pp/ui/icons"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@pp/ui/input-group"
import { Kbd } from "@pp/ui/kbd"
import { useState } from "react"

export default function TicketSearch() {
  const [query, setQuery] = useState("")
  return (
    <div className="flex w-full max-w-md items-center gap-2">
      <InputGroup className="min-w-0 flex-1">
        <InputGroupAddon>
          <SearchIcon className="size-4" strokeWidth={1.75} />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tickets"
          aria-label="Search tickets"
          aria-keyshortcuts="/"
        />
        {query.length === 1 ? (
          <span className="shrink-0 text-caption text-muted-foreground">
            Type 2+ characters
          </span>
        ) : null}
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="shrink-0 rounded-xl"
          >
            <XIcon strokeWidth={1.75} />
          </Button>
        ) : (
          <Kbd aria-hidden>/</Kbd>
        )}
      </InputGroup>
    </div>
  )
}
