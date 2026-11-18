import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GroupId, TicketId, WorkTypeOption } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { DatePicker } from "@pp/ui/date-picker"
import { Input } from "@pp/ui/input"
import { parseDayAt } from "@pp/ui/lib/parseDate"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"

import {
  logTicketTimeAtom,
  logTimeAtom,
  projectTimeRequest,
  type TicketTimeRequest
} from "@/features/everhour/atoms/timeTracking"
import { WorkTypeSelect } from "@/features/everhour/components/WorkTypeSelect"
import { dateLabels } from "@/lib/dateLabels"
import { useAppForm } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import * as m from "@/paraglide/messages"

import { logTimeFormOpts, toLogTimeInput } from "./opts"

const isoDay = (date: Date) => {
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

const todayIso = () => isoDay(DateTime.toDate(DateTime.nowUnsafe()))

// The form keeps the day as "YYYY-MM-DD"; the picker works in Dates.
const dayOfIso = (iso: string) =>
  Option.getOrUndefined(
    Option.map(
      parseDayAt(iso, DateTime.nowUnsafe(), { allowPast: true }),
      DateTime.toDateUtc
    )
  )

export function LogTimeForm({
  orgSlug,
  slug,
  ticketId,
  groupId,
  options,
  defaultWorkType,
  request,
  onDone
}: Readonly<{
  orgSlug: string
  slug: string
  ticketId: TicketId | null
  groupId?: GroupId | null
  options: ReadonlyArray<WorkTypeOption>
  defaultWorkType: string
  request?: TicketTimeRequest
  onDone?: () => void
}>) {
  const mutation = request
    ? logTicketTimeAtom(request)
    : logTimeAtom(
        projectTimeRequest(orgSlug, slug, ticketId ?? groupId ?? null)
      )
  const logTime = useAtomSet(mutation, { mode: "promiseExit" })
  const logState = useAtomValue(mutation)
  const serverError = mutationErrorText(
    logState,
    () => m.time_log_error(),
    m.time_log_error
  )
  const form = useAppForm({
    ...logTimeFormOpts,
    defaultValues: {
      ...logTimeFormOpts.defaultValues,
      date: todayIso(),
      workType: defaultWorkType
    },
    onSubmit: async ({ value }) => {
      const input = toLogTimeInput(value, { ticketId, groupId })
      if (input === null) return
      const exit = await logTime(input)
      if (!Exit.isSuccess(exit)) return
      form.reset({ ...value, duration: "", note: "" })
      onDone?.()
    }
  })

  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!logState.waiting) void form.handleSubmit()
      }}
    >
      <form.Field name="duration">
        {(field) => (
          <label className="flex flex-col gap-1 text-caption text-muted-foreground">
            {m.time_log_duration_label()}
            <Input
              autoFocus
              value={field.value}
              placeholder={m.time_log_duration_placeholder()}
              aria-invalid={field.errors.length > 0}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
          </label>
        )}
      </form.Field>
      <form.Field name="date">
        {(field) => (
          <label className="flex flex-col gap-1 text-caption text-muted-foreground">
            {m.time_log_date_label()}
            <DatePicker
              mode="single"
              allowPast
              value={dayOfIso(field.value)}
              onChange={(date) => {
                field.handleChange(date === undefined ? "" : isoDay(date))
                field.handleBlur()
              }}
              labels={dateLabels("single")}
              className="w-full min-w-0"
            />
          </label>
        )}
      </form.Field>
      <form.Field name="workType">
        {(field) => (
          <label className="flex flex-col gap-1 text-caption text-muted-foreground sm:col-span-2">
            {m.time_work_type_label()}
            <WorkTypeSelect
              value={field.value}
              onChange={field.handleChange}
              options={options}
            />
          </label>
        )}
      </form.Field>
      <form.Field name="note">
        {(field) => (
          <label className="flex flex-col gap-1 text-caption text-muted-foreground sm:col-span-2">
            {m.time_log_note_label()}
            <Input
              value={field.value}
              placeholder={m.time_log_note_placeholder()}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
          </label>
        )}
      </form.Field>
      <div className="flex items-center gap-1.5 sm:col-span-2">
        <Button type="submit" size="sm" loading={logState.waiting}>
          {m.time_log_submit()}
        </Button>
        {onDone ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDone}
            disabled={logState.waiting}
          >
            {m.time_cancel()}
          </Button>
        ) : null}
      </div>
      <form.Field name="duration">
        {(field) =>
          field.errors.length > 0 ? (
            <p
              role="alert"
              className="text-caption text-destructive sm:col-span-2"
            >
              {m.time_log_duration_invalid()}
            </p>
          ) : serverError ? (
            <p
              role="alert"
              className="text-caption text-destructive sm:col-span-2"
            >
              {serverError}
            </p>
          ) : null
        }
      </form.Field>
    </form>
  )
}
