import type {
  Conflict,
  CreateTagInput,
  CursorPayload,
  NotFound,
  Tag,
  UpdateTagInput
} from "@pp/shared"
import type { ProjectScope } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { MarkdownError } from "../markdown/Markdown"

export interface TagsShape {
  readonly list: () => Effect.Effect<ReadonlyArray<Tag>, never, ProjectScope>
  readonly listPaged: (
    cursor: CursorPayload | undefined,
    limit: number
  ) => Effect.Effect<
    { items: ReadonlyArray<Tag>; nextCursor: string | null },
    never,
    ProjectScope
  >
  readonly create: (
    input: CreateTagInput
  ) => Effect.Effect<Tag, NotFound | Conflict, ProjectScope>
  readonly update: (
    name: string,
    patch: UpdateTagInput
  ) => Effect.Effect<Tag, NotFound | Conflict | MarkdownError, ProjectScope>
  readonly remove: (
    name: string
  ) => Effect.Effect<void, NotFound | MarkdownError, ProjectScope>
}

export class Tags extends Context.Service<Tags, TagsShape>()(
  "@pp/server-core/tags/Tags"
) {}
