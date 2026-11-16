import { Intent } from "@pp/local"

import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"

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
