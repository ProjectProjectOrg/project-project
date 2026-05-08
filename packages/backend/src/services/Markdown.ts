// Markdown service — filesystem-backed read/write for projects on disk.
//
// Source of truth is markdown on disk under
// `<PROJECTS_DIR>/orgs/<orgSlug>/projects/<projectSlug>/project.md`. Every
// public method takes `orgSlug` explicitly — there is no implicit "active
// org" lookup at this layer; callers (handlers via the Projects service)
// thread it through.

import { Config, Data, Effect } from "effect"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import matter from "gray-matter"
import { NotFound } from "@projectproject/shared"

export class MarkdownError extends Data.TaggedError("MarkdownError")<{
  readonly cause: unknown
  readonly message: string
}> {}

// Boundary error: a ticket file at the requested id already exists. Used by
// the Tickets service to retry sequential id allocation under concurrent
// creates without leaking the race to the wire.
export class TicketIdTaken extends Data.TaggedError("TicketIdTaken")<{}> {}

export class GroupIdTaken extends Data.TaggedError("GroupIdTaken")<{}> {}

export interface ParsedMarkdown {
  readonly data: Record<string, unknown>
  readonly body: string
}

const SAFE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

function ensureSafeSlug(slug: string): Effect.Effect<void, MarkdownError> {
  if (!SAFE_SLUG.test(slug)) {
    return Effect.fail(
      new MarkdownError({ cause: undefined, message: `unsafe slug: ${slug}` })
    )
  }
  return Effect.void
}

