import { Inbox } from "@pp/ui/inbox"
import { SplitPane, splitPaneDividerClass } from "@pp/ui/split-pane"
import { TicketKey } from "@pp/ui/ticket-key"
import { useState } from "react"

import { EARLIER, TODAY, Row } from "../../inbox/demos/parts/entries"

function TicketStandIn() {
  return (
    <div className="grid content-start gap-3 p-6">
      <TicketKey value="PP-352" />
      <h2 className="text-title font-semibold">
        Inbox tools for agents and pp
      </h2>
      <p className="text-body text-muted-foreground">
        The ticket opens here, beside the list. Drag the line between them to
        give either side more room; the width is remembered.
      </p>
    </div>
  )
}

function State({
  caption,
  state
}: Readonly<{ caption: string; state: "inactive" | "hover" | "active" }>) {
  return (
    <div className="grid justify-items-center gap-2">
      <div className="flex h-24 w-24 justify-center rounded-lg surface-page">
        <div data-separator={state} className={splitPaneDividerClass} />
      </div>
      <p className="text-caption text-muted-foreground">{caption}</p>
    </div>
  )
}

export default function Overview() {
  const [selected, setSelected] = useState("3")
  return (
    <div className="@container grid w-full gap-6">
      <div className="h-[28rem] overflow-hidden rounded-xl surface-page">
        <SplitPane.Root id="gallery-inbox">
          <SplitPane.Panel
            id="list"
            defaultSize="45%"
            minSize={280}
            maxSize="65%"
          >
            <div className="h-full overflow-y-auto p-2">
              <Inbox.List>
                <Inbox.Group label="Today">
                  {TODAY.map((entry) => (
                    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- the demo's stand-in for the router link
                    <div key={entry.id} onClick={() => setSelected(entry.id)}>
                      <Row entry={entry} selected={selected === entry.id} />
                    </div>
                  ))}
                </Inbox.Group>
                <Inbox.Group label="Earlier">
                  <Row entry={EARLIER} />
                </Inbox.Group>
              </Inbox.List>
            </div>
          </SplitPane.Panel>
          <SplitPane.Divider aria-label="Resize the list" />
          <SplitPane.Panel id="ticket" minSize={280}>
            <TicketStandIn />
          </SplitPane.Panel>
        </SplitPane.Root>
      </div>
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] justify-items-center">
        <State caption="Rest" state="inactive" />
        <State caption="Hover" state="hover" />
        <State caption="Dragging" state="active" />
      </div>
    </div>
  )
}
