import {
  BlockIcon,
  BlockKey,
  FALLBACK_BLOCK_ICON,
  LibraryColor,
  LibraryContent,
  LibraryDescription,
  LibraryName,
  normalizeLineEndings,
  TagName,
  TemplateKey,
  TicketPriority,
  TicketType,
  type BlockDraft,
  type Layer as LibraryLayer,
  type PartialTemplateDefaults,
  type TemplateDraft
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import matter from "gray-matter"

import {
  Markdown,
  type LibraryFile,
  type LibraryKind,
  type MarkdownError
} from "../markdown/Markdown"
import { LibraryDocs, type LibraryDocsShape } from "./LibraryDocs"
import {
  templateDefaultsFrom,
  withTemplateDefaults
} from "./templateDefaultsFrontmatter"

const withDefault = <S extends Schema.Top>(schema: S, value: S["Type"]) =>
  schema.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(value)))

const BlockFrontmatter = Schema.Struct({
  name: LibraryName,
  icon: withDefault(BlockIcon, FALLBACK_BLOCK_ICON),
  color: withDefault(LibraryColor, null),
  description: withDefault(LibraryDescription, ""),
  sync: withDefault(Schema.Boolean, false)
})

const TemplateFrontmatter = Schema.Struct({
  name: LibraryName,
  icon: withDefault(BlockIcon, FALLBACK_BLOCK_ICON),
  color: withDefault(LibraryColor, null),
  description: withDefault(LibraryDescription, ""),
  type: withDefault(Schema.NullOr(TicketType), null),
  priority: withDefault(Schema.NullOr(TicketPriority), null),
  tags: withDefault(Schema.Array(TagName), [])
})

const TOMBSTONE = "---\nhidden: true\n---\n"

const Tombstone = Schema.Struct({ hidden: Schema.Literal(true) })

const isTombstone = Schema.is(Tombstone)
const decodeBlockFrontmatter = Schema.decodeUnknownOption(BlockFrontmatter)
const decodeTemplateFrontmatter =
  Schema.decodeUnknownOption(TemplateFrontmatter)
const decodeBlockKey = Schema.decodeUnknownOption(BlockKey)
const decodeTemplateKey = Schema.decodeUnknownOption(TemplateKey)
const decodeContent = Schema.decodeUnknownOption(LibraryContent)
const encodeBlockFrontmatter = Schema.encodeSync(BlockFrontmatter)
const encodeTemplateFrontmatter = Schema.encodeSync(TemplateFrontmatter)

const trimBlankLines = (text: string): string =>
  text.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/(?:\r?\n[ \t]*)+$/, "")

type ParsedFile = Readonly<{
  key: string
  data: Record<string, unknown>
  body: string
}>

type DecodedLayerPart<A> = Readonly<{
  definitions: ReadonlyArray<A>
  hidden: ReadonlyArray<string>
}>

const parseFile = (file: LibraryFile): Option.Option<ParsedFile> => {
  try {
    const parsed = matter(normalizeLineEndings(file.content))
    return Option.some({
      key: file.key,
      data: parsed.data,
      body: trimBlankLines(parsed.content)
    })
  } catch {
    return Option.none()
  }
}

const decodeBlock = (file: ParsedFile): Option.Option<BlockDraft> =>
  Option.all({
    key: decodeBlockKey(file.key),
    frontmatter: decodeBlockFrontmatter(file.data),
    content: decodeContent(file.body)
  }).pipe(
    Option.map(({ key, frontmatter, content }) => ({
      key,
      ...frontmatter,
      content
    }))
  )

const decodeTemplate = (file: ParsedFile): Option.Option<TemplateDraft> =>
  Option.all({
    key: decodeTemplateKey(file.key),
    frontmatter: decodeTemplateFrontmatter(file.data),
    body: decodeContent(file.body)
  }).pipe(
    Option.map(({ key, frontmatter, body }) => ({
      key,
      ...frontmatter,
      body
    }))
  )

type ClassifiedFile<A> =
  | Readonly<{ _tag: "definition"; definition: A }>
  | Readonly<{ _tag: "hidden"; key: string }>
  | Readonly<{ _tag: "skipped"; key: string }>

const classifyFile = <A>(
  file: LibraryFile,
  decode: (file: ParsedFile) => Option.Option<A>
): ClassifiedFile<A> => {
  const parsed = parseFile(file)
  if (Option.isNone(parsed)) return { _tag: "skipped", key: file.key }
  if (isTombstone(parsed.value.data)) return { _tag: "hidden", key: file.key }
  return Option.match(decode(parsed.value), {
    onNone: (): ClassifiedFile<A> => ({ _tag: "skipped", key: file.key }),
    onSome: (definition): ClassifiedFile<A> => ({
      _tag: "definition",
      definition
    })
  })
}

function withLibraryDocTelemetry<A, E>(
  operation: string,
  orgSlug: string,
  projectSlug: string | null,
  attributes: Record<string, unknown>,
  effect: Effect.Effect<A, E>
): Effect.Effect<A, E> {
  const annotations = {
    module: "LibraryDocs",
    operation,
    orgSlug,
    projectSlug,
    ...attributes
  }
  return effect.pipe(
    Effect.withSpan(`LibraryDocs.${operation}`, { attributes: annotations }),
    Effect.annotateLogs(annotations)
  )
}

