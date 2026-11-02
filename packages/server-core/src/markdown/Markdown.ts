import { NotFound, LIBRARY_KEY_MAX_LENGTH, TicketId } from "@pp/shared"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"

import { splitDescriptionAndCommentsRegion } from "../comments/comments-region"
import {
  markdownFileContent,
  parseMarkdownFile,
  ticketFileBody
} from "./fileContent"

export class MarkdownError extends Data.TaggedError("MarkdownError")<{
  readonly cause: unknown
  readonly message: string
}> {}

export class TicketIdTaken extends Data.TaggedError("TicketIdTaken")<{}> {}

export class GroupIdTaken extends Data.TaggedError("GroupIdTaken")<{}> {}

export type ParsedMarkdown = Readonly<{
  data: Record<string, unknown>
  body: string
}>

export type TicketParts = Readonly<{
  data: Record<string, unknown>
  description: string
  region: string
}>

export type LibraryKind = "blocks" | "templates"

export type LibraryFile = Readonly<{ key: string; content: string }>

export class Markdown extends Context.Service<
  Markdown,
  Readonly<{
    root: string
    projectDir: (orgSlug: string, slug: string) => string
    readProjectFile: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<ParsedMarkdown, NotFound | MarkdownError>
    readProjectFileRaw: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<
      { path: string; content: string },
      NotFound | MarkdownError
    >
    writeProjectFile: (
      orgSlug: string,
      slug: string,
      frontmatter: Record<string, unknown>,
      body: string
    ) => Effect.Effect<void, MarkdownError>
    removeProjectDir: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<void, MarkdownError>
    readTicketFile: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<ParsedMarkdown, NotFound | MarkdownError>
    readTicketParts: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<TicketParts, NotFound | MarkdownError>
    readTicketFileRaw: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<
      { path: string; content: string },
      NotFound | MarkdownError
    >
    createTicketFile: (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      body: string
    ) => Effect.Effect<void, MarkdownError | TicketIdTaken>
    writeTicketFile: (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      body: string
    ) => Effect.Effect<void, MarkdownError>
    writeTicketWithRegion: (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      description: string,
      region: string
    ) => Effect.Effect<void, MarkdownError>
    removeTicketFile: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<void, NotFound | MarkdownError>
    listTicketIds: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<ReadonlyArray<string>, MarkdownError>
    readGroupFile: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<ParsedMarkdown, NotFound | MarkdownError>
    readGroupFileRaw: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<
      { path: string; content: string },
      NotFound | MarkdownError
    >
    createGroupFile: (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      body: string
    ) => Effect.Effect<void, MarkdownError | GroupIdTaken>
    writeGroupFile: (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      body: string
    ) => Effect.Effect<void, MarkdownError>
    writeGroupFileIfExists: (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      body: string
    ) => Effect.Effect<void, NotFound | MarkdownError>
    removeGroupFile: (
      orgSlug: string,
      slug: string,
      id: string
    ) => Effect.Effect<void, NotFound | MarkdownError>
    listGroupIds: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<ReadonlyArray<string>, MarkdownError>
    libraryDir: (
      orgSlug: string,
      projectSlug: string | null,
      kind: LibraryKind
    ) => string
    listLibraryFiles: (
      orgSlug: string,
      projectSlug: string | null,
      kind: LibraryKind
    ) => Effect.Effect<ReadonlyArray<LibraryFile>, MarkdownError>
    writeLibraryFile: (
      orgSlug: string,
      projectSlug: string | null,
      kind: LibraryKind,
      key: string,
      content: string
    ) => Effect.Effect<void, MarkdownError>
    readOrgLibraryFile: (
      orgSlug: string
    ) => Effect.Effect<string | null, MarkdownError>
    writeOrgLibraryFile: (
      orgSlug: string,
      content: string
    ) => Effect.Effect<void, MarkdownError>
    removeLibraryFile: (
      orgSlug: string,
      projectSlug: string | null,
      kind: LibraryKind,
      key: string
    ) => Effect.Effect<boolean, MarkdownError>
  }>
>()("@pp/server-core/markdown/Markdown") {}

const SAFE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

