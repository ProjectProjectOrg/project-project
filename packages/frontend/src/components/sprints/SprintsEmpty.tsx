import { m } from "@/paraglide/messages"
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { DitheredCalendar } from "./DitheredCalendar"

export function SprintsEmpty() {
  return (
    <Empty>
      <EmptyMedia variant="icon" className="mb-1 bg-transparent">
        <DitheredCalendar size={120} />
      </EmptyMedia>
      <EmptyTitle className="text-sm font-medium">
        {m.sprints_empty_no_sprints_title()}
      </EmptyTitle>
      <EmptyDescription className="max-w-sm text-xs">
        {m.sprints_empty_no_sprints_body()}
      </EmptyDescription>
    </Empty>
  )
}
