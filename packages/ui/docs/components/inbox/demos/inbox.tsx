import { Button } from "@pp/ui/button"
import { InboxUnread } from "@pp/ui/icons"
import { Inbox } from "@pp/ui/inbox"
import { KbdShortcut } from "@pp/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"
import { useState } from "react"

import { EARLIER, KEY_LABELS, TODAY, Row, type Entry } from "./parts/entries"

export default function InboxDemo() {
  const [entries, setEntries] = useState<ReadonlyArray<Entry>>(() => [
    ...TODAY,
    EARLIER
  ])
  const [selected, setSelected] = useState("3")
  const setUnread = (id: string, unread: boolean) =>
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, unread } : entry))
    )
  const read = (id: string) => setUnread(id, false)
  const readAll = () =>
    setEntries((current) =>
      current.map((entry) => ({ ...entry, unread: false }))
    )
  const unread = entries.filter((entry) => entry.unread).length
  const remove = (id: string) =>
    setEntries((current) => current.filter((entry) => entry.id !== id))
  const row = (entry: Entry) => (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- the demo's stand-in for the router link
    <div
      key={entry.id}
      onClick={() => {
        setSelected(entry.id)
        read(entry.id)
      }}
    >
      <Row
        entry={entry}
        selected={selected === entry.id}
        onToggleRead={() => setUnread(entry.id, !entry.unread)}
        onDelete={() => remove(entry.id)}
      />
    </div>
  )
  return (
    <div className="w-full max-w-md rounded-xl surface-page p-2 pt-0">
      <Inbox.Header>
        <Inbox.Heading count={unread} countLabel={`${unread} unread`}>
          Inbox
        </Inbox.Heading>
        <Inbox.HeaderActions>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unread === 0}
                  onClick={readAll}
                />
              }
            >
              <InboxUnread strokeWidth={1.75} className="size-4" />
              Mark all read
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Mark all read
              <KbdShortcut keys="shift+r" keyLabels={KEY_LABELS} size="sm" />
            </TooltipContent>
          </Tooltip>
        </Inbox.HeaderActions>
      </Inbox.Header>
      <Inbox.List>
        <Inbox.Group label="Today">
          {entries.filter((entry) => entry.id !== EARLIER.id).map(row)}
        </Inbox.Group>
        <Inbox.Group label="Earlier">
          {entries.filter((entry) => entry.id === EARLIER.id).map(row)}
        </Inbox.Group>
      </Inbox.List>
    </div>
  )
}
