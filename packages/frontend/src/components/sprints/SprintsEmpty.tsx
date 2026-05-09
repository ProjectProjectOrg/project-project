import { m } from "@/paraglide/messages"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { DitheredCalendar } from "./DitheredCalendar"

export function SprintsEmpty() {
  return (
    <Empty className="rounded-xl border border-dashed border-border bg-background/50 px-6 py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-transparent">
          <DitheredCalendar size={120} />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-medium">
          {m.sprints_empty_no_sprints_title()}
        </EmptyTitle>
        <EmptyDescription className="max-w-sm text-xs">
          {m.sprints_empty_no_sprints_body()}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
