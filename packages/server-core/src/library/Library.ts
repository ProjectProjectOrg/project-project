import type {
  BlockDefinition,
  Conflict,
  CreateBlockInput,
  Forbidden,
  Library as LibraryValue,
  MentionInvalid,
  NotFound,
  UpdateBlockInput,
  Validation
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { MarkdownError } from "../markdown/Markdown"

export type LibraryShape = Readonly<{
  orgLibrary: (
    orgSlug: string,
    userId: string
  ) => Effect.Effect<LibraryValue, NotFound | MarkdownError>
  projectLibrary: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<LibraryValue, NotFound | MarkdownError>
  createBlock: (
    orgSlug: string,
    userId: string,
    slug: string | null,
    input: CreateBlockInput
  ) => Effect.Effect<
    BlockDefinition,
    | NotFound
    | Forbidden
    | Conflict
    | Validation
    | MentionInvalid
    | MarkdownError
  >
  updateBlock: (
    orgSlug: string,
    userId: string,
    slug: string | null,
    key: string,
    input: UpdateBlockInput
  ) => Effect.Effect<
    BlockDefinition,
    NotFound | Forbidden | Validation | MentionInvalid | MarkdownError
  >
  removeBlock: (
    orgSlug: string,
    userId: string,
    slug: string | null,
    key: string
  ) => Effect.Effect<void, NotFound | Forbidden | MarkdownError>
  hideBlock: (
    orgSlug: string,
    userId: string,
    slug: string,
    key: string
  ) => Effect.Effect<void, NotFound | Forbidden | Conflict | MarkdownError>
  resolveSynced: (
    orgSlug: string,
    slug: string,
    body: string
  ) => Effect.Effect<string, MarkdownError>
}>

export class Library extends Context.Service<Library, LibraryShape>()(
  "@pp/server-core/library/Library"
) {}