function ensureSafeSlug(slug: string): Effect.Effect<void, MarkdownError> {
  if (!SAFE_SLUG.test(slug)) {
    return Effect.fail(
      new MarkdownError({ cause: undefined, message: `unsafe slug: ${slug}` })
    )
  }
  return Effect.void
}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const crypto = yield* Crypto.Crypto
  const root = yield* Config.String("PROJECTS_DIR")
  const absoluteRoot = path.isAbsolute(root)
    ? root
    : path.resolve(process.cwd(), root)

  yield* fs.makeDirectory(absoluteRoot, { recursive: true }).pipe(
    Effect.mapError(
      (cause) =>
        new MarkdownError({
          cause,
          message: "failed to create projects dir"
        })
    )
  )

  const projectDir = (orgSlug: string, slug: string) =>
    path.join(absoluteRoot, "orgs", orgSlug, "projects", slug)

  const projectFilePath = (orgSlug: string, slug: string) =>
    path.join(projectDir(orgSlug, slug), "project.md")

  const ensureSafeOrgAndProject = (
    orgSlug: string,
    slug: string
  ): Effect.Effect<void, MarkdownError> =>
    Effect.gen(function* () {
      yield* ensureSafeSlug(orgSlug)
      yield* ensureSafeSlug(slug)
    })

  const readProjectFile = Effect.fn("Markdown.readProjectFile")(function* (
    orgSlug: string,
    slug: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    const file = projectFilePath(orgSlug, slug)
    const raw = yield* fs.readFileString(file, "utf8").pipe(
      Effect.mapError((cause): NotFound | MarkdownError =>
        Match.value(cause.reason).pipe(
          Match.tag("NotFound", () => new NotFound()),
          Match.orElse(
            () => new MarkdownError({ cause, message: `read failed: ${file}` })
          )
        )
      )
    )
    const parsed = yield* Effect.try({
      try: () => parseMarkdownFile(raw),
      catch: (cause) =>
        new MarkdownError({ cause, message: `parse failed: ${file}` })
    })
    return {
      data: parsed.data,
      body: parsed.content
    }
  })

  const readProjectFileRaw = Effect.fn("Markdown.readProjectFileRaw")(
    function* (orgSlug: string, slug: string) {
      yield* ensureSafeOrgAndProject(orgSlug, slug)
      const file = projectFilePath(orgSlug, slug)
      const content = yield* fs.readFileString(file, "utf8").pipe(
        Effect.mapError((cause): NotFound | MarkdownError =>
          Match.value(cause.reason).pipe(
            Match.tag("NotFound", () => new NotFound()),
            Match.orElse(
              () =>
                new MarkdownError({ cause, message: `read failed: ${file}` })
            )
          )
        )
      )
      return {
        path: `orgs/${orgSlug}/projects/${slug}/project.md`,
        content
      }
    }
  )

  const writeProjectFile = Effect.fn("Markdown.writeProjectFile")(function* (
    orgSlug: string,
    slug: string,
    frontmatter: Record<string, unknown>,
    body: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    const file = projectFilePath(orgSlug, slug)
    const dir = path.dirname(file)
    const content = markdownFileContent(frontmatter, body)
    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(
        Effect.mapError(
          (cause) =>
            new MarkdownError({ cause, message: `write failed: ${file}` })
        )
      )
    yield* fs
      .writeFileString(file, content)
      .pipe(
        Effect.mapError(
          (cause) =>
            new MarkdownError({ cause, message: `write failed: ${file}` })
        )
      )
  })

  const removeProjectDir = Effect.fn("Markdown.removeProjectDir")(function* (
    orgSlug: string,
    slug: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    const dir = projectDir(orgSlug, slug)
    yield* fs
      .remove(dir, { recursive: true, force: true })
      .pipe(
        Effect.mapError(
          (cause) =>
            new MarkdownError({ cause, message: `remove failed: ${dir}` })
        )
      )
  })

  const isSafeTicketId = Schema.is(TicketId)
  const ensureSafeId = (id: string): Effect.Effect<void, MarkdownError> =>
    isSafeTicketId(id)
      ? Effect.void
      : Effect.fail(
          new MarkdownError({
            cause: undefined,
            message: `unsafe ticket id: ${id}`
          })
        )

  const ticketsDir = (orgSlug: string, slug: string) =>
    path.join(projectDir(orgSlug, slug), "tickets")

  const ticketFilePath = (orgSlug: string, slug: string, id: string) =>
    path.join(ticketsDir(orgSlug, slug), `${id}.md`)

  const ticketTemporaryFile = (file: string) =>
    crypto.randomUUIDv4().pipe(
      Effect.map((id) =>
        path.join(path.dirname(file), `.${path.basename(file)}.${id}.tmp`)
      ),
      Effect.orDie
    )

  const readTicketFile = Effect.fn("Markdown.readTicketFile")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    yield* ensureSafeId(id)
    const file = ticketFilePath(orgSlug, slug, id)
    const raw = yield* fs.readFileString(file, "utf8").pipe(
      Effect.mapError((cause): NotFound | MarkdownError =>
        Match.value(cause.reason).pipe(
          Match.tag("NotFound", () => new NotFound()),
          Match.orElse(
            () => new MarkdownError({ cause, message: `read failed: ${file}` })
          )
        )
      )
    )
    const parsed = yield* Effect.try({
      try: () => parseMarkdownFile(raw),
      catch: (cause) =>
        new MarkdownError({ cause, message: `parse failed: ${file}` })
    })
    return {
      data: parsed.data,
      body: parsed.content
    }
  })

  const readTicketParts = Effect.fn("Markdown.readTicketParts")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    const file = yield* readTicketFile(orgSlug, slug, id)
    const { description, region } = splitDescriptionAndCommentsRegion(file.body)
    return { data: file.data, description, region }
  })

  const readTicketFileRaw = Effect.fn("Markdown.readTicketFileRaw")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    yield* ensureSafeId(id)
    const file = ticketFilePath(orgSlug, slug, id)
    const content = yield* fs.readFileString(file, "utf8").pipe(
      Effect.mapError((cause): NotFound | MarkdownError =>
        Match.value(cause.reason).pipe(
          Match.tag("NotFound", () => new NotFound()),
          Match.orElse(
            () => new MarkdownError({ cause, message: `read failed: ${file}` })
          )
        )
      )
    )
    return {
      path: `orgs/${orgSlug}/projects/${slug}/tickets/${id}.md`,
      content
    }
  })

  const createTicketFile = Effect.fn("Markdown.createTicketFile")(function* (
    orgSlug: string,
    slug: string,
    id: string,
    frontmatter: Record<string, unknown>,
    body: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    yield* ensureSafeId(id)
    const file = ticketFilePath(orgSlug, slug, id)
    const dir = path.dirname(file)
    const content = markdownFileContent(frontmatter, body)
    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(
        Effect.mapError(
          (cause) =>
            new MarkdownError({ cause, message: `create failed: ${file}` })
        )
      )
    const temporary = yield* ticketTemporaryFile(file)
    yield* Effect.gen(function* () {
      yield* fs.writeFileString(temporary, content, { flag: "wx" }).pipe(
        Effect.mapError(
          (cause) =>
            new MarkdownError({
              cause,
              message: `create failed: ${file}`
            })
        )
      )
      yield* fs.link(temporary, file).pipe(
        Effect.mapError((cause): MarkdownError | TicketIdTaken =>
          Match.value(cause.reason).pipe(
            Match.tag("AlreadyExists", () => new TicketIdTaken()),
            Match.orElse(
              () =>
                new MarkdownError({
                  cause,
                  message: `create failed: ${file}`
                })
            )
          )
        )
      )
    }).pipe(
      Effect.ensuring(fs.remove(temporary, { force: true }).pipe(Effect.ignore))
    )
  })

  const writeTicketFile = Effect.fn("Markdown.writeTicketFile")(function* (
    orgSlug: string,
    slug: string,
    id: string,
    frontmatter: Record<string, unknown>,
    body: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    yield* ensureSafeId(id)
    const file = ticketFilePath(orgSlug, slug, id)
    const content = markdownFileContent(frontmatter, body)
    const temporary = yield* ticketTemporaryFile(file)
    yield* Effect.gen(function* () {
      yield* fs
        .writeFileString(temporary, content, { flag: "wx" })
        .pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `write failed: ${file}` })
          )
        )
      yield* fs
        .rename(temporary, file)
        .pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `write failed: ${file}` })
          )
        )
    }).pipe(
      Effect.ensuring(fs.remove(temporary, { force: true }).pipe(Effect.ignore))
    )
  })

  const writeTicketWithRegion = Effect.fn("Markdown.writeTicketWithRegion")(
    function* (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      description: string,
      region: string
    ) {
      return yield* writeTicketFile(
        orgSlug,
        slug,
        id,
        frontmatter,
        ticketFileBody(description, region)
      )
    }
  )

  const removeTicketFile = Effect.fn("Markdown.removeTicketFile")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    yield* ensureSafeId(id)
    const file = ticketFilePath(orgSlug, slug, id)
    yield* fs.remove(file).pipe(
      Effect.mapError((cause): NotFound | MarkdownError =>
        Match.value(cause.reason).pipe(
          Match.tag("NotFound", () => new NotFound()),
          Match.orElse(
            () =>
              new MarkdownError({
                cause,
                message: `remove failed: ${file}`
              })
          )
        )
      )
    )
  })

  const listTicketIds = Effect.fn("Markdown.listTicketIds")(function* (
    orgSlug: string,
    slug: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    const dir = ticketsDir(orgSlug, slug)
    const entries = yield* fs.readDirectory(dir).pipe(
      Effect.catchReason("PlatformError", "NotFound", () =>
        Effect.succeed<ReadonlyArray<string>>([])
      ),
      Effect.mapError(
        (cause) =>
          new MarkdownError({
            cause,
            message: `list failed: ${dir}`
          })
      )
    )
    return entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .filter(isSafeTicketId)
  })

  const SAFE_GROUP_ID = /^G-[1-9][0-9]*$/
  const ensureSafeGroupId = (id: string): Effect.Effect<void, MarkdownError> =>
    SAFE_GROUP_ID.test(id)
      ? Effect.void
      : Effect.fail(
          new MarkdownError({
            cause: undefined,
            message: `unsafe group id: ${id}`
          })
        )

  const groupsDir = (orgSlug: string, slug: string) =>
    path.join(projectDir(orgSlug, slug), "groups")

  const groupFilePath = (orgSlug: string, slug: string, id: string) =>
    path.join(groupsDir(orgSlug, slug), `${id}.md`)

  const readGroupFile = Effect.fn("Markdown.readGroupFile")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    yield* ensureSafeGroupId(id)
    const file = groupFilePath(orgSlug, slug, id)
    const raw = yield* fs.readFileString(file, "utf8").pipe(
      Effect.mapError((cause): NotFound | MarkdownError =>
        Match.value(cause.reason).pipe(
          Match.tag("NotFound", () => new NotFound()),
          Match.orElse(
            () => new MarkdownError({ cause, message: `read failed: ${file}` })
          )
        )
      )
    )
    const parsed = yield* Effect.try({
      try: () => parseMarkdownFile(raw),
      catch: (cause) =>
        new MarkdownError({ cause, message: `parse failed: ${file}` })
    })
    return {
      data: parsed.data,
      body: parsed.content
    }
  })

  const readGroupFileRaw = Effect.fn("Markdown.readGroupFileRaw")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    yield* ensureSafeGroupId(id)
    const file = groupFilePath(orgSlug, slug, id)
    const content = yield* fs.readFileString(file, "utf8").pipe(
      Effect.mapError((cause): NotFound | MarkdownError =>
        Match.value(cause.reason).pipe(
          Match.tag("NotFound", () => new NotFound()),
          Match.orElse(
            () => new MarkdownError({ cause, message: `read failed: ${file}` })
          )
        )
      )
    )
    return {
      path: `orgs/${orgSlug}/projects/${slug}/groups/${id}.md`,
      content
    }
  })

  const createGroupFile = Effect.fn("Markdown.createGroupFile")(function* (
    orgSlug: string,
    slug: string,
    id: string,
    frontmatter: Record<string, unknown>,
    body: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    yield* ensureSafeGroupId(id)
    const file = groupFilePath(orgSlug, slug, id)
    const dir = path.dirname(file)
    const content = markdownFileContent(frontmatter, body)
    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(
        Effect.mapError(
          (cause) =>
            new MarkdownError({ cause, message: `create failed: ${file}` })
        )
      )
    yield* fs.writeFileString(file, content, { flag: "wx" }).pipe(
      Effect.mapError((cause): MarkdownError | GroupIdTaken =>
        Match.value(cause.reason).pipe(
          Match.tag("AlreadyExists", () => new GroupIdTaken()),
          Match.orElse(
            () =>
              new MarkdownError({
                cause,
                message: `create failed: ${file}`
              })
          )
        )
      )
    )
  })

  const writeGroupFile = Effect.fn("Markdown.writeGroupFile")(function* (
    orgSlug: string,
    slug: string,
    id: string,
    frontmatter: Record<string, unknown>,
    body: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    yield* ensureSafeGroupId(id)
    const file = groupFilePath(orgSlug, slug, id)
    const content = markdownFileContent(frontmatter, body)
    yield* fs
      .writeFileString(file, content)
      .pipe(
        Effect.mapError(
          (cause) =>
            new MarkdownError({ cause, message: `write failed: ${file}` })
        )
      )
  })

  const writeGroupFileIfExists = Effect.fn("Markdown.writeGroupFileIfExists")(
    function* (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      body: string
    ) {
      yield* ensureSafeOrgAndProject(orgSlug, slug)
      yield* ensureSafeGroupId(id)
      const file = groupFilePath(orgSlug, slug, id)
      const content = markdownFileContent(frontmatter, body)
      const exists = yield* fs
        .exists(file)
        .pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `write failed: ${file}` })
          )
        )
      if (!exists) return yield* new NotFound()
      yield* fs
        .writeFileString(file, content)
        .pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `write failed: ${file}` })
          )
        )
    }
  )

  const removeGroupFile = Effect.fn("Markdown.removeGroupFile")(function* (
    orgSlug: string,
    slug: string,
    id: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    yield* ensureSafeGroupId(id)
    const file = groupFilePath(orgSlug, slug, id)
    yield* fs.remove(file).pipe(
      Effect.mapError((cause): NotFound | MarkdownError =>
        Match.value(cause.reason).pipe(
          Match.tag("NotFound", () => new NotFound()),
          Match.orElse(
            () =>
              new MarkdownError({
                cause,
                message: `remove failed: ${file}`
              })
          )
        )
      )
    )
  })

  const listGroupIds = Effect.fn("Markdown.listGroupIds")(function* (
    orgSlug: string,
    slug: string
  ) {
    yield* ensureSafeOrgAndProject(orgSlug, slug)
    const dir = groupsDir(orgSlug, slug)
    const entries = yield* fs.readDirectory(dir).pipe(
      Effect.catchReason("PlatformError", "NotFound", () =>
        Effect.succeed<ReadonlyArray<string>>([])
      ),
      Effect.mapError(
        (cause) =>
          new MarkdownError({
            cause,
            message: `list failed: ${dir}`
          })
      )
    )
    return entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .filter((id) => SAFE_GROUP_ID.test(id))
  })

  const isSafeLibraryKey = (key: string): boolean =>
    SAFE_SLUG.test(key) && key.length <= LIBRARY_KEY_MAX_LENGTH

  const ensureSafeLibraryScope = (
    orgSlug: string,
    projectSlug: string | null
  ): Effect.Effect<void, MarkdownError> =>
    projectSlug === null
      ? ensureSafeSlug(orgSlug)
      : ensureSafeOrgAndProject(orgSlug, projectSlug)

  const ensureSafeLibraryKey = (
    key: string
  ): Effect.Effect<void, MarkdownError> =>
    isSafeLibraryKey(key)
      ? Effect.void
      : Effect.fail(
          new MarkdownError({
            cause: undefined,
            message: `unsafe library key: ${key}`
          })
        )

  const libraryDir = (
    orgSlug: string,
    projectSlug: string | null,
    kind: LibraryKind
  ) =>
    projectSlug === null
      ? path.join(absoluteRoot, "orgs", orgSlug, kind)
      : path.join(projectDir(orgSlug, projectSlug), kind)

  const libraryFilePath = (
    orgSlug: string,
    projectSlug: string | null,
    kind: LibraryKind,
    key: string
  ) => path.join(libraryDir(orgSlug, projectSlug, kind), `${key}.md`)

  const readLibraryFile = (
    dir: string,
    key: string
  ): Effect.Effect<ReadonlyArray<LibraryFile>, MarkdownError> => {
    const file = path.join(dir, `${key}.md`)
    return fs.readFileString(file, "utf8").pipe(
      Effect.map((content) => [{ key, content }]),
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed([])),
      Effect.mapError(
        (cause) => new MarkdownError({ cause, message: `read failed: ${file}` })
      )
    )
  }

  const listLibraryFiles = Effect.fn("Markdown.listLibraryFiles")(function* (
    orgSlug: string,
    projectSlug: string | null,
    kind: LibraryKind
  ) {
    yield* ensureSafeLibraryScope(orgSlug, projectSlug)
    const dir = libraryDir(orgSlug, projectSlug, kind)
    const entries = yield* fs.readDirectory(dir).pipe(
      Effect.catchReason("PlatformError", "NotFound", () =>
        Effect.succeed<ReadonlyArray<string>>([])
      ),
      Effect.mapError(
        (cause) => new MarkdownError({ cause, message: `list failed: ${dir}` })
      )
    )
    const keys = entries
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => entry.slice(0, -3))
      .filter(isSafeLibraryKey)
      .toSorted()
    const files = yield* Effect.forEach(
      keys,
      (key) => readLibraryFile(dir, key),
      { concurrency: 8 }
    )
    return files.flat()
  })

  const writeLibraryFile = Effect.fn("Markdown.writeLibraryFile")(function* (
    orgSlug: string,
    projectSlug: string | null,
    kind: LibraryKind,
    key: string,
    content: string
  ) {
    yield* ensureSafeLibraryScope(orgSlug, projectSlug)
    yield* ensureSafeLibraryKey(key)
    const file = libraryFilePath(orgSlug, projectSlug, kind, key)
    const failed = (cause: unknown) =>
      new MarkdownError({ cause, message: `write failed: ${file}` })
    yield* fs
      .makeDirectory(path.dirname(file), { recursive: true })
      .pipe(Effect.mapError(failed))
    const temporary = yield* ticketTemporaryFile(file)
    yield* Effect.gen(function* () {
      yield* fs
        .writeFileString(temporary, content, { flag: "wx" })
        .pipe(Effect.mapError(failed))
      yield* fs.rename(temporary, file).pipe(Effect.mapError(failed))
    }).pipe(
      Effect.ensuring(fs.remove(temporary, { force: true }).pipe(Effect.ignore))
    )
  })

  const orgLibraryFilePath = (orgSlug: string) =>
    path.join(absoluteRoot, "orgs", orgSlug, "library.md")

  const readOrgLibraryFile = Effect.fn("Markdown.readOrgLibraryFile")(
    function* (orgSlug: string) {
      yield* ensureSafeSlug(orgSlug)
      const file = orgLibraryFilePath(orgSlug)
      return yield* fs.readFileString(file, "utf8").pipe(
        Effect.catchReason("PlatformError", "NotFound", () =>
          Effect.succeed(null)
        ),
        Effect.mapError(
          (cause) =>
            new MarkdownError({
              cause,
              message: `read failed: ${file}`
            })
        )
      )
    }
  )

  const writeOrgLibraryFile = Effect.fn("Markdown.writeOrgLibraryFile")(
    function* (orgSlug: string, content: string) {
      yield* ensureSafeSlug(orgSlug)
      const file = orgLibraryFilePath(orgSlug)
      const failed = (cause: unknown) =>
        new MarkdownError({ cause, message: `write failed: ${file}` })
      yield* fs
        .makeDirectory(path.dirname(file), { recursive: true })
        .pipe(Effect.mapError(failed))
      const temporary = yield* ticketTemporaryFile(file)
      yield* Effect.gen(function* () {
        yield* fs
          .writeFileString(temporary, content, { flag: "wx" })
          .pipe(Effect.mapError(failed))
        yield* fs.rename(temporary, file).pipe(Effect.mapError(failed))
      }).pipe(
        Effect.ensuring(
          fs.remove(temporary, { force: true }).pipe(Effect.ignore)
        )
      )
    }
  )

  const removeLibraryFile = Effect.fn("Markdown.removeLibraryFile")(function* (
    orgSlug: string,
    projectSlug: string | null,
    kind: LibraryKind,
    key: string
  ) {
    yield* ensureSafeLibraryScope(orgSlug, projectSlug)
    yield* ensureSafeLibraryKey(key)
    const file = libraryFilePath(orgSlug, projectSlug, kind, key)
    return yield* fs.remove(file).pipe(
      Effect.as(true),
      Effect.catchReason("PlatformError", "NotFound", () =>
        Effect.succeed(false)
      ),
      Effect.mapError(
        (cause) =>
          new MarkdownError({
            cause,
            message: `remove failed: ${file}`
          })
      )
    )
  })

  return Markdown.of({
    projectDir,
    readProjectFile,
    readProjectFileRaw,
    writeProjectFile,
    removeProjectDir,
    readTicketFile,
    readTicketParts,
    readTicketFileRaw,
    createTicketFile,
    writeTicketFile,
    writeTicketWithRegion,
    removeTicketFile,
    listTicketIds,
    readGroupFile,
    readGroupFileRaw,
    createGroupFile,
    writeGroupFile,
    writeGroupFileIfExists,
    removeGroupFile,
    listGroupIds,
    libraryDir,
    listLibraryFiles,
    writeLibraryFile,
    readOrgLibraryFile,
    writeOrgLibraryFile,
    removeLibraryFile,
    root: absoluteRoot
  })
})

export const layer = Layer.effect(Markdown, make)
