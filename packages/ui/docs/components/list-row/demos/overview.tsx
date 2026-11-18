import { ListHoverScope, listGridClassName } from "@pp/ui/list-row"
import { useState } from "react"

import { Row } from "./parts/row"
import {
  EVERYTHING,
  TICKETS,
  INVITED,
  AUDIT,
  FOCUS,
  CRASH
} from "./parts/tickets"

function Caption({ children }: Readonly<{ children: string }>) {
  return (
    <p className="col-span-full px-3 pt-4 text-caption text-muted-foreground first:pt-0">
      {children}
    </p>
  )
}

export default function Overview() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(["ATL-22"])
  )
  const toggle = (id: string) => (on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  return (
    <div
      className="@container w-full rounded-xl bg-page p-3"
      style={{ "--ticket-key-width": "6ch" }}
    >
      <ListHoverScope className={listGridClassName}>
        <Caption>Rows: move down the list, click a checkbox to select</Caption>
        {TICKETS.map((ticket) => (
          <Row
            key={ticket.id}
            ticket={ticket}
            selected={selected.has(ticket.id)}
            onSelect={toggle(ticket.id)}
          />
        ))}
      </ListHoverScope>
      <div className={listGridClassName}>
        <Caption>Hover</Caption>
        <Row ticket={INVITED} force="hover" />
        <Caption>Selected</Caption>
        <Row ticket={AUDIT} selected />
        <Caption>Being created: the number rolls in once saved</Caption>
        <Row ticket={{ ...FOCUS, id: "ATL-25" }} pending />
        <Caption>Everything on it: tags past three fold into +N</Caption>
        <Row ticket={EVERYTHING} />
        <Caption>Read only: the fields are disabled</Caption>
        <Row ticket={CRASH} disabled />
      </div>
    </div>
  )
}
