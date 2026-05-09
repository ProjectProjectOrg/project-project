import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { GithubConnection, NotFound, Role, Slug } from "@projectproject/shared"
import { Markdown, type MarkdownError } from "../Services/Markdown"
import {
  ProjectDocs,
  type ProjectDocsShape,
  type ProjectDocument,
  type ProjectDocumentWrite
} from "../Services/ProjectDocs"

function checkOrgFrontmatter(
  expected: string,
  data: Record<string, unknown>
): Effect.Effect<void> {
  const onDisk = data["org"]
  if (onDisk === undefined) {
    return Effect.logWarning("project frontmatter is missing org").pipe(
      Effect.annotateLogs({ expectedOrg: expected })
    )
  }
  if (onDisk !== expected) {
    const onDiskSafe =
      typeof onDisk === "string" ? onDisk : JSON.stringify(onDisk)
    return Effect.logWarning("project frontmatter org mismatch").pipe(
      Effect.annotateLogs({ expectedOrg: expected, actualOrg: onDiskSafe })
    )
  }
  return Effect.void
}

const ProjectDocMember = Schema.Struct({
  username: Schema.String,
  role: Role
})

const ProjectDocGithub = Schema.Struct({
  repoOwner: Schema.String,
  repoName: Schema.String,
  defaultBaseBranch: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null
  })
})

const ProjectFrontmatter = Schema.Struct({
  org: Schema.optional(Slug),
  slug: Slug,
  name: Schema.String,
  createdBy: Schema.optional(Schema.String),
  createdAt: Schema.Date,
  members: Schema.optionalWith(Schema.Array(ProjectDocMember), {
    default: () => []
  }),
  github: Schema.optionalWith(Schema.NullOr(ProjectDocGithub), {
    default: () => null
  })
})

const decodeProjectFrontmatter = Schema.decodeUnknown(ProjectFrontmatter)

function toFrontmatter(
  document: ProjectDocumentWrite
): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    org: document.org,
    slug: document.slug,
    name: document.name,
    createdBy: document.createdBy,
    createdAt: document.createdAt.toISOString(),
    members: document.members.map((member) => ({
      username: member.username,
      role: member.role
    }))
  }
  if (document.github) {
    frontmatter.github = {
      repoOwner: document.github.repoOwner,
      repoName: document.github.repoName,
      defaultBaseBranch: document.github.defaultBaseBranch
    } satisfies GithubConnection
  }
  return frontmatter
}

function withProjectDocTelemetry<A, E>(
  operation: string,
  orgSlug: string,
  slug: string,
  effect: Effect.Effect<A, E>
): Effect.Effect<A, E> {
  const annotations = { module: "ProjectDocs", operation, orgSlug, slug }
  return effect.pipe(
    Effect.withSpan(`ProjectDocs.${operation}`, { attributes: annotations }),
    Effect.annotateLogs(annotations)
  )
}

export const ProjectDocsLive = Layer.effect(
  ProjectDocs,
  Effect.gen(function* () {
    const markdown = yield* Markdown

    const read = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ProjectDocument, NotFound | MarkdownError> =>
      withProjectDocTelemetry(
        "read",
        orgSlug,
        slug,
        Effect.gen(function* () {
          const file = yield* markdown.readProjectFile(orgSlug, slug)
          yield* checkOrgFrontmatter(orgSlug, file.data)
          const frontmatter = yield* decodeProjectFrontmatter(file.data).pipe(
            Effect.tapErrorCause((cause) =>
              Effect.logWarning("project frontmatter decode failed").pipe(
                Effect.annotateLogs({ cause: Cause.pretty(cause) })
              )
            ),
            Effect.orDie
          )
          return { ...frontmatter, body: file.body }
        })
      )

    const write = (
      orgSlug: string,
      slug: string,
      document: ProjectDocumentWrite
    ): Effect.Effect<void, MarkdownError> =>
      withProjectDocTelemetry(
        "write",
        orgSlug,
        slug,
        markdown.writeProjectFile(
          orgSlug,
          slug,
          toFrontmatter(document),
          document.body
        )
      )

    const removeDir = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<void, MarkdownError> =>
      withProjectDocTelemetry(
        "removeDir",
        orgSlug,
        slug,
        markdown.removeProjectDir(orgSlug, slug)
      )

    return { read, write, removeDir } satisfies ProjectDocsShape
  })
)
