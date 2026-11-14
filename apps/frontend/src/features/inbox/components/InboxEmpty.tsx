import { CheckCheck, Inbox } from "lucide-react"
import type { ReactNode } from "react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { m } from "@/paraglide/messages"

export function InboxCaughtUp() {
  return (
    <Empty className="m-2 flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CheckCheck strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{m.inbox_empty_title()}</EmptyTitle>
        <EmptyDescription>{m.inbox_empty_body()}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function InboxNothingSelected() {
  return (
    <Empty variant="compact" className="m-auto gap-3">
      <EmptyMedia variant="icon">
        <Inbox strokeWidth={1.75} />
      </EmptyMedia>
      <EmptyDescription>{m.inbox_pane_empty()}</EmptyDescription>
      <dl
        aria-label={m.inbox_hints_label()}
        className="mt-1 flex gap-4 text-caption text-muted-foreground max-md:hidden"
      >
        <Hint keys={["J", "K"]}>{m.inbox_hint_move()}</Hint>
        <Hint keys={["E"]}>{m.inbox_hint_done()}</Hint>
        <Hint keys={["U"]}>{m.inbox_hint_unread()}</Hint>
      </dl>
    </Empty>
  )
}

function Hint({
  keys,
  children
}: Readonly<{ keys: ReadonlyArray<string>; children: ReactNode }>) {
  return (
    <div className="flex items-center gap-1.5">
      <dt>
        <KbdGroup>
          {keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </KbdGroup>
      </dt>
      <dd>{children}</dd>
    </div>
  )
}
