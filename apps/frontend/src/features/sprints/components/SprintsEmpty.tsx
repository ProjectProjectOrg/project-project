import type { ReactNode } from "react"

import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { m } from "@/paraglide/messages"

import { DitheredCalendar } from "./DitheredCalendar"

export function SprintsEmpty({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Empty>
      <EmptyMedia variant="icon" className="mb-1 bg-transparent">
        <DitheredCalendar size={120} />
      </EmptyMedia>
      <EmptyTitle className="text-body font-semibold">
        {m.sprints_empty_no_sprints_title()}
      </EmptyTitle>
      <EmptyDescription className="max-w-sm text-caption">
        {m.sprints_empty_no_sprints_body()}
      </EmptyDescription>
      {children && <div className="mt-3">{children}</div>}
    </Empty>
  )
}
