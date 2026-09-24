import type {
  BlockDefinition,
  Conflict,
  CreateBlockInput,
  CreateTemplateInput,
  Forbidden,
  Library as LibraryValue,
  MentionInvalid,
  NotFound,
  TagName,
  LibraryDefaults,
  TemplateDefinition,
  TemplateKey,
  TicketPriority,
  TicketType,
  UpdateBlockInput,
  UpdateTemplateDefaultsInput,
  UpdateTemplateInput,
  Validation
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { MarkdownError } from "../markdown/Markdown"

export type TemplateExpansion = Readonly<{
  body: string
  type: TicketType | null
  priority: TicketPriority | null
  tags: ReadonlyArray<TagName>
}>

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
  createTemplate: (
    orgSlug: string,
    userId: string,
    slug: string | null,
    input: CreateTemplateInput
  ) => Effect.Effect<
    TemplateDefinition,
    | NotFound
    | Forbidden
    | Conflict
    | Validation
    | MentionInvalid
    | MarkdownError
  >
  updateTemplate: (
    orgSlug: string,
    userId: string,
    slug: string | null,
    key: string,
    input: UpdateTemplateInput
  ) => Effect.Effect<
    TemplateDefinition,
    NotFound | Forbidden | Validation | MentionInvalid | MarkdownError
  >
  removeTemplate: (
    orgSlug: string,
    userId: string,
    slug: string | null,
    key: string
  ) => Effect.Effect<void, NotFound | Forbidden | MarkdownError>
  hideTemplate: (
    orgSlug: string,
    userId: string,
    slug: string,
    key: string
  ) => Effect.Effect<void, NotFound | Forbidden | Conflict | MarkdownError>
  setOrgTemplateDefaults: (
    orgSlug: string,
    userId: string,
    input: UpdateTemplateDefaultsInput
  ) => Effect.Effect<
    LibraryDefaults,
    NotFound | Forbidden | Validation | MarkdownError
  >
  setTemplateDefaults: (
    orgSlug: string,
    userId: string,
    slug: string,
    input: UpdateTemplateDefaultsInput
  ) => Effect.Effect<
    LibraryDefaults,
    NotFound | Forbidden | Validation | MarkdownError
  >
  expandForCreate: (
    orgSlug: string,
    slug: string,
    key: TemplateKey
  ) => Effect.Effect<TemplateExpansion, NotFound | Validation | MarkdownError>
  resolveSynced: (
    orgSlug: string,
    slug: string,
    body: string
  ) => Effect.Effect<string, MarkdownError>
}>

export class Library extends Context.Service<Library, LibraryShape>()(
  "@pp/server-core/library/Library"
) {}
