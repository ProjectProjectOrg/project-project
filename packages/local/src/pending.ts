import {
  applyListEdit,
  BulkUpdateTicketsInput,
  Conflict,
  Estimate,
  Forbidden,
  ListEdit,
  MentionInvalid,
  NotFound,
  SprintCompletedImmutable,
  type SyncCursor,
  TicketFact,
  TicketFlag,
  TicketId,
  TicketPriority,
  UpdateTicketInput,
  Validation
} from "@pp/shared"
import * as Schema from "effect/Schema"

export const Intent = Schema.TaggedUnion({
  title: { title: Schema.String },
  status: { status: Schema.String },
  type: { type: Schema.NullOr(Schema.String) },
  priority: { priority: TicketPriority },
  estimate: { estimate: Schema.NullOr(Estimate) },
  assignees: { edit: ListEdit(Schema.String) },
  tags: { edit: ListEdit(Schema.String) },
  flag: { flag: Schema.NullOr(TicketFlag) },
  rank: { rank: Schema.String },
  sprint: { sprint: Schema.NullOr(Schema.String) },
  parent: { parent: Schema.NullOr(Schema.String) }
})
export type Intent = typeof Intent.Type

export const PendingEdit = Schema.Struct({
  ticket: Schema.String,
  intents: Schema.Array(Intent)
})
export type PendingEdit = typeof PendingEdit.Type

export const PendingWrite = Schema.TaggedUnion({
  update: { ticket: TicketId, payload: UpdateTicketInput },
  bulk: { payload: BulkUpdateTicketsInput }
})
export type PendingWrite = typeof PendingWrite.Type

export const EditRejected = Schema.Union([
  Validation,
  NotFound,
  Forbidden,
  Conflict,
  MentionInvalid,
  SprintCompletedImmutable
])
export type EditRejected = typeof EditRejected.Type

export const encodeEdits = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(PendingEdit))
)
export const decodeEdits = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(PendingEdit))
)
export const encodeWrite = Schema.encodeSync(
  Schema.fromJsonString(PendingWrite)
)
export const decodeWrite = Schema.decodeUnknownSync(
  Schema.fromJsonString(PendingWrite)
)
export const decodeFact = Schema.decodeUnknownSync(
  Schema.fromJsonString(TicketFact)
)

export type Membership = Readonly<{ group: string; position: number }>

export type TicketState = Readonly<{
  fact: TicketFact
  groups: ReadonlyArray<Membership>
}>

const Memberships = Schema.Array(
  Schema.Struct({ group: Schema.String, position: Schema.Finite })
)
export const encodeGroups = Schema.encodeSync(
  Schema.fromJsonString(Memberships)
)
export const decodeGroups = Schema.decodeUnknownSync(
  Schema.fromJsonString(Memberships)
)

const APPENDED = Number.MAX_SAFE_INTEGER

const intoSprint = (
  groups: ReadonlyArray<Membership>,
  sprint: string | null,
  openSprints: ReadonlySet<string>
) => {
  const kept = groups.filter(
    (member) => member.group === sprint || !openSprints.has(member.group)
  )
  return sprint === null || kept.some((member) => member.group === sprint)
    ? kept
    : [...kept, { group: sprint, position: APPENDED }]
}

const applyToFact = (fact: TicketFact, intent: Intent): TicketFact =>
  Intent.match(intent, {
    title: ({ title }) => ({ ...fact, title }),
    status: ({ status }) => ({ ...fact, status }),
    type: ({ type }) => ({ ...fact, type }),
    priority: ({ priority }) => ({ ...fact, priority }),
    estimate: ({ estimate }) => ({ ...fact, estimate }),
    assignees: ({ edit }) => ({
      ...fact,
      assignees: applyListEdit(fact.assignees, edit)
    }),
    tags: ({ edit }) => ({ ...fact, tags: applyListEdit(fact.tags, edit) }),
    flag: ({ flag }) => ({ ...fact, flag }),
    rank: ({ rank }) => ({ ...fact, rank }),
    parent: ({ parent }) => ({ ...fact, parent }),
    sprint: () => fact
  })

export const applyIntents = (
  state: TicketState,
  intents: ReadonlyArray<Intent>,
  openSprints: ReadonlySet<string>
): TicketState => {
  let fact = state.fact
  let groups = state.groups
  for (const intent of intents)
    if (Intent.guards.sprint(intent))
      groups = intoSprint(groups, intent.sprint, openSprints)
    else fact = applyToFact(fact, intent)
  return { fact, groups }
}

const position = (part: string) => {
  const [generation, sequence] = part.split(".").map(Number)
  return generation !== undefined &&
    sequence !== undefined &&
    Number.isSafeInteger(generation) &&
    Number.isSafeInteger(sequence)
    ? { generation, sequence }
    : null
}

export const covers = (
  cursor: SyncCursor,
  receipt: string,
  projectId: string
): boolean => {
  const prefix = `${projectId}.`
  const entry = receipt
    .split("~")
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)
  if (entry === undefined) return true
  const reached = position(cursor)
  const needed = position(entry)
  if (reached === null || needed === null) return false
  return (
    reached.generation > needed.generation ||
    (reached.generation === needed.generation &&
      reached.sequence >= needed.sequence)
  )
}