export const LibraryDocsLive = Layer.effect(
  LibraryDocs,
  Effect.gen(function* () {
    const markdown = yield* Markdown

    const readKind = <A>(
      orgSlug: string,
      projectSlug: string | null,
      kind: LibraryKind,
      decode: (file: ParsedFile) => Option.Option<A>
    ): Effect.Effect<DecodedLayerPart<A>, MarkdownError> =>
      Effect.gen(function* () {
        const files = yield* markdown.listLibraryFiles(
          orgSlug,
          projectSlug,
          kind
        )
        const classified = files.map((file) => classifyFile(file, decode))
        yield* Effect.forEach(
          classified.flatMap((entry) =>
            entry._tag === "skipped" ? [entry.key] : []
          ),
          (key) =>
            Effect.logWarning("skipping unreadable library file").pipe(
              Effect.annotateLogs({ kind, key })
            ),
          { discard: true }
        )
        return {
          definitions: classified.flatMap((entry) =>
            entry._tag === "definition" ? [entry.definition] : []
          ),
          hidden: classified.flatMap((entry) =>
            entry._tag === "hidden" ? [entry.key] : []
          )
        }
      })

    const readLayer = (
      orgSlug: string,
      projectSlug: string | null
    ): Effect.Effect<LibraryLayer, MarkdownError> =>
      withLibraryDocTelemetry(
        "readLayer",
        orgSlug,
        projectSlug,
        {},
        Effect.gen(function* () {
          const [blocks, templates] = yield* Effect.all(
            [
              readKind(orgSlug, projectSlug, "blocks", decodeBlock),
              readKind(orgSlug, projectSlug, "templates", decodeTemplate)
            ],
            { concurrency: 2 }
          )
          return {
            blocks: blocks.definitions,
            templates: templates.definitions,
            hiddenBlocks: blocks.hidden,
            hiddenTemplates: templates.hidden
          }
        })
      )

    const writeBlock = (
      orgSlug: string,
      projectSlug: string | null,
      draft: BlockDraft
    ): Effect.Effect<void, MarkdownError> => {
      const { key, content, ...frontmatter } = draft
      return withLibraryDocTelemetry(
        "writeBlock",
        orgSlug,
        projectSlug,
        { key },
        markdown.writeLibraryFile(
          orgSlug,
          projectSlug,
          "blocks",
          key,
          matter.stringify(content, encodeBlockFrontmatter(frontmatter))
        )
      )
    }

    const writeTemplate = (
      orgSlug: string,
      projectSlug: string | null,
      draft: TemplateDraft
    ): Effect.Effect<void, MarkdownError> => {
      const { key, body, ...frontmatter } = draft
      return withLibraryDocTelemetry(
        "writeTemplate",
        orgSlug,
        projectSlug,
        { key },
        markdown.writeLibraryFile(
          orgSlug,
          projectSlug,
          "templates",
          key,
          matter.stringify(body, encodeTemplateFrontmatter(frontmatter))
        )
      )
    }

    const writeTombstone = (
      orgSlug: string,
      projectSlug: string | null,
      kind: LibraryKind,
      key: string
    ): Effect.Effect<void, MarkdownError> =>
      withLibraryDocTelemetry(
        "writeTombstone",
        orgSlug,
        projectSlug,
        { kind, key },
        markdown.writeLibraryFile(orgSlug, projectSlug, kind, key, TOMBSTONE)
      )

    const readOrgFile = (orgSlug: string) =>
      markdown.readOrgLibraryFile(orgSlug).pipe(
        Effect.map((content) => {
          if (content === null) return { data: {}, body: "" }
          try {
            const parsed = matter(content)
            return { data: parsed.data, body: parsed.content }
          } catch {
            return { data: {}, body: "" }
          }
        })
      )

    const readOrgDefaults = (
      orgSlug: string
    ): Effect.Effect<PartialTemplateDefaults, MarkdownError> =>
      withLibraryDocTelemetry(
        "readOrgDefaults",
        orgSlug,
        null,
        {},
        readOrgFile(orgSlug).pipe(
          Effect.map((file) => templateDefaultsFrom(file.data))
        )
      )

    const writeOrgDefaults = (
      orgSlug: string,
      defaults: PartialTemplateDefaults
    ): Effect.Effect<void, MarkdownError> =>
      withLibraryDocTelemetry(
        "writeOrgDefaults",
        orgSlug,
        null,
        {},
        Effect.gen(function* () {
          const file = yield* readOrgFile(orgSlug)
          yield* markdown.writeOrgLibraryFile(
            orgSlug,
            matter.stringify(
              file.body,
              withTemplateDefaults(file.data, defaults)
            )
          )
        })
      )

    const remove = (
      orgSlug: string,
      projectSlug: string | null,
      kind: LibraryKind,
      key: string
    ): Effect.Effect<boolean, MarkdownError> =>
      withLibraryDocTelemetry(
        "remove",
        orgSlug,
        projectSlug,
        { kind, key },
        markdown.removeLibraryFile(orgSlug, projectSlug, kind, key)
      )

    return {
      readLayer,
      writeBlock,
      writeTemplate,
      writeTombstone,
      readOrgDefaults,
      writeOrgDefaults,
      remove
    } satisfies LibraryDocsShape
  })
)
