import type {
  DeleteTicketQuery,
  ActivityActor,
  BulkUpdateTicketsInput,
  BulkUpdateTicketsResult,
  ClearStaleEstimatesResult,
  SprintCompletedImmutable,
  Conflict,
  CreateTicketInput,
  GroupDetail,
  MentionInvalid,
  NotFound,
  QuickCreateTicketInput,
  SplitTicketInput,
  SplitTicketResult,
  TicketDetail,
  TicketSort,
  TicketUpdateResult,
  UpdateTicketInput,
  UpdateTicketOrderInput,
  Validation,
  ProjectScope,
  Forbidden
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { InvalidCommentBody } from "../comments/Comments"
import type { MarkdownError } from "../markdown/Markdown"
import type { MalformedTicketDocument } from "./TicketDocs"

type TicketReadError = NotFound | MarkdownError | MalformedTicketDocument

export type TicketUpdateExpectation = Readonly<{
  body?: string
  updatedAt?: Date
}>

export type TicketsShape = Readonly<{
  quickCreate: (
    input: QuickCreateTicketInput
  ) => Effect.Effect<
    TicketDetail,
    Forbidden | NotFound | Validation | MentionInvalid | MarkdownError,
    ProjectScope
  >
  create: (
    input: CreateTicketInput
  ) => Effect.Effect<
    TicketDetail,
    Forbidden | NotFound | Validation | MentionInvalid | MarkdownError,
    ProjectScope
  >
  update: (
    id: string,
    input: UpdateTicketInput,
    sort?: TicketSort,
    expected?: TicketUpdateExpectation
  ) => Effect.Effect<
    TicketUpdateResult,
    Forbidden | TicketReadError | Validation | MentionInvalid | Conflict,
    ProjectScope | ActivityActor
  >
  clearStaleEstimates: () => Effect.Effect<
    ClearStaleEstimatesResult,
    Forbidden | TicketReadError,
    ProjectScope | ActivityActor
  >
  moveInGroup: (
    groupId: string,
    input: UpdateTicketOrderInput
  ) => Effect.Effect<
    GroupDetail,
    | NotFound
    | Forbidden
    | SprintCompletedImmutable
    | Validation
    | MarkdownError,
    ProjectScope | ActivityActor
  >
  split: (
    id: string,
    input: SplitTicketInput
  ) => Effect.Effect<
    SplitTicketResult,
    | Conflict
    | Forbidden
    | TicketReadError
    | Validation
    | MentionInvalid
    | SprintCompletedImmutable,
    ProjectScope | ActivityActor
  >
  bulkUpdate: (
    input: BulkUpdateTicketsInput
  ) => Effect.Effect<
    BulkUpdateTicketsResult,
    TicketReadError | Validation | Forbidden | SprintCompletedImmutable,
    ProjectScope | ActivityActor
  >
  remove: (
    id: string,
    options?: DeleteTicketQuery
  ) => Effect.Effect<
    void,
    NotFound | MarkdownError,
    ProjectScope | ActivityActor
  >
  archive: (
    id: string,
    reason?: string
  ) => Effect.Effect<
    TicketDetail,
    | Forbidden
    | Conflict
    | TicketReadError
    | MentionInvalid
    | InvalidCommentBody,
    ProjectScope | ActivityActor
  >
  unarchive: (
    id: string
  ) => Effect.Effect<
    TicketDetail,
    Forbidden | Conflict | TicketReadError,
    ProjectScope | ActivityActor
  >
  replaceTag: (
    orgSlug: string,
    slug: string,
    id: string,
    oldName: string,
    newName: string | null
  ) => Effect.Effect<boolean, TicketReadError, ActivityActor>
  replaceStatus: (
    orgSlug: string,
    slug: string,
    id: string,
    newStatus: string,
    reason: "renamed" | "removed"
  ) => Effect.Effect<boolean, TicketReadError, ActivityActor>
}>

export class Tickets extends Context.Service<Tickets, TicketsShape>()(
  "@pp/server-core/tickets/Tickets"
) {}
