// Markdown service — filesystem-backed read/write for projects on disk.
//
// ProjectProject's source of truth is markdown on disk: each project lives at
// `<PROJECTS_DIR>/<slug>/project.md` with YAML frontmatter. This service is a
// narrow seam over that layout. It does NOT understand the domain (slug
// validation, ownership) — callers (the Projects service) own that.
//
// Frontmatter is round-tripped as a plain object. The shared `Project` schema
// is what validates the wire boundary; the on-disk frontmatter is internal,
// so we keep this service schema-agnostic.

import { Config, Data, Effect } from "effect"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import matter from "gray-matter"
import { NotFound } from "@projectproject/shared"

export class MarkdownError extends Data.TaggedError("MarkdownError")<{
  readonly cause: unknown
  readonly message: string
}> {}

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

export class Markdown extends Effect.Service<Markdown>()(
  "Markdown",
  {
    effect: Effect.gen(function*() {
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

      const projectFilePath = (slug: string) =>
        path.join(absoluteRoot, slug, "project.md")

      const readProjectFile = (
        slug: string
      ): Effect.Effect<ParsedMarkdown, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          yield* ensureSafeSlug(slug)
          const file = projectFilePath(slug)
          const raw = yield* Effect.tryPromise({
            try: () => fs.readFile(file, "utf8"),
            catch: (cause): NotFound | MarkdownError => {
              const code = (cause as NodeJS.ErrnoException | undefined)?.code
              if (code === "ENOENT") return new NotFound()
              return new MarkdownError({ cause, message: `read failed: ${file}` })
            }
          })
          const parsed = matter(raw)
          return { data: parsed.data as Record<string, unknown>, body: parsed.content }
        })

      const writeProjectFile = (
        slug: string,
        frontmatter: Record<string, unknown>,
        body: string
      ): Effect.Effect<void, MarkdownError> =>
        Effect.gen(function*() {
          yield* ensureSafeSlug(slug)
          const file = projectFilePath(slug)
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
        slug: string
      ): Effect.Effect<void, MarkdownError> =>
        Effect.gen(function*() {
          yield* ensureSafeSlug(slug)
          const dir = path.dirname(projectFilePath(slug))
          yield* Effect.tryPromise({
            try: () => fs.rm(dir, { recursive: true, force: true }),
            catch: (cause) =>
              new MarkdownError({ cause, message: `remove failed: ${dir}` })
          })
        })

      return {
        readProjectFile,
        writeProjectFile,
        removeProjectDir,
        root: absoluteRoot
      } as const
    })
  }
) {}
