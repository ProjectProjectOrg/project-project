import { useAtomValue } from "@effect/atom-react"
import { TicketStatus as TicketStatusSchema } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"

import {
  project as projectView,
  projectRequest
} from "@/features/projects/atoms/projects"
import { AssigneeSelect } from "@/features/tickets/components/ticket-list/AssigneeField"
import { CreatorTypeSelect } from "@/features/tickets/components/ticket-list/CreatorMenus"
import { EstimateBadgeTrigger } from "@/features/tickets/components/ticket-list/EstimateField"
import { PrioritySelect } from "@/features/tickets/components/ticket-list/PriorityField"
import { StatusSelect } from "@/features/tickets/components/ticket-list/StatusField"
import type { CreatorType } from "@/features/tickets/hooks/useCreatorType"
import { type TicketFields } from "@/features/tickets/lib/ticketFields"

const DEFAULT_STATUS = Schema.decodeSync(TicketStatusSchema)("todo")

export function TicketFieldChips({
  orgSlug,
  slug,
  creatorType,
  typeLocked = false,
  value,
  onChange
}: Readonly<{
  orgSlug: string
  slug: string
  creatorType: CreatorType
  typeLocked?: boolean
  value: TicketFields
  onChange: (patch: Partial<TicketFields>) => void
}>) {
  const detail = useAtomValue(projectView(projectRequest(orgSlug, slug)))
  const members = Result.isSuccess(detail) ? detail.value.members : []
  const estimation = Result.isSuccess(detail) ? detail.value.estimation : "off"
  return (
    <>
      <span data-ticket-field="status" className="contents">
        <StatusSelect
          manageAction={false}
          value={value.status ?? DEFAULT_STATUS}
          onChange={(status) => onChange({ status })}
          showLabel
        />
      </span>
      <span data-ticket-field="type" className="contents">
        <fieldset disabled={typeLocked} className="contents">
          <CreatorTypeSelect
            orgSlug={orgSlug}
            slug={slug}
            type={creatorType.type}
            lastUsed={creatorType.lastUsed}
            epics={creatorType.epics}
            onTypeChange={creatorType.pick}
          />
        </fieldset>
      </span>
      <span data-ticket-field="priority" className="contents">
        <PrioritySelect
          value={value.priority ?? creatorType.prediction?.priority ?? "med"}
          onChange={(priority) => onChange({ priority })}
          showLabel
        />
      </span>
      <span data-ticket-field="assignee" className="contents">
        <AssigneeSelect
          value={value.assignees}
          onChange={(assignees) => onChange({ assignees })}
          members={members}
          variant="chip"
        />
      </span>
      <span data-ticket-field="estimate" className="contents">
        <EstimateBadgeTrigger
          ticket={{ estimate: value.estimate }}
          mode={estimation}
          onPatch={(patch) => onChange({ estimate: patch.estimate ?? null })}
        />
      </span>
    </>
  )
}
