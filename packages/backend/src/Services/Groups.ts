import { Context, type Effect } from "effect"
import type {
  CreateGroupInput,
  Forbidden,
  Group,
  GroupDetail,
  NotFound,
  UpdateGroupInput,
  UpdateGroupTicketsInput,
  Validation
} from "@projectproject/shared"
import type { MarkdownError } from "./Markdown"

export interface GroupsShape {
  readonly list: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<ReadonlyArray<Group>, NotFound | MarkdownError>
  readonly get: (
    orgSlug: string,
    userId: string,
    slug: string,
    id: string
  ) => Effect.Effect<GroupDetail, NotFound | MarkdownError>
  readonly create: (
    orgSlug: string,
    userId: string,
    slug: string,
    input: CreateGroupInput
  ) => Effect.Effect<Group, NotFound | Forbidden | Validation | MarkdownError>
  readonly update: (
    orgSlug: string,
    userId: string,
    slug: string,
    id: string,
    input: UpdateGroupInput
  ) => Effect.Effect<
    GroupDetail,
    NotFound | Forbidden | Validation | MarkdownError
  >
  readonly updateTickets: (
    orgSlug: string,
    userId: string,
    slug: string,
    id: string,
    input: UpdateGroupTicketsInput
  ) => Effect.Effect<GroupDetail, NotFound | Forbidden | MarkdownError>
  readonly remove: (
    orgSlug: string,
    userId: string,
    slug: string,
    id: string
  ) => Effect.Effect<void, NotFound | Forbidden | MarkdownError>
  readonly removeTicketFromAllGroups: (
    orgSlug: string,
    slug: string,
    ticketId: string
  ) => Effect.Effect<void, MarkdownError>
}

export class Groups extends Context.Tag("Groups")<Groups, GroupsShape>() {}
