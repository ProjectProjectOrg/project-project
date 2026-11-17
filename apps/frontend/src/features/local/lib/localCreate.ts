import { Intent, PendingWrite, placeholderTicketId } from "@pp/local"
import {
  type CreateTicketInput,
  type GroupId,
  NO_DESCRIPTION_REVISION,
  type TicketFact,
  type TicketParent,
  TicketRelationKind
} from "@pp/shared"

import {
  PREDICTED_TOP_RANK,
  type QuickCreatePrediction
} from "@/features/tickets/lib/ticketRows"

import type { LocalEdit } from "../atoms/localEdit"

export type LocalCreate = Readonly<{
  payload: Omit<CreateTicketInput, "parent">
  parent?: TicketParent
  sprint: GroupId | null
  prediction: QuickCreatePrediction
}>

const relation = (kind: typeof TicketRelationKind.Type) => (to: string) => ({
  to,
  kind
})

export const createEdit = (
  { payload, parent, sprint, prediction }: LocalCreate,
  random: number,
  now: Date
): LocalEdit => {
  const placeholder = placeholderTicketId(prediction.projectPrefix, random)
  const fact: TicketFact = {
    id: placeholder,
    title: payload.title,
    status: payload.status ?? "todo",
    type: payload.type ?? null,
    priority: payload.priority ?? prediction.priority ?? "med",
    rank: PREDICTED_TOP_RANK,
    estimate: payload.estimate ?? null,
    tags: payload.tags ?? prediction.tags ?? [],
    assignees: payload.assignees ?? [],
    parent: parent?.id ?? null,
    relations: [
      ...(payload.blockedBy ?? []).map(relation("blocked_by")),
      ...(payload.relatedTo ?? []).map(relation("related"))
    ],
    flag: null,
    git: null,
    archivedAt: null,
    createdBy: prediction.createdBy,
    createdAt: now,
    updatedAt: now,
    descriptionRevision: NO_DESCRIPTION_REVISION
  }
  return {
    write: PendingWrite.cases.create.make({
      placeholder,
      payload:
        parent === undefined ? payload : { ...payload, parent: parent.id },
      sprint
    }),
    edits: [
      {
        ticket: placeholder,
        intents: [
          Intent.cases.create.make({ fact }),
          ...(sprint === null ? [] : [Intent.cases.sprint.make({ sprint })])
        ]
      }
    ]
  }
}
