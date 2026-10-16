import type {
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

export interface ProjectDocument {
  readonly org?: Slug
  readonly slug: Slug
  readonly key?: ProjectKey
  readonly name: string
  readonly icon: string
  readonly color: string
  readonly createdBy?: string
  readonly createdAt: Date
  readonly github: GithubConnection | null
  readonly setup: ProjectSetup
  readonly templateDefaults: PartialTemplateDefaults
  readonly body: string
}

export interface ProjectDocumentWrite {
  readonly org: string
  readonly slug: string
  readonly key: ProjectKey
  readonly name: string
  readonly icon: string
  readonly color: string
  readonly createdBy: string
  readonly createdAt: Date
  readonly github: GithubConnection | null
  readonly setup: ProjectSetup
  readonly body: string
}

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
