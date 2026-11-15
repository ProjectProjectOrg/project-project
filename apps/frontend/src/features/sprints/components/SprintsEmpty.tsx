import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { CalendarRange } from "@pp/ui/icons"

import { m } from "@/paraglide/messages"

export function SprintsEmpty() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarRange strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{m.sprints_empty_no_sprints_title()}</EmptyTitle>
        <EmptyDescription>{m.sprints_empty_no_sprints_body()}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
