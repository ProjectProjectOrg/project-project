import { GroupIntent, Intent, PendingWrite } from "@pp/local"
import type {
  ArchiveTicketInput,
  BulkArchiveTicketsInput,
  BulkDeleteTicketsInput,
  CompleteSprintInput,
  GroupId,
  TicketId,
  UpdateGroupInput
} from "@pp/shared"

import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"

import type { LocalEdit } from "../atoms/localEdit"

const when = <A>(
  value: A | undefined,
  intent: (value: A) => Intent
): ReadonlyArray<Intent> => (value === undefined ? [] : [intent(value)])

export const intentsOf = (edit: TicketEdit): ReadonlyArray<Intent> => [
  ...when(edit.title, (title) => Intent.cases.title.make({ title })),
  ...when(edit.status, (status) => Intent.cases.status.make({ status })),
  ...when(edit.type, (type) => Intent.cases.type.make({ type })),
  ...when(edit.priority, (priority) =>
    Intent.cases.priority.make({ priority })
  ),
  ...when(edit.estimate, (estimate) =>
    Intent.cases.estimate.make({ estimate })
  ),
  ...when(edit.assignees, (assignees) =>
    Intent.cases.assignees.make({ edit: assignees })
  ),
  ...when(edit.tags, (tags) => Intent.cases.tags.make({ edit: tags })),
  ...when(edit.flag, (flag) => Intent.cases.flag.make({ flag })),
  ...when(edit.position?.rank ?? undefined, (rank) =>
    Intent.cases.rank.make({ rank })
  ),
  ...when(edit.sprint, (sprint) => Intent.cases.sprint.make({ sprint })),
  ...when(edit.parent, (parent) =>
    Intent.cases.parent.make({ parent: parent?.id ?? null })
  )
]

const archived = (at: Date, duplicateOf: TicketId | undefined) =>
  Intent.cases.archive.make({ at, duplicateOf: duplicateOf ?? null })

export const archiveEdit = (
  ticket: TicketId,
  payload: ArchiveTicketInput,
  at: Date
): LocalEdit => ({
  write: PendingWrite.cases.archive.make({ ticket, payload }),
  edits: [{ ticket, intents: [archived(at, payload.duplicateOf)] }]
})

export const bulkArchiveEdit = (
  payload: BulkArchiveTicketsInput,
  at: Date
): LocalEdit => ({
  write: PendingWrite.cases.bulkArchive.make({ payload }),
  edits: payload.tickets.map((ticket) => ({
    ticket,
    intents: [archived(at, undefined)]
  }))
})

export const restoreEdit = (ticket: TicketId): LocalEdit => ({
  write: PendingWrite.cases.restore.make({ ticket }),
  edits: [{ ticket, intents: [Intent.cases.restore.make({})] }]
})

export const deleteEdit = (payload: BulkDeleteTicketsInput): LocalEdit => ({
  write: PendingWrite.cases.delete.make({ payload }),
  edits: payload.tickets.map((ticket) => ({
    ticket,
    intents: [
      Intent.cases.delete.make({ cascade: payload.cascadeSubTickets ?? false })
    ]
  }))
})

export const updateSprintEdit = (
  group: GroupId,
  payload: UpdateGroupInput
): LocalEdit => {
  const { body: _body, ...patch } = payload
  return {
    write: PendingWrite.cases.updateGroup.make({ group, payload }),
    edits: [],
    groups: [{ group, intents: [GroupIntent.cases.edit.make({ patch })] }]
  }
}

export const completeSprintEdit = (
  group: GroupId,
  payload: CompleteSprintInput,
  at: Date
): LocalEdit => ({
  write: PendingWrite.cases.completeGroup.make({ group, payload }),
  edits: [],
  groups: [
    {
      group,
      intents: [
        GroupIntent.cases.complete.make({
          at,
          destination:
            payload.destination.kind === "sprint"
              ? payload.destination.groupId
              : null
        })
      ]
    }
  ]
})
