import type {
  BlockDefinition,
  Conflict,
  CreateBlockInput,
  CreateTemplateInput,
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
  Validation,
  OrgScope,
  ProjectScope
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

type OrgEditError = Validation | MentionInvalid | MarkdownError

type ProjectEditError = NotFound | OrgEditError

export type LibraryShape = Readonly<{
  orgLibrary: () => Effect.Effect<
    LibraryValue,
    NotFound | MarkdownError,
    OrgScope
  >
  projectLibrary: () => Effect.Effect<
    LibraryValue,
    NotFound | MarkdownError,
    ProjectScope
  >
  createOrgBlock: (
    input: CreateBlockInput
  ) => Effect.Effect<BlockDefinition, OrgEditError | Conflict, OrgScope>
  updateOrgBlock: (
    key: string,
    input: UpdateBlockInput
  ) => Effect.Effect<BlockDefinition, OrgEditError | NotFound, OrgScope>
  removeOrgBlock: (
    key: string
  ) => Effect.Effect<void, NotFound | MarkdownError, OrgScope>
  createOrgTemplate: (
    input: CreateTemplateInput
  ) => Effect.Effect<TemplateDefinition, OrgEditError | Conflict, OrgScope>
  updateOrgTemplate: (
    key: string,
    input: UpdateTemplateInput
  ) => Effect.Effect<TemplateDefinition, OrgEditError | NotFound, OrgScope>
  removeOrgTemplate: (
    key: string
  ) => Effect.Effect<void, NotFound | MarkdownError, OrgScope>
  setOrgTemplateDefaults: (
    input: UpdateTemplateDefaultsInput
  ) => Effect.Effect<
    LibraryDefaults,
    NotFound | Validation | MarkdownError,
    OrgScope
  >
  createBlock: (
    input: CreateBlockInput
  ) => Effect.Effect<BlockDefinition, ProjectEditError | Conflict, ProjectScope>
  updateBlock: (
    key: string,
    input: UpdateBlockInput
  ) => Effect.Effect<BlockDefinition, ProjectEditError, ProjectScope>
  removeBlock: (
    key: string
  ) => Effect.Effect<void, NotFound | MarkdownError, ProjectScope>
  hideBlock: (
    key: string
  ) => Effect.Effect<void, NotFound | Conflict | MarkdownError, ProjectScope>
  createTemplate: (
    input: CreateTemplateInput
  ) => Effect.Effect<
    TemplateDefinition,
    ProjectEditError | Conflict,
    ProjectScope
  >
  updateTemplate: (
    key: string,
    input: UpdateTemplateInput
  ) => Effect.Effect<TemplateDefinition, ProjectEditError, ProjectScope>
  removeTemplate: (
    key: string
  ) => Effect.Effect<void, NotFound | MarkdownError, ProjectScope>
  hideTemplate: (
    key: string
  ) => Effect.Effect<void, NotFound | Conflict | MarkdownError, ProjectScope>
  setTemplateDefaults: (
    input: UpdateTemplateDefaultsInput
  ) => Effect.Effect<
    LibraryDefaults,
    NotFound | Validation | MarkdownError,
    ProjectScope
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
