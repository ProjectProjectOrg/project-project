import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@pp/ui/empty"
import { Inbox } from "@pp/ui/inbox"
import { SplitPane } from "@pp/ui/split-pane"

import { EARLIER, TODAY, Row } from "./parts/entries"

export default function NothingSelected() {
  return (
    <div className="h-[26rem] w-full overflow-hidden rounded-xl surface-page">
      <SplitPane.Root>
        <SplitPane.Panel id="list" defaultSize="45%" minSize={280}>
          <div className="h-full overflow-y-auto p-2">
            <Inbox.List>
              <Inbox.Group label="Today">
                {TODAY.map((entry) => (
                  <Row key={entry.id} entry={{ ...entry, resolved: false }} />
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
          <div className="h-full p-2">
            <Empty variant="plain" className="h-full min-h-0">
              <EmptyHeader>
                <EmptyTitle>Nothing open</EmptyTitle>
                <EmptyDescription>
                  Pick an entry to read its ticket here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </SplitPane.Panel>
      </SplitPane.Root>
    </div>
  )
}