export class Markdown extends Effect.Service<Markdown>()("Markdown", {
  effect: Effect.gen(function* () {
    const root = yield* Config.string("PROJECTS_DIR")
    const absoluteRoot = path.isAbsolute(root)
      ? root
      : path.resolve(process.cwd(), root)

    // Create the projects root on first use; harmless if it already exists.
    yield* Effect.tryPromise({
      try: () => fs.mkdir(absoluteRoot, { recursive: true }),
      catch: (cause) =>
        new MarkdownError({ cause, message: "failed to create projects dir" })
    })

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
        const raw = yield* Effect.tryPromise({
          try: () => fs.readFile(file, "utf8"),
          catch: (cause): NotFound | MarkdownError => {
            const code = (cause as NodeJS.ErrnoException | undefined)?.code
            if (code === "ENOENT") return new NotFound()
            return new MarkdownError({ cause, message: `read failed: ${file}` })
          }
        })
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
        yield* Effect.tryPromise({
          try: async () => {
            await fs.mkdir(dir, { recursive: true })
            await fs.writeFile(file, content, "utf8")
          },
          catch: (cause) =>
            new MarkdownError({ cause, message: `write failed: ${file}` })
        })
      })

    const removeProjectDir = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<void, MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        const dir = projectDir(orgSlug, slug)
        yield* Effect.tryPromise({
          try: () => fs.rm(dir, { recursive: true, force: true }),
          catch: (cause) =>
            new MarkdownError({ cause, message: `remove failed: ${dir}` })
        })
      })

    // --- Tickets -----------------------------------------------------------
    // Ticket files live at <root>/<slug>/tickets/<id>.md. ID format is
    // validated by the caller's Schema; the regex below is a defensive
    // double-check before we touch the filesystem.

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
        const raw = yield* Effect.tryPromise({
          try: () => fs.readFile(file, "utf8"),
          catch: (cause): NotFound | MarkdownError => {
            const code = (cause as NodeJS.ErrnoException | undefined)?.code
            if (code === "ENOENT") return new NotFound()
            return new MarkdownError({ cause, message: `read failed: ${file}` })
          }
        })
        const parsed = matter(raw)
        return {
          data: parsed.data as Record<string, unknown>,
          body: parsed.content
        }
      })

    // Atomic create — fails if the file already exists. Used to claim a
    // ticket id without races: scan finds the next id, write with `wx` flag,
    // and on EEXIST the caller bumps the id and retries.
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
        yield* Effect.tryPromise({
          try: async () => {
            await fs.mkdir(dir, { recursive: true })
            await fs.writeFile(file, content, { encoding: "utf8", flag: "wx" })
          },
          catch: (cause): MarkdownError | TicketIdTaken => {
            const code = (cause as NodeJS.ErrnoException | undefined)?.code
            if (code === "EEXIST") return new TicketIdTaken()
            return new MarkdownError({
              cause,
              message: `create failed: ${file}`
            })
          }
        })
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
        yield* Effect.tryPromise({
          try: () => fs.writeFile(file, content, "utf8"),
          catch: (cause) =>
            new MarkdownError({ cause, message: `write failed: ${file}` })
        })
      })

    const removeTicketFile = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<void, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        yield* ensureSafeId(id)
        const file = ticketFilePath(orgSlug, slug, id)
        yield* Effect.tryPromise({
          try: () => fs.rm(file),
          catch: (cause): NotFound | MarkdownError => {
            const code = (cause as NodeJS.ErrnoException | undefined)?.code
            if (code === "ENOENT") return new NotFound()
            return new MarkdownError({
              cause,
              message: `remove failed: ${file}`
            })
          }
        })
      })

    // Returns the list of ticket ids in a project's tickets/ dir, or an
    // empty array if the dir doesn't exist yet (a project with no tickets).
    const listTicketIds = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<string>, MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        const dir = ticketsDir(orgSlug, slug)
        const entries = yield* Effect.tryPromise({
          try: async () => {
            try {
              return await fs.readdir(dir)
            } catch (cause) {
              const code = (cause as NodeJS.ErrnoException | undefined)?.code
              if (code === "ENOENT") return [] as ReadonlyArray<string>
              throw cause
            }
          },
          catch: (cause) =>
            new MarkdownError({ cause, message: `list failed: ${dir}` })
        })
        return entries
          .filter((f) => f.endsWith(".md"))
          .map((f) => f.slice(0, -3))
          .filter((id) => SAFE_TICKET_ID.test(id))
      })

    // --- Groups ------------------------------------------------------------

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
        const raw = yield* Effect.tryPromise({
          try: () => fs.readFile(file, "utf8"),
          catch: (cause): NotFound | MarkdownError => {
            const code = (cause as NodeJS.ErrnoException | undefined)?.code
            if (code === "ENOENT") return new NotFound()
            return new MarkdownError({ cause, message: `read failed: ${file}` })
          }
        })
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
        yield* Effect.tryPromise({
          try: async () => {
            await fs.mkdir(dir, { recursive: true })
            await fs.writeFile(file, content, { encoding: "utf8", flag: "wx" })
          },
          catch: (cause): MarkdownError | GroupIdTaken => {
            const code = (cause as NodeJS.ErrnoException | undefined)?.code
            if (code === "EEXIST") return new GroupIdTaken()
            return new MarkdownError({
              cause,
              message: `create failed: ${file}`
            })
          }
        })
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
        yield* Effect.tryPromise({
          try: () => fs.writeFile(file, content, "utf8"),
          catch: (cause) =>
            new MarkdownError({ cause, message: `write failed: ${file}` })
        })
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
        yield* Effect.tryPromise({
          try: async () => {
            const fh = await fs.open(file, "r+")
            try {
              await fh.truncate(0)
              await fh.writeFile(content, "utf8")
            } finally {
              await fh.close()
            }
          },
          catch: (cause): NotFound | MarkdownError => {
            const code = (cause as NodeJS.ErrnoException | undefined)?.code
            if (code === "ENOENT") return new NotFound()
            return new MarkdownError({ cause, message: `write failed: ${file}` })
          }
        })
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
        yield* Effect.tryPromise({
          try: () => fs.rm(file),
          catch: (cause): NotFound | MarkdownError => {
            const code = (cause as NodeJS.ErrnoException | undefined)?.code
            if (code === "ENOENT") return new NotFound()
            return new MarkdownError({
              cause,
              message: `remove failed: ${file}`
            })
          }
        })
      })

    const listGroupIds = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<string>, MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureSafeOrgAndProject(orgSlug, slug)
        const dir = groupsDir(orgSlug, slug)
        const entries = yield* Effect.tryPromise({
          try: async () => {
            try {
              return await fs.readdir(dir)
            } catch (cause) {
              const code = (cause as NodeJS.ErrnoException | undefined)?.code
              if (code === "ENOENT") return [] as ReadonlyArray<string>
              throw cause
            }
          },
          catch: (cause) =>
            new MarkdownError({ cause, message: `list failed: ${dir}` })
        })
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
      createTicketFile,
      writeTicketFile,
      removeTicketFile,
      listTicketIds,
      readGroupFile,
      createGroupFile,
      writeGroupFile,
      writeGroupFileIfExists,
      removeGroupFile,
      listGroupIds,
      root: absoluteRoot
    } as const
  })
}) {}
