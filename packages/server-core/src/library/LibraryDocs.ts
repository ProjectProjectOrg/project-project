import type { BlockDraft, Layer } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { LibraryKind, MarkdownError } from "../markdown/Markdown"

export type LibraryDocsShape = Readonly<{
  readLayer: (
    orgSlug: string,
    projectSlug: string | null
  ) => Effect.Effect<Layer, MarkdownError>
  writeBlock: (
    orgSlug: string,
    projectSlug: string | null,
    draft: BlockDraft
  ) => Effect.Effect<void, MarkdownError>
  writeTombstone: (
    orgSlug: string,
    projectSlug: string | null,
    kind: LibraryKind,
    key: string
  ) => Effect.Effect<void, MarkdownError>
  hasFile: (
    orgSlug: string,
    projectSlug: string | null,
    kind: LibraryKind,
    key: string
  ) => Effect.Effect<boolean, MarkdownError>
  remove: (
    orgSlug: string,
    projectSlug: string | null,
    kind: LibraryKind,
    key: string
  ) => Effect.Effect<boolean, MarkdownError>
}>

export class LibraryDocs extends Context.Service<
  LibraryDocs,
  LibraryDocsShape
>()("@pp/server-core/library/LibraryDocs") {}
