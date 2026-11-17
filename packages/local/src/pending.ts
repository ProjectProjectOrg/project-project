import {
  applyListEdit,
  ArchiveTicketInput,
  BulkArchiveTicketsInput,
  BulkDeleteTicketsInput,
  BulkUpdateTicketsInput,
  CompleteSprintInput,
  Conflict,
  CreateTicketInput,
  Estimate,
  Forbidden,
  GroupId,
  ListEdit,
  MentionInvalid,
  NotFound,
  SprintCompletedImmutable,
  type SyncCursor,
  TicketFact,
  TicketFlag,
  TicketId,
  TicketPriority,
  type GroupHeader,
  UpdateGroupInput,
  UpdateTicketInput,
  Validation
} from "@pp/shared"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"

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
  parent: { parent: Schema.NullOr(Schema.String) },
  create: { fact: TicketFact },
  archive: {
    at: Schema.DateFromString,
    duplicateOf: Schema.NullOr(Schema.String)
  },
  restore: {},
  delete: { cascade: Schema.Boolean },
  regroup: { from: Schema.String, to: Schema.NullOr(Schema.String) }
})
export type Intent = typeof Intent.Type

export const GroupIntent = Schema.TaggedUnion({
  edit: {
    patch: Schema.Struct(Struct.omit(UpdateGroupInput.fields, ["body"]))
  },
  complete: { at: Schema.DateFromString, destination: Schema.NullOr(GroupId) }
})
export type GroupIntent = typeof GroupIntent.Type

export const PendingGroupEdit = Schema.Struct({
  group: Schema.String,
  intents: Schema.Array(GroupIntent)
})
export type PendingGroupEdit = typeof PendingGroupEdit.Type

export const PendingEdit = Schema.Struct({
  ticket: Schema.String,
  intents: Schema.Array(Intent)
})
export type PendingEdit = typeof PendingEdit.Type

export const PendingWrite = Schema.TaggedUnion({
  update: { ticket: TicketId, payload: UpdateTicketInput },
  bulk: { payload: BulkUpdateTicketsInput },
  create: {
    placeholder: TicketId,
    payload: CreateTicketInput,
    sprint: Schema.NullOr(GroupId)
  },
  archive: { ticket: TicketId, payload: ArchiveTicketInput },
  bulkArchive: { payload: BulkArchiveTicketsInput },
  restore: { ticket: TicketId },
  delete: { payload: BulkDeleteTicketsInput },
  updateGroup: { group: GroupId, payload: UpdateGroupInput },
  completeGroup: { group: GroupId, payload: CompleteSprintInput }
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
export const encodeGroupEdits = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(PendingGroupEdit))
)
export const decodeGroupEdits = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(PendingGroupEdit))
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
export const encodeBase = Schema.encodeSync(
  Schema.fromJsonString(Schema.NullOr(TicketFact))
)
export const decodeBase = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.NullOr(TicketFact))
)

const PLACEHOLDER_FLOOR = 1e15

export const placeholderTicketId = (prefix: string, random: number): TicketId =>
  TicketId.make(
    `${prefix}-${PLACEHOLDER_FLOOR + Math.floor(random * PLACEHOLDER_FLOOR)}`
  )

export const isPlaceholderTicket = (id: string): boolean =>
  Number(id.slice(id.lastIndexOf("-") + 1)) >= PLACEHOLDER_FLOOR

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
    archive: ({ at, duplicateOf }) => ({
      ...fact,
      archivedAt: fact.archivedAt ?? at,
      relations:
        duplicateOf === null
          ? fact.relations
          : [
              ...fact.relations.filter(
                (relation) => relation.kind !== "duplicate_of"
              ),
              { to: duplicateOf, kind: "duplicate_of" }
            ]
    }),
    restore: () => ({
      ...fact,
      archivedAt: null,
      relations: fact.relations.filter(
        (relation) => relation.kind !== "duplicate_of"
      )
    }),
    sprint: () => fact,
    regroup: () => fact,
    create: () => fact,
    delete: () => fact
  })

const regrouped = (
  groups: ReadonlyArray<Membership>,
  from: string,
  to: string | null
) => {
  const kept = groups.filter((member) => member.group !== from)
  return to === null || kept.some((member) => member.group === to)
    ? kept
    : [...kept, { group: to, position: APPENDED }]
}

export const applyGroupIntents = (
  header: GroupHeader,
  intents: ReadonlyArray<GroupIntent>
): GroupHeader =>
  intents.reduce(
    (current, intent) =>
      GroupIntent.match(intent, {
        edit: ({ patch }) => ({
          ...current,
          name: patch.name ?? current.name,
          color: patch.color ?? current.color,
          startsAt:
            patch.startsAt === undefined ? current.startsAt : patch.startsAt,
          endsAt: patch.endsAt === undefined ? current.endsAt : patch.endsAt,
          completedAt:
            patch.completedAt === undefined
              ? current.completedAt
              : patch.completedAt
        }),
        complete: ({ at }) => ({
          ...current,
          completedAt: current.completedAt ?? at
        })
      }),
    header
  )

const applyIntent = (
  state: TicketState | null,
  intent: Intent,
  openSprints: ReadonlySet<string>
): TicketState | null => {
  if (Intent.guards.create(intent))
    return state ?? { fact: intent.fact, groups: [] }
  if (state === null || Intent.guards.delete(intent)) return null
  if (Intent.guards.sprint(intent))
    return {
      ...state,
      groups: intoSprint(state.groups, intent.sprint, openSprints)
    }
  if (Intent.guards.regroup(intent))
    return {
      ...state,
      groups: regrouped(state.groups, intent.from, intent.to)
    }
  return { ...state, fact: applyToFact(state.fact, intent) }
}

export const applyIntents = (
  state: TicketState | null,
  intents: ReadonlyArray<Intent>,
  openSprints: ReadonlySet<string>
): TicketState | null =>
  intents.reduce(
    (current, intent) => applyIntent(current, intent, openSprints),
    state
  )

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
