import { Effect, Layer, Schema } from "effect"
import {
  GithubConnection,
  NotFound,
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
  data: Record<string, unknown>,
  slug: string
): void {
  const onDisk = data["org"]
  if (onDisk === undefined) {
    console.warn(
      `[markdown] project '${slug}' has no 'org' frontmatter (expected '${expected}'). Run migrate:orgs.`
    )
    return
  }
  if (onDisk !== expected) {
    const onDiskSafe =
      typeof onDisk === "string" ? onDisk : JSON.stringify(onDisk)
    console.warn(
      `[markdown] project '${slug}' frontmatter org='${onDiskSafe}' does not match request org='${expected}'.`
    )
  }
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

function toFrontmatter(document: ProjectDocumentWrite): Record<string, unknown> {
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

export const ProjectDocsLive = Layer.effect(
  ProjectDocs,
  Effect.gen(function* () {
    const markdown = yield* Markdown

    const read = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ProjectDocument, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        const file = yield* markdown.readProjectFile(orgSlug, slug)
        checkOrgFrontmatter(orgSlug, file.data, slug)
        const frontmatter = yield* decodeProjectFrontmatter(file.data).pipe(
          Effect.orDie
        )
        return { ...frontmatter, body: file.body }
      })

    const write = (
      orgSlug: string,
      slug: string,
      document: ProjectDocumentWrite
    ): Effect.Effect<void, MarkdownError> =>
      markdown.writeProjectFile(
        orgSlug,
        slug,
        toFrontmatter(document),
        document.body
      )

    const removeDir = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<void, MarkdownError> =>
      markdown.removeProjectDir(orgSlug, slug)

    return { read, write, removeDir } satisfies ProjectDocsShape
  })
)
