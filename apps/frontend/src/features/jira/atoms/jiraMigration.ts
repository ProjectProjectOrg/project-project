import type {
  CreateJiraMigrationInput,
  JiraMigrationConfiguration,
  JiraMigrationDetail,
  JiraMigrationRevisionInput,
  JiraMigrationSummary
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { query } from "@/api/query"
import {
  coalescingMutation,
  keepPredicted,
  replaceWith,
  viewMutation
} from "@/api/viewMutation"

export type JiraOrgRequest = ReturnType<typeof jiraOrgRequest>

export type JiraProjectsRequest = ReturnType<typeof jiraProjectsRequest>

export type JiraMigrationRequest = ReturnType<typeof jiraMigrationRequest>

export type JiraDestinationConflictsRequest = ReturnType<
  typeof jiraDestinationConflictsRequest
>

export type JiraSkippedAttachmentsRequest = ReturnType<
  typeof jiraSkippedAttachmentsRequest
>

export const jiraOrgRequest = (orgSlug: string) =>
  ({
    _view: "jiraImports",
    params: { orgSlug }
  }) as const

export const jiraProjectsRequest = (cloudId: string) =>
  ({
    _view: "jiraProjects",
    params: { cloudId }
  }) as const

export const jiraMigrationRequest = (orgSlug: string, migrationId: string) =>
  ({
    _view: "jiraImport",
    params: { orgSlug, migrationId }
  }) as const

export const jiraDestinationConflictsRequest = (
  orgSlug: string,
  migrationId: string,
  expectedRevision: number
) =>
  ({
    _view: "jiraDestinationConflicts",
    params: { orgSlug, migrationId },
    query: { expectedRevision }
  }) as const

export const jiraSkippedAttachmentsRequest = (
  orgSlug: string,
  migrationId: string
) =>
  ({
    _view: "jiraSkippedAttachments",
    params: { orgSlug, migrationId }
  }) as const

export const jiraProfile = query("jira", "profile", {
  timeToLive: "1 minute"
})

export const jiraSites = query("jira", "sites", {
  timeToLive: "1 minute"
})

export const jiraProjects = Atom.family((req: JiraProjectsRequest) =>
  query("jira", "projects", {
    params: req.params,
    timeToLive: "1 minute"
  })
)

const jiraMigrationsQuery = (req: JiraOrgRequest) =>
  query("jiraMigrations", "list", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.jiraMigrations(req.params.orgSlug)]
  })

export const jiraMigrations = Atom.family((req: JiraOrgRequest) =>
  Atom.optimistic(jiraMigrationsQuery(req))
)

const jiraMigrationQuery = (req: JiraMigrationRequest) =>
  query("jiraMigrations", "get", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [
      Keys.jiraMigration(req.params.orgSlug, req.params.migrationId)
    ]
  })

export const jiraMigration = Atom.family((req: JiraMigrationRequest) =>
  Atom.optimistic(jiraMigrationQuery(req))
)

export const jiraDestinationConflicts = Atom.family(
  (req: JiraDestinationConflictsRequest) =>
    query("jiraMigrations", "destinationConflicts", {
      params: req.params,
      query: req.query,
      timeToLive: "30 seconds"
    })
)

export const jiraSkippedAttachments = Atom.family(
  (req: JiraSkippedAttachmentsRequest) =>
    query("jiraMigrations", "skippedAttachments", {
      params: req.params,
      timeToLive: "1 hour"
    })
)

const toSummary = (detail: JiraMigrationDetail) =>
  ({
    id: detail.id,
    sourceCloudId: detail.sourceCloudId,
    sourceProjectId: detail.sourceProjectId,
    sourceProjectKey: detail.sourceProjectKey,
    sourceProjectName: detail.sourceProjectName,
    status: detail.status,
    phase: detail.phase,
    revision: detail.revision,
    progress: detail.progress,
    destinationProjectSlug: detail.destinationProjectSlug,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt
  }) satisfies JiraMigrationSummary

