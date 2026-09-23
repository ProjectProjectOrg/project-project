import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Split } from "lucide-react"
import { useMemo, useRef } from "react"
import { splitTicket, ticketRequest } from "@/atoms/ticketDetail"
import { AssigneeSelect } from "@/components/TicketList/AssigneeField"
import { PrioritySelect } from "@/components/TicketList/PriorityField"
import { SprintSelect } from "@/components/TicketList/SprintField"
import { StatusSelect } from "@/components/TicketList/StatusField"
import { TypeSelect } from "@/components/TicketList/TypeField"
import {
  SplitResults,
  type RailShape
} from "@/components/TicketSplit/SplitResults"
import { SplitWarnings } from "@/components/TicketSplit/SplitWarnings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAppForm } from "@/lib/form"
import { m } from "@/paraglide/messages"
import {
  SPLIT_TICKET_MAX_RESULTS,
  SPLIT_TICKET_MIN_RESULTS,
  type GroupId,
  type Member,
  type TicketDetail,
  type TicketId
} from "@projectproject/shared"
import {
  splitResultDefaults,
  splitTicketFormOpts,
  toSplitTicketInput
} from "./opts"

const railShapeFor = (index: number, total: number): RailShape =>
  index === 0 ? "node" : index === total - 1 ? "stem-end" : "stem"

const PENDING_NUMBER = "X"

const pendingTicketId = (ticketId: string) =>
  `${ticketId.slice(0, ticketId.lastIndexOf("-"))}-${PENDING_NUMBER}`

export function TicketSplitForm({
  orgSlug,
  slug,
  ticket,
  members,
  commentCount,
  sprintId,
  onSplit,
  onCancel
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  commentCount: number
  sprintId: GroupId | null
  onSplit: (created: ReadonlyArray<TicketId>) => void
  onCancel: () => void
}) {
  const req = useMemo(
    () => ticketRequest(orgSlug, slug, ticket.id),
    [orgSlug, slug, ticket.id]
  )
  const split = useAtomSet(splitTicket(req), { mode: "promiseExit" })
  const splitState = useAtomValue(splitTicket(req))
  const left = useRef(false)

  const defaults = {
    type: ticket.type,
    status: ticket.status,
    priority: ticket.priority,
    sprintId
  }

  const form = useAppForm({
    ...splitTicketFormOpts,
    defaultValues: {
      results: [
        {
          ...splitResultDefaults(defaults),
          title: ticket.title,
          assignees: ticket.assignees
        },
        splitResultDefaults(defaults)
      ]
    },
    onSubmit: async ({ value }) => {
      const exit = await split(toSplitTicketInput(value.results))
      if (!Exit.isSuccess(exit) || left.current) return
      onSplit(exit.value.created.map((created) => created.id))
    }
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      className="flex flex-col"
    >
      <form.ArrayField name="results">
        {(field) => (
          <>
            <SplitResults>
              {field.value.map((result, index) => (
                <SplitResults.Row
                  key={result.rowId}
                  shape={railShapeFor(index, field.value.length)}
                  connectUp={index === 0}
                  ticketId={
                    index === 0 ? ticket.id : pendingTicketId(ticket.id)
                  }
                  removeLabel={m.tickets_split_row_remove()}
                  onRemove={
                    index > 0 && field.value.length > SPLIT_TICKET_MIN_RESULTS
                      ? () => field.removeValue(index)
                      : undefined
                  }
                  status={
                    <form.Field name={`results[${index}].status`}>
                      {(statusField) => (
                        <StatusSelect
                          orgSlug={orgSlug}
                          slug={slug}
                          value={statusField.value}
                          onChange={statusField.handleChange}
                        />
                      )}
                    </form.Field>
                  }
                  priority={
                    <form.Field name={`results[${index}].priority`}>
                      {(priorityField) => (
                        <PrioritySelect
                          value={priorityField.value}
                          onChange={priorityField.handleChange}
                        />
                      )}
                    </form.Field>
                  }
                  title={
                    <form.Field name={`results[${index}].title`}>
                      {(titleField) => (
                        <Input
                          variant="inline"
                          value={titleField.value}
                          onChange={(e) =>
                            titleField.handleChange(e.target.value)
                          }
                          onBlur={titleField.handleBlur}
                          aria-invalid={titleField.errors.length > 0}
                          aria-label={m.tickets_split_row_title_label()}
                          placeholder={m.tickets_split_row_title_placeholder()}
                        />
                      )}
                    </form.Field>
                  }
                  sprint={
                    <form.Field name={`results[${index}].sprintId`}>
                      {(sprintField) => (
                        <SprintSelect
                          orgSlug={orgSlug}
                          slug={slug}
                          value={sprintField.value}
                          onChange={sprintField.handleChange}
                        />
                      )}
                    </form.Field>
                  }
                  assignees={
                    <form.Field name={`results[${index}].assignees`}>
                      {(assigneeField) => (
                        <AssigneeSelect
                          value={assigneeField.value}
                          onChange={assigneeField.handleChange}
                          members={members}
                          variant="row"
                        />
                      )}
                    </form.Field>
                  }
                  type={
                    <form.Field name={`results[${index}].type`}>
                      {(typeField) => (
                        <TypeSelect
                          value={typeField.value}
                          onChange={typeField.handleChange}
                        />
                      )}
                    </form.Field>
                  }
                />
              ))}
              {field.value.length < SPLIT_TICKET_MAX_RESULTS && (
                <SplitResults.Add
                  onClick={() => field.pushValue(splitResultDefaults(defaults))}
                  hint={m.tickets_split_add_hint({
                    max: SPLIT_TICKET_MAX_RESULTS,
                    id: ticket.id
                  })}
                />
              )}
            </SplitResults>

            <div className="mt-9 h-px bg-border" />

            <div className="flex flex-col gap-5 pt-5">
              <SplitWarnings
                ticket={ticket}
                commentCount={commentCount}
                resultCount={field.value.length}
                error={
                  Result.isFailure(splitState)
                    ? m.tickets_split_error_fallback()
                    : null
                }
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  disabled={splitState.waiting}
                  onClick={() => {
                    left.current = true
                    onCancel()
                  }}
                >
                  {m.tickets_split_cancel()}
                </Button>
                <Button
                  type="submit"
                  size="md"
                  leadingIcon={Split}
                  disabled={splitState.waiting}
                >
                  {m.tickets_split_submit({ count: field.value.length })}
                </Button>
              </div>
            </div>
          </>
        )}
      </form.ArrayField>
    </form>
  )
}
