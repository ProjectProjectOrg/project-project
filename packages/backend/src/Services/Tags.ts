import { Context, type Effect } from "effect"
import type {
  Conflict,
  CreateTagInput,
  Forbidden,
  NotFound,
  Tag,
  UpdateTagInput
} from "@projectproject/shared"
import type { MarkdownError } from "./Markdown"

export interface TagsShape {
  readonly list: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<ReadonlyArray<Tag>, NotFound>
  readonly create: (
    orgSlug: string,
    userId: string,
    slug: string,
    input: CreateTagInput
  ) => Effect.Effect<Tag, NotFound | Forbidden | Conflict>
  readonly update: (
    orgSlug: string,
    userId: string,
    slug: string,
    name: string,
    patch: UpdateTagInput
  ) => Effect.Effect<Tag, NotFound | Forbidden | Conflict | MarkdownError>
  readonly remove: (
    orgSlug: string,
    userId: string,
    slug: string,
    name: string
  ) => Effect.Effect<void, NotFound | Forbidden | MarkdownError>
}

export class Tags extends Context.Tag("Tags")<Tags, TagsShape>() {}
