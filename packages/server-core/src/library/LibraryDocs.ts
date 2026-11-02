import {
  type BlockDraft,
  type Layer as LibraryLayer,
  type PartialTemplateDefaults,
  type TemplateDraft,
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
  TicketPriority
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { markdownFileContent, parseMarkdownFile } from "../markdown/fileContent"
import * as Markdown from "../markdown/Markdown"
import {
  templateDefaultsFrom,
  withTemplateDefaults
} from "./templateDefaultsFrontmatter"

export class LibraryDocs extends Context.Service<
  LibraryDocs,
  Readonly<{
    readLayer: (
      orgSlug: string,
      projectSlug: string | null
    ) => Effect.Effect<LibraryLayer, Markdown.MarkdownError>
    writeBlock: (
      orgSlug: string,
      projectSlug: string | null,
      draft: BlockDraft
    ) => Effect.Effect<void, Markdown.MarkdownError>
    writeTemplate: (
      orgSlug: string,
      projectSlug: string | null,
      draft: TemplateDraft
    ) => Effect.Effect<void, Markdown.MarkdownError>
    writeTombstone: (
      orgSlug: string,
      projectSlug: string | null,
      kind: Markdown.LibraryKind,
      key: string
    ) => Effect.Effect<void, Markdown.MarkdownError>
    readOrgDefaults: (
      orgSlug: string
    ) => Effect.Effect<PartialTemplateDefaults, Markdown.MarkdownError>
    writeOrgDefaults: (
      orgSlug: string,
      defaults: PartialTemplateDefaults
    ) => Effect.Effect<void, Markdown.MarkdownError>

    hasFile: (
      orgSlug: string,
      projectSlug: string | null,
      kind: Markdown.LibraryKind,
      key: string
    ) => Effect.Effect<boolean, Markdown.MarkdownError>
    remove: (
      orgSlug: string,
      projectSlug: string | null,
      kind: Markdown.LibraryKind,
      key: string
    ) => Effect.Effect<boolean, Markdown.MarkdownError>
  }>
>()("@pp/server-core/library/LibraryDocs") {}

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

const parseFile = (file: Markdown.LibraryFile): Option.Option<ParsedFile> => {
  try {
    const parsed = parseMarkdownFile(normalizeLineEndings(file.content))
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

const classifyFile = <A>(decode: (file: ParsedFile) => Option.Option<A>) => {
  const ClassifiedFile = Data.taggedEnum<ClassifiedFile<A>>()
  return (file: Markdown.LibraryFile): ClassifiedFile<A> => {
    const parsed = parseFile(file)
    if (Option.isNone(parsed)) return ClassifiedFile.skipped({ key: file.key })
    if (isTombstone(parsed.value.data))
      return ClassifiedFile.hidden({ key: file.key })
    return Option.match(decode(parsed.value), {
      onNone: () => ClassifiedFile.skipped({ key: file.key }),
      onSome: (definition) => ClassifiedFile.definition({ definition })
    })
  }
}

type OrgLibraryFile = Readonly<{
  data: Record<string, unknown>
  body: string
}>

const EMPTY_ORG_FILE: OrgLibraryFile = { data: {}, body: "" }

class OrgLibraryUnreadable extends Data.TaggedError("OrgLibraryUnreadable")<
  Readonly<{ cause: unknown; orgSlug: string }>
> {}

const parseOrgFile = (
  orgSlug: string,
  content: string
): Effect.Effect<OrgLibraryFile, OrgLibraryUnreadable> =>
  Effect.try({
    try: () => {
      const parsed = parseMarkdownFile(content)
      return { data: parsed.data, body: parsed.content }
    },
    catch: (cause) => new OrgLibraryUnreadable({ cause, orgSlug })
  })

const annotateLibraryDoc = <A, E>(
  operation: string,
  orgSlug: string,
  projectSlug: string | null,
  attributes: Record<string, unknown>,
  effect: Effect.Effect<A, E>
): Effect.Effect<A, E> => {
  const annotations = {
    module: "LibraryDocs",
    operation,
    orgSlug,
    projectSlug,
    ...attributes
  }
  return Effect.annotateCurrentSpan(annotations).pipe(
    Effect.andThen(effect),
    Effect.annotateLogs(annotations)
  )
}

const make = Effect.gen(function* () {
  const markdown = yield* Markdown.Markdown

  const readKind = <A>(
    orgSlug: string,
    projectSlug: string | null,
    kind: Markdown.LibraryKind,
    decode: (file: ParsedFile) => Option.Option<A>
  ): Effect.Effect<DecodedLayerPart<A>, Markdown.MarkdownError> =>
    Effect.gen(function* () {
      const files = yield* markdown.listLibraryFiles(orgSlug, projectSlug, kind)
      const classified = files.map(classifyFile(decode))
      yield* Effect.forEach(
        classified.flatMap((entry) =>
          Match.value(entry).pipe(
            Match.tag("skipped", (entry) => [entry.key]),
            Match.orElse(() => [])
          )
        ),
        (key) =>
          Effect.logWarning("skipping unreadable library file").pipe(
            Effect.annotateLogs({ kind, key })
          ),
        { discard: true }
      )
      return {
        definitions: classified.flatMap((entry) =>
          Match.value(entry).pipe(
            Match.tag("definition", (entry) => [entry.definition]),
            Match.orElse(() => [])
          )
        ),
        hidden: classified.flatMap((entry) =>
          Match.value(entry).pipe(
            Match.tag("hidden", (entry) => [entry.key]),
            Match.orElse(() => [])
          )
        )
      }
    })

  const readLayer = Effect.fn("LibraryDocs.readLayer")(function* (
    orgSlug: string,
    projectSlug: string | null
  ) {
    return yield* annotateLibraryDoc(
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
  })

  const writeBlock = Effect.fn("LibraryDocs.writeBlock")(function* (
    orgSlug: string,
    projectSlug: string | null,
    draft: BlockDraft
  ) {
    const { key, content, ...frontmatter } = draft
    return yield* annotateLibraryDoc(
      "writeBlock",
      orgSlug,
      projectSlug,
      { key },
      markdown.writeLibraryFile(
        orgSlug,
        projectSlug,
        "blocks",
        key,
        markdownFileContent(encodeBlockFrontmatter(frontmatter), content)
      )
    )
  })

  const writeTemplate = Effect.fn("LibraryDocs.writeTemplate")(function* (
    orgSlug: string,
    projectSlug: string | null,
    draft: TemplateDraft
  ) {
    const { key, body, ...frontmatter } = draft
    return yield* annotateLibraryDoc(
      "writeTemplate",
      orgSlug,
      projectSlug,
      { key },
      markdown.writeLibraryFile(
        orgSlug,
        projectSlug,
        "templates",
        key,
        markdownFileContent(encodeTemplateFrontmatter(frontmatter), body)
      )
    )
  })

  const writeTombstone = Effect.fn("LibraryDocs.writeTombstone")(function* (
    orgSlug: string,
    projectSlug: string | null,
    kind: Markdown.LibraryKind,
    key: string
  ) {
    return yield* annotateLibraryDoc(
      "writeTombstone",
      orgSlug,
      projectSlug,
      { kind, key },
      markdown.writeLibraryFile(orgSlug, projectSlug, kind, key, TOMBSTONE)
    )
  })

  const readOrgFile = (
    orgSlug: string
  ): Effect.Effect<
    OrgLibraryFile,
    Markdown.MarkdownError | OrgLibraryUnreadable
  > =>
    markdown
      .readOrgLibraryFile(orgSlug)
      .pipe(
        Effect.flatMap((content) =>
          content === null
            ? Effect.succeed(EMPTY_ORG_FILE)
            : parseOrgFile(orgSlug, content)
        )
      )

  const readOrgDefaults = Effect.fn("LibraryDocs.readOrgDefaults")(function* (
    orgSlug: string
  ) {
    return yield* annotateLibraryDoc(
      "readOrgDefaults",
      orgSlug,
      null,
      {},
      readOrgFile(orgSlug).pipe(
        Effect.catchTag("OrgLibraryUnreadable", () =>
          Effect.logWarning("skipping unreadable org library file").pipe(
            Effect.as(EMPTY_ORG_FILE)
          )
        ),
        Effect.map((file) => templateDefaultsFrom(file.data))
      )
    )
  })

  const writeOrgDefaults = Effect.fn("LibraryDocs.writeOrgDefaults")(function* (
    orgSlug: string,
    defaults: PartialTemplateDefaults
  ) {
    return yield* annotateLibraryDoc(
      "writeOrgDefaults",
      orgSlug,
      null,
      {},
      Effect.gen(function* () {
        const file = yield* readOrgFile(orgSlug).pipe(
          Effect.catchTag("OrgLibraryUnreadable", (error) =>
            Effect.fail(
              new Markdown.MarkdownError({
                cause: error.cause,
                message: `refusing to overwrite unparseable orgs/${orgSlug}/library.md`
              })
            )
          )
        )
        yield* markdown.writeOrgLibraryFile(
          orgSlug,
          markdownFileContent(
            withTemplateDefaults(file.data, defaults),
            file.body
          )
        )
      })
    )
  })

  const hasFile = Effect.fn("LibraryDocs.hasFile")(function* (
    orgSlug: string,
    projectSlug: string | null,
    kind: Markdown.LibraryKind,
    key: string
  ) {
    return yield* annotateLibraryDoc(
      "hasFile",
      orgSlug,
      projectSlug,
      { kind, key },
      markdown
        .listLibraryFiles(orgSlug, projectSlug, kind)
        .pipe(Effect.map((files) => files.some((file) => file.key === key)))
    )
  })

  const remove = Effect.fn("LibraryDocs.remove")(function* (
    orgSlug: string,
    projectSlug: string | null,
    kind: Markdown.LibraryKind,
    key: string
  ) {
    return yield* annotateLibraryDoc(
      "remove",
      orgSlug,
      projectSlug,
      { kind, key },
      markdown.removeLibraryFile(orgSlug, projectSlug, kind, key)
    )
  })

  return LibraryDocs.of({
    readLayer,
    writeBlock,
    writeTemplate,
    writeTombstone,
    readOrgDefaults,
    writeOrgDefaults,
    hasFile,
    remove
  })
})

export const layer = Layer.effect(LibraryDocs, make)
