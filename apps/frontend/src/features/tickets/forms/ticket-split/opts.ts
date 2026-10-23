import {
  SPLIT_TICKET_MAX_RESULTS,
  SPLIT_TICKET_MIN_RESULTS,
  SplitTicketResultInput,
  type GroupId,
  type SplitTicketInput,
  type TicketPriority,
  type TicketStatus,
  type TicketType
} from "@pp/shared"
import type { ReactFormType } from "@tanstack/react-form"
import * as Schema from "effect/Schema"

import { appFormOptions } from "@/lib/form"

export type SplitResultDefaults = Readonly<{
  type: TicketType
  status: TicketStatus
  priority: TicketPriority
  sprintId: GroupId | null
}>

const SplitResultFormSchema = Schema.Struct({
  rowId: Schema.String,
  ...SplitTicketResultInput.fields
})

export type SplitResultValues = typeof SplitResultFormSchema.Type

const SplitTicketFormSchema = Schema.toType(
  Schema.Struct({
    results: Schema.mutable(
      Schema.Array(SplitResultFormSchema).pipe(
        Schema.check(Schema.isMinLength(SPLIT_TICKET_MIN_RESULTS)),
        Schema.check(Schema.isMaxLength(SPLIT_TICKET_MAX_RESULTS))
      )
    )
  })
)

let nextRowId = 0

export const splitResultDefaults = (
  source: SplitResultDefaults
): SplitResultValues => ({
  rowId: `split-row-${nextRowId++}`,
  title: "",
  type: source.type,
  status: source.status,
  priority: source.priority,
  sprintId: source.sprintId,
  assignees: []
})

export const toSplitTicketInput = (
  results: ReadonlyArray<SplitResultValues>
): SplitTicketInput => ({
  results: results.map(({ rowId: _rowId, ...result }) => result)
})

export const splitTicketFormOpts = appFormOptions({
  defaultValues: { results: [] as Array<SplitResultValues> },
  validators: [
    { run: Schema.toStandardSchemaV1(SplitTicketFormSchema), triggers: [] }
  ]
})

export type SplitTicketForm = ReactFormType<typeof splitTicketFormOpts>
