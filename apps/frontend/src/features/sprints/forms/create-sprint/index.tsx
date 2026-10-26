import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useNavigate } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { CircleCheck } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { useInlineForm } from "@/components/ui/inline-form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  createSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { formatSprintRange } from "@/features/sprints/lib/sprintDates"
import { useAppForm } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { createSprintFormOpts } from "./opts"

export function CreateSprintForm() {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const create = useAtomSet(createSprint(req), { mode: "promiseExit" })
  const state = useAtomValue(createSprint(req))
  const busy = state.waiting
  const serverError = Result.isFailure(state)
    ? m.sprints_create_error_fallback()
    : null
  const navigate = useNavigate()
  const { close } = useInlineForm()
  const [pickerOpen, setPickerOpen] = useState(false)
  const form = useAppForm({
    ...createSprintFormOpts(),
    onSubmit: async ({ value }) => {
      if (!value.range.from || !value.range.to) return
      const exit = await create({
        name: value.name.trim(),
        startsAt: value.range.from,
        endsAt: value.range.to
      })
      if (!Exit.isSuccess(exit)) return
      close()
      void navigate({
        to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
        params: { orgSlug, slug, groupId: exit.value.id }
      })
    }
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy) void form.handleSubmit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && busy) event.preventDefault()
      }}
      className="flex flex-col gap-2"
    >
      <form.Field name="name">
        {(field) => (
          <input
            autoFocus
            value={field.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            placeholder={m.sprints_new_name_placeholder()}
            aria-invalid={field.errors.length > 0}
            disabled={busy}
            className="w-full bg-transparent text-sm outline-none"
            maxLength={120}
          />
        )}
      </form.Field>
      <form.Field name="range">
        {(field) => (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="chip"
                  disabled={busy}
                  aria-invalid={field.errors.length > 0}
                  className="self-start text-muted-foreground hover:text-foreground"
                >
                  <span className="font-mono text-[11px] tabular-nums">
                    {field.value.from && field.value.to
                      ? formatSprintRange(field.value.from, field.value.to)
                      : m.sprints_date_range_label()}
                  </span>
                </Button>
              }
            />
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="range"
                selected={{ from: field.value.from, to: field.value.to }}
                onSelect={(range) => {
                  if (range) field.handleChange(range)
                }}
                numberOfMonths={1}
                defaultMonth={
                  field.value.from ?? DateTime.toDate(DateTime.nowUnsafe())
                }
              />
            </PopoverContent>
          </Popover>
        )}
      </form.Field>
      <form.Field name="name">
        {(nameField) => (
          <form.Field name="range">
            {(rangeField) => {
              const error =
                nameField.errors.length > 0
                  ? m.sprints_create_name_required()
                  : rangeField.errors.length > 0
                    ? m.sprints_create_dates_required()
                    : serverError
              return error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : null
            }}
          </form.Field>
        )}
      </form.Field>
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          size="xs"
          variant="tertiary"
          disabled={busy}
          onClick={close}
        >
          {m.common_cancel_button()}
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="xs"
          leadingIcon={CircleCheck}
          disabled={busy}
        >
          {busy ? m.sprints_create_in_progress() : m.sprints_create_button()}
        </Button>
      </div>
    </form>
  )
}
