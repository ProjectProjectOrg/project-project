import { useAtomValue } from "@effect/atom-react"
import {
  TicketStatus as TicketStatusSchema,
  type CreateTicketInput,
  type Estimate,
  type TicketPriority,
  type TicketStatus
} from "@pp/shared"
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

const DEFAULT_STATUS = Schema.decodeSync(TicketStatusSchema)("todo")

export type TicketFields = Readonly<{
  status: TicketStatus | null
  priority: TicketPriority | null
  assignees: ReadonlyArray<string>
  estimate: Estimate | null
}>

export const DEFAULT_TICKET_FIELDS: TicketFields = {
  status: null,
  priority: null,
  assignees: [],
  estimate: null
}

export const ticketFieldsPayload = (fields: TicketFields) =>
  ({
    priority: fields.priority ?? undefined,
    status: fields.status ?? undefined,
    assignees: fields.assignees.length === 0 ? undefined : fields.assignees,
    estimate: fields.estimate ?? undefined
  }) satisfies Partial<CreateTicketInput>

export function TicketFieldChips({
  orgSlug,
  slug,
  creatorType,
  value,
  onChange
}: Readonly<{
  orgSlug: string
  slug: string
  creatorType: CreatorType
  value: TicketFields
  onChange: (patch: Partial<TicketFields>) => void
}>) {
  const detail = useAtomValue(projectView(projectRequest(orgSlug, slug)))
  const members = Result.isSuccess(detail) ? detail.value.members : []
  const estimation = Result.isSuccess(detail) ? detail.value.estimation : "off"
  return (
    <>
      <StatusSelect
        manageAction={false}
        value={value.status ?? DEFAULT_STATUS}
        onChange={(status) => onChange({ status })}
        showLabel
      />
      <CreatorTypeSelect
        orgSlug={orgSlug}
        slug={slug}
        type={creatorType.type}
        lastUsed={creatorType.lastUsed}
        epics={creatorType.epics}
        onTypeChange={creatorType.pick}
      />
      <PrioritySelect
        value={value.priority ?? creatorType.prediction?.priority ?? "med"}
        onChange={(priority) => onChange({ priority })}
        showLabel
      />
      <AssigneeSelect
        value={value.assignees}
        onChange={(assignees) => onChange({ assignees })}
        members={members}
        variant="chip"
      />
      <EstimateBadgeTrigger
        ticket={{ estimate: value.estimate }}
        mode={estimation}
        onPatch={(patch) => onChange({ estimate: patch.estimate ?? null })}
      />
    </>
  )
}
