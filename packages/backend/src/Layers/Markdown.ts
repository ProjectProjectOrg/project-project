// Markdown service — filesystem-backed read/write for projects on disk.
//
// Source of truth is markdown on disk under
// `<PROJECTS_DIR>/orgs/<orgSlug>/projects/<projectSlug>/project.md`. Every
// public method takes `orgSlug` explicitly — there is no implicit "active
// org" lookup at this layer; callers (handlers via the Projects service)
// thread it through.

import { FileSystem, Path } from "@effect/platform"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import matter from "gray-matter"
import { NotFound } from "@projectproject/shared"
import { splitDescriptionAndCommentsRegion } from "../comments-region"
import {
  GroupIdTaken,
  Markdown,
  MarkdownError,
  TicketIdTaken,
  type MarkdownShape,
  type ParsedMarkdown
} from "../Services/Markdown"

const SAFE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

function ensureSafeSlug(slug: string): Effect.Effect<void, MarkdownError> {
  if (!SAFE_SLUG.test(slug)) {
    return Effect.fail(
      new MarkdownError({ cause: undefined, message: `unsafe slug: ${slug}` })
    )
  }
  return Effect.void
}

const isSystemNotFound = (cause: unknown): boolean =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  cause._tag === "SystemError" &&
  "reason" in cause &&
  cause.reason === "NotFound"

const isSystemAlreadyExists = (cause: unknown): boolean =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  cause._tag === "SystemError" &&
  "reason" in cause &&
  cause.reason === "AlreadyExists"

