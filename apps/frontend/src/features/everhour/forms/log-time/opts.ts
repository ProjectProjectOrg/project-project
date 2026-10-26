import {
  LogTimeInput,
  type GroupId,
  type LogTimeInput as LogTimeInputType,
  type TicketId
} from "@pp/shared"
import * as Schema from "effect/Schema"

import { parseDurationToSeconds } from "@/lib/duration"
import { appFormOptions, validateAfterSubmit } from "@/lib/form"

export type LogTimeValues = Readonly<{
  duration: string
  date: string
  workType: string
  note: string
}>

export type LogTimeTarget = Readonly<{
  ticketId: TicketId | null
  groupId: GroupId | null | undefined
}>

const LogTimeFormSchema = Schema.Struct({
  duration: Schema.String.check(
    Schema.makeFilter((duration) => parseDurationToSeconds(duration) !== null)
  ),
  date: LogTimeInput.fields.date,
  workType: LogTimeInput.fields.workTypeKey,
  note: Schema.String
})

export const toLogTimeInput = (
  values: LogTimeValues,
  target: LogTimeTarget
): LogTimeInputType | null => {
  const seconds = parseDurationToSeconds(values.duration)
  if (seconds === null) return null
  const comment = values.note.trim()
  return {
    workTypeKey: values.workType,
    seconds,
    date: values.date,
    comment: comment ? comment : undefined,
    ticketId: target.ticketId,
    groupId: target.ticketId ? undefined : (target.groupId ?? undefined)
  }
}

export const logTimeFormOpts = appFormOptions({
  defaultValues: { duration: "", date: "", workType: "", note: "" },
  validators: [
    validateAfterSubmit(Schema.toStandardSchemaV1(LogTimeFormSchema))
  ]
})
