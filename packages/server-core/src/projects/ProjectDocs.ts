import type {
  EstimationMode,
  GithubConnection,
  NotFound,
  PartialTemplateDefaults,
  ProjectKey,
  ProjectSetup,
  Slug
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { MarkdownError } from "../markdown/Markdown"
import type { SystemProjectRole } from "./systemProjectFrontmatter"

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
  estimation: EstimationMode
  setup: ProjectSetup
  templateDefaults: PartialTemplateDefaults
  system?: SystemProjectRole
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
  estimation: EstimationMode
  setup: ProjectSetup
  body: string
}>

export interface ProjectDocsShape {
  readonly read: (
    orgSlug: string,
    slug: string
  ) => Effect.Effect<ProjectDocument, NotFound | MarkdownError>
  readonly write: (
    orgSlug: string,
    slug: string,
    document: ProjectDocumentWrite
  ) => Effect.Effect<void, MarkdownError>
  readonly writeTemplateDefaults: (
    orgSlug: string,
    slug: string,
    defaults: PartialTemplateDefaults
  ) => Effect.Effect<void, NotFound | MarkdownError>
  readonly markSystem: (
    orgSlug: string,
    slug: string,
    role: SystemProjectRole
  ) => Effect.Effect<void, NotFound | MarkdownError>
  readonly removeDir: (
    orgSlug: string,
    slug: string
  ) => Effect.Effect<void, MarkdownError>
  readonly readRaw: (
    orgSlug: string,
    slug: string
  ) => Effect.Effect<
    { path: string; content: string },
    NotFound | MarkdownError
  >
}

export class ProjectDocs extends Context.Service<
  ProjectDocs,
  ProjectDocsShape
>()("@pp/server-core/projects/ProjectDocs") {}
