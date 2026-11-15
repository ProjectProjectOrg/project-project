import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@pp/ui/empty"

import { m } from "@/paraglide/messages"

import { DitheredCalendar } from "./DitheredCalendar"

export function SprintsEmpty() {
  return (
    <Empty intensity="subtle">
      <EmptyMedia>
        <DitheredCalendar size={120} />
      </EmptyMedia>
      <EmptyTitle>{m.sprints_empty_no_sprints_title()}</EmptyTitle>
      <EmptyDescription>{m.sprints_empty_no_sprints_body()}</EmptyDescription>
    </Empty>
  )
}
