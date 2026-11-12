import {
  deriveProjectIdentity,
  EstimationMode,
  type GithubConnection,
  NotFound,
  ProjectKey,
  type ProjectSetup,
  Slug
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import * as Struct from "effect/Struct"

import * as Markdown from "../markdown/Markdown"
import {
  type SystemProjectRole,
  systemRoleFrom,
  withSystemRole
} from "./systemProjectFrontmatter"

export type ProjectDocument = Readonly<{
  org?: Slug
  slug: Slug
  key?: ProjectKey
  name: string
  icon: string
  color: string
  createdBy?: string
  createdAt: Date
  github: GithubConnection | null
  githubRepos: ReadonlyArray<GithubConnection>
  estimation: EstimationMode
  setup: ProjectSetup
  body: string
}>

export type ProjectDocumentWrite = Readonly<{
  org: string
  slug: string
  key: ProjectKey
  name: string
  icon: string
  color: string
  createdBy: string
  createdAt: Date
  github: GithubConnection | null
  githubRepos: ReadonlyArray<GithubConnection>
  estimation: EstimationMode
  setup: ProjectSetup
  body: string
}>

export class ProjectDocs extends Context.Service<
  ProjectDocs,
  Readonly<{
    read: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<ProjectDocument, NotFound | Markdown.MarkdownError>
    write: (
      orgSlug: string,
      slug: string,
      document: ProjectDocumentWrite
    ) => Effect.Effect<void, Markdown.MarkdownError>
    systemRole: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<
      Option.Option<SystemProjectRole>,
      NotFound | Markdown.MarkdownError
    >
    markSystem: (
      orgSlug: string,
      slug: string,
      role: SystemProjectRole
    ) => Effect.Effect<void, NotFound | Markdown.MarkdownError>
    removeDir: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<void, Markdown.MarkdownError>
    readRaw: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<
      Readonly<{ path: string; content: string }>,
      NotFound | Markdown.MarkdownError
    >
  }>
>()("@pp/server-core/projects/ProjectDocs") {}

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
  github: Schema.optionalKey(Schema.NullOr(ProjectDocGithub)),
  githubRepos: Schema.optionalKey(Schema.Array(ProjectDocGithub)),
  estimation: Schema.optionalKey(EstimationMode),
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
    github: () => Schema.NullOr(ProjectDocGithub),
    githubRepos: () => Schema.Array(ProjectDocGithub),
    estimation: () => EstimationMode
  })
)

const ProjectFrontmatter = ProjectFrontmatterOnDisk.pipe(
  Schema.decodeTo(
    Schema.toType(ProjectFrontmatterValue),
    SchemaTransformation.transform({
      decode: (input) =>
        Object.assign(
          Struct.omit(input, ["github", "githubRepos", "estimation"]),
          {
            github: input.github ?? null,
            githubRepos:
              input.githubRepos ?? (input.github ? [input.github] : []),
            estimation: input.estimation ?? "off"
          }
        ),
      encode: (input) =>
        Object.assign(
          Struct.omit(input, ["github", "githubRepos", "estimation"]),
          input.github === null ? {} : { github: input.github },
          input.githubRepos.length > 1
            ? { githubRepos: input.githubRepos }
            : {},
          input.estimation === "off" ? {} : { estimation: input.estimation }
        )
    })
  )
)

const decodeProjectFrontmatter = Schema.decodeUnknownEffect(ProjectFrontmatter)
const encodeProjectFrontmatter = Schema.encodeSync(ProjectFrontmatter)

const annotateProjectDoc = <A, E, R>(
  operation: string,
  orgSlug: string,
  slug: string,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => {
  const annotations = { module: "ProjectDocs", operation, orgSlug, slug }
  return Effect.annotateCurrentSpan(annotations).pipe(
    Effect.andThen(effect),
    Effect.annotateLogs(annotations)
  )
}

const make = Effect.gen(function* () {
  const markdown = yield* Markdown.Markdown

  const read = Effect.fn("ProjectDocs.read")(function* (
    orgSlug: string,
    slug: string
  ) {
    return yield* annotateProjectDoc(
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
  })

  const write = Effect.fn("ProjectDocs.write")(function* (
    orgSlug: string,
    slug: string,
    document: ProjectDocumentWrite
  ) {
    return yield* annotateProjectDoc(
      "write",
      orgSlug,
      slug,
      Effect.gen(function* () {
        const existing = yield* markdown.readProjectFile(orgSlug, slug).pipe(
          Effect.map((file) => systemRoleFrom(file.data)),
          Effect.catchTag("NotFound", () => Effect.succeed(Option.none()))
        )
        yield* markdown.writeProjectFile(
          orgSlug,
          slug,
          withSystemRole(encodeProjectFrontmatter(document), existing),
          document.body
        )
      })
    )
  })

  const systemRole = Effect.fn("ProjectDocs.systemRole")(function* (
    orgSlug: string,
    slug: string
  ) {
    return yield* annotateProjectDoc(
      "systemRole",
      orgSlug,
      slug,
      markdown
        .readProjectFile(orgSlug, slug)
        .pipe(Effect.map((file) => systemRoleFrom(file.data)))
    )
  })

  const markSystem = Effect.fn("ProjectDocs.markSystem")(function* (
    orgSlug: string,
    slug: string,
    role: SystemProjectRole
  ) {
    return yield* annotateProjectDoc(
      "markSystem",
      orgSlug,
      slug,
      Effect.gen(function* () {
        const file = yield* markdown.readProjectFile(orgSlug, slug)
        yield* markdown.writeProjectFile(
          orgSlug,
          slug,
          withSystemRole(file.data, Option.some(role)),
          file.body
        )
      })
    )
  })

  const removeDir = Effect.fn("ProjectDocs.removeDir")(function* (
    orgSlug: string,
    slug: string
  ) {
    return yield* annotateProjectDoc(
      "removeDir",
      orgSlug,
      slug,
      markdown.removeProjectDir(orgSlug, slug)
    )
  })

  const readRaw = Effect.fn("ProjectDocs.readRaw")(function* (
    orgSlug: string,
    slug: string
  ) {
    return yield* annotateProjectDoc(
      "readRaw",
      orgSlug,
      slug,
      markdown.readProjectFileRaw(orgSlug, slug)
    )
  })

  return ProjectDocs.of({
    read,
    write,
    systemRole,
    markSystem,
    removeDir,
    readRaw
  })
})

export const layer = Layer.effect(ProjectDocs, make)
