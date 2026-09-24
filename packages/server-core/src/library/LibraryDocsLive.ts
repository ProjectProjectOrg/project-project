import {
  BlockIcon,
  BlockKey,
  FALLBACK_BLOCK_ICON,
  LibraryColor,
  LibraryContent,
  LibraryDescription,
  LibraryName,
  normalizeLineEndings,
  type BlockDraft,
  type Layer as LibraryLayer
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

const withDefault = <S extends Schema.Top>(schema: S, value: S["Type"]) =>
  schema.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(value)))

const BlockFrontmatter = Schema.Struct({
  name: LibraryName,
  icon: withDefault(BlockIcon, FALLBACK_BLOCK_ICON),
  color: withDefault(LibraryColor, null),
  description: withDefault(LibraryDescription, ""),
  sync: withDefault(Schema.Boolean, false)
})

const TOMBSTONE = "---\nhidden: true\n---\n"

const Tombstone = Schema.Struct({ hidden: Schema.Literal(true) })

const isTombstone = Schema.is(Tombstone)
const decodeBlockFrontmatter = Schema.decodeUnknownOption(BlockFrontmatter)
const decodeBlockKey = Schema.decodeUnknownOption(BlockKey)
const decodeContent = Schema.decodeUnknownOption(LibraryContent)
const encodeBlockFrontmatter = Schema.encodeSync(BlockFrontmatter)

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
        readKind(orgSlug, projectSlug, "blocks", decodeBlock).pipe(
          Effect.map((blocks) => ({
            blocks: blocks.definitions,
            hiddenBlocks: blocks.hidden
          }))
        )
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

    const hasFile = (
      orgSlug: string,
      projectSlug: string | null,
      kind: LibraryKind,
      key: string
    ): Effect.Effect<boolean, MarkdownError> =>
      withLibraryDocTelemetry(
        "hasFile",
        orgSlug,
        projectSlug,
        { kind, key },
        markdown
          .listLibraryFiles(orgSlug, projectSlug, kind)
          .pipe(Effect.map((files) => files.some((file) => file.key === key)))
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
      writeTombstone,
      hasFile,
      remove
    } satisfies LibraryDocsShape
  })
)
