import type {
  CompleteSprintInput,
  CompleteSprintOutput,
  GroupId,
  CreateGroupInput,
  CursorPayload,
  Group,
  GroupDetail,
  GroupFilter,
  NotFound,
  SprintCompletedImmutable,
  SprintState,
  TicketId,
  UpdateGroupInput,
  UpdateGroupTicketsInput,
  UpdateGroupTicketsOutput,
  UpdateTicketOrderInput,
  Validation,
  ProjectScope,
  Forbidden
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { MarkdownError } from "../markdown/Markdown"

export interface GroupsShape {
  readonly list: () => Effect.Effect<
    ReadonlyArray<Group>,
    NotFound | MarkdownError,
    ProjectScope
  >
  readonly listPaged: (
    filter: GroupFilter | undefined,
    cursor: CursorPayload | undefined,
    limit: number
  ) => Effect.Effect<
    { items: ReadonlyArray<Group>; nextCursor: string | null },
    NotFound | MarkdownError,
    ProjectScope
  >
  readonly listSprintsPaged: (
    state: SprintState | undefined,
    cursor: CursorPayload | undefined,
    limit: number
  ) => Effect.Effect<
    { items: ReadonlyArray<Group>; nextCursor: string | null },
    NotFound | MarkdownError,
    ProjectScope
  >
  readonly get: (
    id: string
  ) => Effect.Effect<GroupDetail, NotFound | MarkdownError, ProjectScope>
  readonly create: (
    input: CreateGroupInput
  ) => Effect.Effect<
    Group,
    Forbidden | NotFound | Validation | MarkdownError,
    ProjectScope
  >
  readonly update: (
    id: string,
    input: UpdateGroupInput
  ) => Effect.Effect<
    GroupDetail,
    Forbidden | NotFound | Validation | MarkdownError,
    ProjectScope
  >
  readonly updateTickets: (
    id: string,
    input: UpdateGroupTicketsInput
  ) => Effect.Effect<
    UpdateGroupTicketsOutput,
    Forbidden | NotFound | SprintCompletedImmutable | MarkdownError,
    ProjectScope
  >
  readonly addTickets: (
    id: string,
    ticketIds: ReadonlyArray<TicketId>
  ) => Effect.Effect<
    UpdateGroupTicketsOutput,
    Forbidden | NotFound | SprintCompletedImmutable | MarkdownError,
    ProjectScope
  >
  readonly removeTickets: (
    id: string,
    ticketIds: ReadonlyArray<TicketId>
  ) => Effect.Effect<
    UpdateGroupTicketsOutput,
    Forbidden | NotFound | SprintCompletedImmutable | MarkdownError,
    ProjectScope
  >
  readonly updateTicketOrder: (
    id: string,
    input: Omit<UpdateTicketOrderInput, "status">
  ) => Effect.Effect<
    GroupDetail,
    | Forbidden
    | NotFound
    | SprintCompletedImmutable
    | Validation
    | MarkdownError,
    ProjectScope
  >
  readonly complete: (
    id: string,
    input: CompleteSprintInput
  ) => Effect.Effect<
    CompleteSprintOutput,
    | Forbidden
    | NotFound
    | SprintCompletedImmutable
    | Validation
    | MarkdownError,
    ProjectScope
  >
  readonly remove: (
    id: string
  ) => Effect.Effect<void, Forbidden | NotFound | MarkdownError, ProjectScope>
  readonly ensureSprintAssignable: (
    sprintIds: ReadonlyArray<GroupId>
  ) => Effect.Effect<
    void,
    Forbidden | NotFound | SprintCompletedImmutable | MarkdownError,
    ProjectScope
  >
  readonly setSprintMembership: (
    orgSlug: string,
    slug: string,
    ticketId: TicketId,
    sprintId: GroupId | null,
    options?: { readonly after?: TicketId | null }
  ) => Effect.Effect<void, MarkdownError>
  readonly removeTicketFromAllGroups: (
    orgSlug: string,
    slug: string,
    ticketId: string
  ) => Effect.Effect<void, MarkdownError>
}

export class Groups extends Context.Service<Groups, GroupsShape>()(
  "@pp/server-core/groups/Groups"
) {}