const withoutImport = (
  imports: ReadonlyArray<JiraMigrationSummary>,
  migrationId: string
) => imports.filter((summary) => summary.id !== migrationId)

export const createJiraMigration = Atom.family((req: JiraOrgRequest) =>
  viewMutation(jiraMigrations(req), {
    name: "createJiraMigration",
    predict: (imports, _input: CreateJiraMigrationInput) => imports,
    call: (client, input) =>
      client.jiraMigrations.create({ params: req.params, payload: input }),
    confirm: (imports, detail) => [
      toSummary(detail),
      ...withoutImport(imports, detail.id)
    ]
  })
)

export const discardJiraMigration = Atom.family(
  ({
    req,
    migrationId
  }: Readonly<{ req: JiraOrgRequest; migrationId: string }>) =>
    viewMutation(jiraMigrations(req), {
      name: "discardJiraMigration",
      predict: (imports, _input: void) => withoutImport(imports, migrationId),
      call: (client) =>
        client.jiraMigrations.discard({
          params: { orgSlug: req.params.orgSlug, migrationId }
        }),
      confirm: keepPredicted
    })
)

const lifecycleMutation = (
  req: JiraMigrationRequest,
  operation: "rescan" | "run" | "cancel"
) =>
  viewMutation(jiraMigration(req), {
    name: "jiraMigrationLifecycle",
    predict: (migration, _input: JiraMigrationRevisionInput) => migration,
    call: (client, input) =>
      client.jiraMigrations[operation]({ params: req.params, payload: input }),
    confirm: replaceWith,
    publish: () => [Keys.jiraMigrations(req.params.orgSlug)]
  })

export const rescanJiraMigration = Atom.family((req: JiraMigrationRequest) =>
  lifecycleMutation(req, "rescan")
)

export const runJiraMigration = Atom.family((req: JiraMigrationRequest) =>
  lifecycleMutation(req, "run")
)

export const cancelJiraMigration = Atom.family((req: JiraMigrationRequest) =>
  lifecycleMutation(req, "cancel")
)

export type ConfigureJiraImportInput = Readonly<{
  configuration: JiraMigrationConfiguration
}>

const currentRevision = (
  result: AsyncResult.AsyncResult<JiraMigrationDetail, unknown>,
  previous: JiraMigrationDetail | undefined
) =>
  Math.max(
    previous?.revision ?? 0,
    AsyncResult.isSuccess(result) ? result.value.revision : 0
  )

export const configureJiraMigration = Atom.family((req: JiraMigrationRequest) =>
  coalescingMutation(jiraMigration(req), {
    name: "configureJiraMigration",
    idleTTL: "10 minutes",
    predict: (migration, input: ConfigureJiraImportInput) => ({
      ...migration,
      configuration: input.configuration
    }),
    call: (
      client,
      input: ConfigureJiraImportInput,
      get,
      previous: JiraMigrationDetail | undefined
    ) =>
      client.jiraMigrations.configure({
        params: req.params,
        payload: {
          expectedRevision: currentRevision(get(jiraMigration(req)), previous),
          configuration: input.configuration
        }
      }),
    confirm: replaceWith,
    publish: () => [Keys.jiraMigrations(req.params.orgSlug)]
  })
)

export const invalidateAfterImport = Atom.family((req: JiraOrgRequest) =>
  Api.runtime.fn(
    Effect.fn("invalidateAfterImport")(function* (_input: void) {
      yield* Reactivity.invalidate([
        Keys.projects(req.params.orgSlug),
        Keys.jiraMigrations(req.params.orgSlug)
      ])
    })
  )
)

export type JiraReportRequest = ReturnType<typeof jiraReportRequest>

export const jiraReportRequest = (orgSlug: string, migrationId: string) =>
  ({
    _view: "jiraReport",
    params: { orgSlug, migrationId }
  }) as const

export const jiraMigrationReport = Atom.family((req: JiraReportRequest) =>
  query("jiraMigrations", "report", {
    params: req.params,
    timeToLive: "10 minutes"
  })
)
