import type {
  CreateTicketInput,
  Estimate,
  TicketPriority,
  TicketStatus
} from "@pp/shared"
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
