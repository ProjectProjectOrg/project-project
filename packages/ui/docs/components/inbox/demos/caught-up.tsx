import { Button } from "@pp/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { Inbox as InboxIcon, InboxUnread } from "@pp/ui/icons"
import { Inbox } from "@pp/ui/inbox"

export default function CaughtUp() {
  return (
    <div className="flex h-[26rem] w-full flex-col rounded-xl surface-page p-2 pt-0">
      <Inbox.Header>
        <Inbox.Heading count={0} countLabel="0 unread">
          Inbox
        </Inbox.Heading>
        <Inbox.HeaderActions>
          <Button variant="ghost" size="sm" disabled>
            <InboxUnread strokeWidth={1.75} className="size-4" />
            Mark all read
          </Button>
        </Inbox.HeaderActions>
      </Inbox.Header>
      <Empty className="min-h-0 flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle>All caught up</EmptyTitle>
          <EmptyDescription>
            Mentions, assignments and updates on tickets you follow land here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
