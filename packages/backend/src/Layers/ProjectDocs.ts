import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import * as Struct from "effect/Struct"
import {
  deriveProjectIdentity,
  NotFound,
  ProjectKey,
  Role,
  Slug
} from "@projectproject/shared"
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
  repoId: Schema.String.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(""))
  ),
  repoOwner: Schema.String,
  repoName: Schema.String,
  defaultBaseBranch: Schema.NullOr(Schema.String).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  )
})

const ProjectDocSetup = Schema.Struct({
  workflowReviewedAt: Schema.NullOr(Schema.DateFromString).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  invitePeopleDismissedAt: Schema.NullOr(Schema.DateFromString).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  connectGithubDismissedAt: Schema.NullOr(Schema.DateFromString).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  )
})

const ProjectFrontmatterOnDisk = Schema.Struct({
  org: Schema.optional(Slug),
  slug: Slug,
  key: Schema.optional(ProjectKey),
  name: Schema.String,
  icon: Schema.optional(Schema.String),
  color: Schema.optional(Schema.String),
  createdBy: Schema.optional(Schema.String),
  createdAt: Schema.DateFromString,
  members: Schema.Array(ProjectDocMember).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([]))
  ),
  github: Schema.optionalKey(Schema.NullOr(ProjectDocGithub)),
  setup: ProjectDocSetup.pipe(
    Schema.withDecodingDefaultTypeKey(
      Effect.succeed({
        workflowReviewedAt: null,
        invitePeopleDismissedAt: null,
        connectGithubDismissedAt: null
      })
    )
  )
})

const ProjectFrontmatterValue = Schema.Struct(
  Struct.evolve(ProjectFrontmatterOnDisk.fields, {
    github: () => Schema.NullOr(ProjectDocGithub)
  })
)

const ProjectFrontmatter = ProjectFrontmatterOnDisk.pipe(
  Schema.decodeTo(
    Schema.toType(ProjectFrontmatterValue),
    SchemaTransformation.transform({
      decode: (input) =>
        Object.assign(Struct.omit(input, ["github"]), {
          github: input.github ?? null
        }),
      encode: (input) =>
        input.github === null ? Struct.omit(input, ["github"]) : input
    })
  )
)

const decodeProjectFrontmatter = Schema.decodeUnknownEffect(ProjectFrontmatter)
const encodeProjectFrontmatter = Schema.encodeSync(ProjectFrontmatter)

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
            Effect.tapCause((cause) =>
              Effect.logWarning("project frontmatter decode failed").pipe(
                Effect.annotateLogs({ cause: Cause.pretty(cause) })
              )
            ),
            Effect.orDie
          )
          const fallback = deriveProjectIdentity(slug)
          return {
            ...frontmatter,
            icon: frontmatter.icon ?? fallback.icon,
            color: frontmatter.color ?? fallback.color,
            body: file.body
          }
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
          encodeProjectFrontmatter(document),
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

    const readRaw = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<
      { path: string; content: string },
      NotFound | MarkdownError
    > =>
      withProjectDocTelemetry(
        "readRaw",
        orgSlug,
        slug,
        markdown.readProjectFileRaw(orgSlug, slug)
      )

    return { read, write, removeDir, readRaw } satisfies ProjectDocsShape
  })
)
