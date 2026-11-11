import { useAtomValue } from "@effect/atom-react"
import { finishedStatusSlugs, type TicketRelations } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { OctagonMinus } from "lucide-react"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { ParentTicketLink } from "@/features/tickets/components/ticket-page/ParentTicketLink"
import { openBlockers } from "@/features/tickets/lib/relationGroups"
import { m } from "@/paraglide/messages"

export function BlockedByNote({
  relations
}: Readonly<{ relations: TicketRelations }>) {
  const { orgSlug, slug } = useProjectRoute()
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const blockers = openBlockers(
    relations,
    new Set(
      finishedStatusSlugs(Result.isSuccess(statuses) ? statuses.value : [])
    )
  )
  const [first] = blockers
  if (first === undefined) return null
  return (
    <span className="inline-flex min-w-0 items-center text-body text-muted-foreground">
      <ParentTicketLink
        parent={first}
        variant="inline"
        label={
          <>
            <OctagonMinus
              className="size-3.5 shrink-0 text-state-warning"
              strokeWidth={1.75}
            />
            {m.tickets_header_blocked_by()}
          </>
        }
      />
      {blockers.length > 1 && (
        <span className="ml-3">
          {m.tickets_hover_blocked_more({ count: blockers.length - 1 })}
        </span>
      )}
    </span>
  )
}