export const MarkdownLive = Layer.effect(
  Markdown,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* Config.string("PROJECTS_DIR")
    const absoluteRoot = path.isAbsolute(root)
      ? root
      : path.resolve(process.cwd(), root)

    yield* fs
      .makeDirectory(absoluteRoot, { recursive: true })
      .pipe(
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

    const readProjectFile = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ParsedMarkdown, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        const file = projectFilePath(orgSlug, slug)
        const raw = yield* fs.readFileString(file, "utf8").pipe(
          Effect.mapError(
            (cause): NotFound | MarkdownError =>
              isSystemNotFound(cause)
                ? new NotFound()
                : new MarkdownError({ cause, message: `read failed: ${file}` })
          )
        )
        const parsed = matter(raw)
        return {
          data: parsed.data as Record<string, unknown>,
          body: parsed.content
        }
      })

    const writeProjectFile = (
      orgSlug: string,
      slug: string,
      frontmatter: Record<string, unknown>,
      body: string
    ): Effect.Effect<void, MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        const file = projectFilePath(orgSlug, slug)
        const dir = path.dirname(file)
        const content = matter.stringify(body, frontmatter)
        yield* fs.makeDirectory(dir, { recursive: true }).pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `write failed: ${file}` })
          )
        )
        yield* fs.writeFileString(file, content).pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `write failed: ${file}` })
          )
        )
      })

    const removeProjectDir = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<void, MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        const dir = projectDir(orgSlug, slug)
        yield* fs.remove(dir, { recursive: true, force: true }).pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `remove failed: ${dir}` })
          )
        )
      })

    const SAFE_TICKET_ID = /^T-[1-9][0-9]*$/
    const ensureSafeId = (id: string): Effect.Effect<void, MarkdownError> =>
      SAFE_TICKET_ID.test(id)
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

    const readTicketFile = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<ParsedMarkdown, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        yield* ensureSafeId(id)
        const file = ticketFilePath(orgSlug, slug, id)
        const raw = yield* fs.readFileString(file, "utf8").pipe(
          Effect.mapError(
            (cause): NotFound | MarkdownError =>
              isSystemNotFound(cause)
                ? new NotFound()
                : new MarkdownError({ cause, message: `read failed: ${file}` })
          )
        )
        const parsed = matter(raw)
        return {
          data: parsed.data as Record<string, unknown>,
          body: parsed.content
        }
      })

    const readTicketParts = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<
      { data: Record<string, unknown>; description: string; region: string },
      NotFound | MarkdownError
    > =>
      Effect.gen(function* () {
        const file = yield* readTicketFile(orgSlug, slug, id)
        const { description, region } = splitDescriptionAndCommentsRegion(
          file.body
        )
        return { data: file.data, description, region }
      })

    const createTicketFile = (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      body: string
    ): Effect.Effect<void, MarkdownError | TicketIdTaken> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        yield* ensureSafeId(id)
        const file = ticketFilePath(orgSlug, slug, id)
        const dir = path.dirname(file)
        const content = matter.stringify(body, frontmatter)
        yield* fs.makeDirectory(dir, { recursive: true }).pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `create failed: ${file}` })
          )
        )
        yield* fs.writeFileString(file, content, { flag: "wx" }).pipe(
          Effect.mapError(
            (cause): MarkdownError | TicketIdTaken =>
              isSystemAlreadyExists(cause)
                ? new TicketIdTaken()
                : new MarkdownError({
                    cause,
                    message: `create failed: ${file}`
                  })
          )
        )
      })

    const writeTicketFile = (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      body: string
    ): Effect.Effect<void, MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        yield* ensureSafeId(id)
        const file = ticketFilePath(orgSlug, slug, id)
        const content = matter.stringify(body, frontmatter)
        yield* fs.writeFileString(file, content).pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `write failed: ${file}` })
          )
        )
      })

    const writeTicketWithRegion = (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      description: string,
      region: string
    ): Effect.Effect<void, MarkdownError> =>
      writeTicketFile(
        orgSlug,
        slug,
        id,
        frontmatter,
        region ? `${description.replace(/\s+$/, "")}\n\n${region}` : description
      )

    const removeTicketFile = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<void, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        yield* ensureSafeId(id)
        const file = ticketFilePath(orgSlug, slug, id)
        yield* fs.remove(file).pipe(
          Effect.mapError(
            (cause): NotFound | MarkdownError =>
              isSystemNotFound(cause)
                ? new NotFound()
                : new MarkdownError({
                    cause,
                    message: `remove failed: ${file}`
                  })
          )
        )
      })

    const listTicketIds = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<string>, MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        const dir = ticketsDir(orgSlug, slug)
        const entries = yield* fs.readDirectory(dir).pipe(
          Effect.catchAll((cause) =>
            isSystemNotFound(cause)
              ? Effect.succeed([] as ReadonlyArray<string>)
              : Effect.fail(
                  new MarkdownError({
                    cause,
                    message: `list failed: ${dir}`
                  })
                )
          )
        )
        return entries
          .filter((f) => f.endsWith(".md"))
          .map((f) => f.slice(0, -3))
          .filter((id) => SAFE_TICKET_ID.test(id))
      })

    const SAFE_GROUP_ID = /^G-[1-9][0-9]*$/
    const ensureSafeGroupId = (
      id: string
    ): Effect.Effect<void, MarkdownError> =>
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

    const readGroupFile = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<ParsedMarkdown, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        yield* ensureSafeGroupId(id)
        const file = groupFilePath(orgSlug, slug, id)
        const raw = yield* fs.readFileString(file, "utf8").pipe(
          Effect.mapError(
            (cause): NotFound | MarkdownError =>
              isSystemNotFound(cause)
                ? new NotFound()
                : new MarkdownError({ cause, message: `read failed: ${file}` })
          )
        )
        const parsed = matter(raw)
        return {
          data: parsed.data as Record<string, unknown>,
          body: parsed.content
        }
      })

    const createGroupFile = (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      body: string
    ): Effect.Effect<void, MarkdownError | GroupIdTaken> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        yield* ensureSafeGroupId(id)
        const file = groupFilePath(orgSlug, slug, id)
        const dir = path.dirname(file)
        const content = matter.stringify(body, frontmatter)
        yield* fs.makeDirectory(dir, { recursive: true }).pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `create failed: ${file}` })
          )
        )
        yield* fs.writeFileString(file, content, { flag: "wx" }).pipe(
          Effect.mapError(
            (cause): MarkdownError | GroupIdTaken =>
              isSystemAlreadyExists(cause)
                ? new GroupIdTaken()
                : new MarkdownError({
                    cause,
                    message: `create failed: ${file}`
                  })
          )
        )
      })

    const writeGroupFile = (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      body: string
    ): Effect.Effect<void, MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        yield* ensureSafeGroupId(id)
        const file = groupFilePath(orgSlug, slug, id)
        const content = matter.stringify(body, frontmatter)
        yield* fs.writeFileString(file, content).pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `write failed: ${file}` })
          )
        )
      })

    const writeGroupFileIfExists = (
      orgSlug: string,
      slug: string,
      id: string,
      frontmatter: Record<string, unknown>,
      body: string
    ): Effect.Effect<void, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        yield* ensureSafeGroupId(id)
        const file = groupFilePath(orgSlug, slug, id)
        const content = matter.stringify(body, frontmatter)
        const exists = yield* fs.exists(file).pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `write failed: ${file}` })
          )
        )
        if (!exists) return yield* new NotFound()
        yield* fs.writeFileString(file, content).pipe(
          Effect.mapError(
            (cause) =>
              new MarkdownError({ cause, message: `write failed: ${file}` })
          )
        )
      })

    const removeGroupFile = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<void, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        yield* ensureSafeGroupId(id)
        const file = groupFilePath(orgSlug, slug, id)
        yield* fs.remove(file).pipe(
          Effect.mapError(
            (cause): NotFound | MarkdownError =>
              isSystemNotFound(cause)
                ? new NotFound()
                : new MarkdownError({
                    cause,
                    message: `remove failed: ${file}`
                  })
          )
        )
      })

    const listGroupIds = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<string>, MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        const dir = groupsDir(orgSlug, slug)
        const entries = yield* fs.readDirectory(dir).pipe(
          Effect.catchAll((cause) =>
            isSystemNotFound(cause)
              ? Effect.succeed([] as ReadonlyArray<string>)
              : Effect.fail(
                  new MarkdownError({
                    cause,
                    message: `list failed: ${dir}`
                  })
                )
          )
        )
        return entries
          .filter((f) => f.endsWith(".md"))
          .map((f) => f.slice(0, -3))
          .filter((id) => SAFE_GROUP_ID.test(id))
      })

    return {
      projectDir,
      readProjectFile,
      writeProjectFile,
      removeProjectDir,
      readTicketFile,
      readTicketParts,
      createTicketFile,
      writeTicketFile,
      writeTicketWithRegion,
      removeTicketFile,
      listTicketIds,
      readGroupFile,
      createGroupFile,
      writeGroupFile,
      writeGroupFileIfExists,
      removeGroupFile,
      listGroupIds,
      root: absoluteRoot
    } satisfies MarkdownShape
  })
)
