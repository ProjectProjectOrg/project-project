import type {
  ActivityActor,
  ActivityCause,
  GroupDetail,
  GroupId,
  NotFound
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { GroupIdTaken, MarkdownError } from "../markdown/Markdown"

export type GroupDocument = GroupDetail

export type GroupActivityOptions = Readonly<{ cause?: ActivityCause }>

export interface GroupDocsShape {
  readonly listIds: (
    orgSlug: string,
    slug: string
  ) => Effect.Effect<ReadonlyArray<GroupId>, MarkdownError>
  readonly read: (
    orgSlug: string,
    slug: string,
    id: string
  ) => Effect.Effect<GroupDocument, NotFound | MarkdownError>
  readonly create: (
    orgSlug: string,
    slug: string,
    document: GroupDocument
  ) => Effect.Effect<void, MarkdownError | GroupIdTaken, ActivityActor>
  readonly write: (
    orgSlug: string,
    slug: string,
    id: string,
    document: GroupDocument,
    activity?: GroupActivityOptions
  ) => Effect.Effect<void, MarkdownError, ActivityActor>
  readonly writeIfExists: (
    orgSlug: string,
    slug: string,
    id: string,
    document: GroupDocument,
    activity?: GroupActivityOptions
  ) => Effect.Effect<void, NotFound | MarkdownError, ActivityActor>
  readonly remove: (
    orgSlug: string,
    slug: string,
    id: string
  ) => Effect.Effect<void, NotFound | MarkdownError, ActivityActor>
  readonly readRaw: (
    orgSlug: string,
    slug: string,
    id: string
  ) => Effect.Effect<
    { path: string; content: string },
    NotFound | MarkdownError
  >
}

export class GroupDocs extends Context.Service<GroupDocs, GroupDocsShape>()(
  "@pp/server-core/groups/GroupDocs"
) {}
