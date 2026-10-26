import type {
  ConfigureJiraMigrationInput,
  CreateJiraMigrationInput,
  JiraMigrationRevisionInput
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { replaceWith, viewMutation } from "@/api/viewMutation"

export type JiraOrgRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export type JiraProjectsRequest = Readonly<{
  params: Readonly<{ cloudId: string }>
}>

export type JiraMigrationRequest = Readonly<{
  params: Readonly<{ orgSlug: string; migrationId: string }>
}>

export type JiraDestinationConflictsRequest = Readonly<{
  params: Readonly<{ orgSlug: string; migrationId: string }>
  query: Readonly<{ expectedRevision: number }>
}>

export const jiraOrgRequest = (orgSlug: string): JiraOrgRequest => ({
  params: { orgSlug }
})

export const jiraProjectsRequest = (cloudId: string): JiraProjectsRequest => ({
  params: { cloudId }
})

export const jiraMigrationRequest = (
  orgSlug: string,
  migrationId: string
): JiraMigrationRequest => ({ params: { orgSlug, migrationId } })

export const jiraProfile = Api.query("jira", "profile", {
  timeToLive: "1 minute"
})

export const jiraSites = Api.query("jira", "sites", {
  timeToLive: "1 minute"
})

export const jiraProjects = Atom.family((req: JiraProjectsRequest) =>
  Api.query("jira", "projects", {
    params: req.params,
    timeToLive: "1 minute"
  })
)

const jiraMigrationsQuery = (req: JiraOrgRequest) =>
  Api.query("jiraMigrations", "list", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.jiraMigrations(req.params.orgSlug)]
  })

export const jiraMigrations = Atom.family((req: JiraOrgRequest) =>
  Atom.optimistic(jiraMigrationsQuery(req))
)

const jiraMigrationQuery = (req: JiraMigrationRequest) =>
  Api.query("jiraMigrations", "get", {
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
    Api.query("jiraMigrations", "destinationConflicts", {
      params: req.params,
      query: req.query,
      timeToLive: "30 seconds"
    })
)

export const jiraSkippedAttachments = Atom.family((req: JiraMigrationRequest) =>
  Api.query("jiraMigrations", "skippedAttachments", {
    params: req.params,
    timeToLive: "1 hour"
  })
)

export const invalidateJiraProjects = Atom.family((req: JiraOrgRequest) =>
  Api.runtime.fn(
    Effect.fn("invalidateJiraProjects")(function* (_input: void) {
      yield* Reactivity.invalidate([Keys.projects(req.params.orgSlug)])
    })
  )
)

export const createJiraMigration = Atom.family((req: JiraOrgRequest) =>
  Api.runtime.fn(
    Effect.fn("createJiraMigration")(function* (
      input: CreateJiraMigrationInput
    ) {
      const migration = yield* Api.use((client) =>
        client.jiraMigrations.create({ params: req.params, payload: input })
      )
      yield* Reactivity.invalidate([Keys.jiraMigrations(req.params.orgSlug)])
      return migration
    })
  )
)

const lifecycleMutation = (
  req: JiraMigrationRequest,
  operation: "rescan" | "run" | "cancel"
) =>
  viewMutation(jiraMigration(req), {
    name: "jiraMigrationLifecycle",
    predict: (migration, _input: JiraMigrationRevisionInput) => migration,
    call: (input) =>
      Api.use((client) =>
        client.jiraMigrations[operation]({ params: req.params, payload: input })
      ),
    confirm: replaceWith,
    publish: (migration) => [
      Keys.jiraMigrations(req.params.orgSlug),
      ...(migration.status === "succeeded"
        ? [Keys.projects(req.params.orgSlug)]
        : [])
    ]
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

export const configureJiraMigration = Atom.family((req: JiraMigrationRequest) =>
  viewMutation(jiraMigration(req), {
    name: "configureJiraMigration",
    predict: (migration, _input: ConfigureJiraMigrationInput) => migration,
    call: (input) =>
      Api.use((client) =>
        client.jiraMigrations.configure({
          params: req.params,
          payload: input
        })
      ),
    confirm: replaceWith,
    publish: () => [Keys.jiraMigrations(req.params.orgSlug)]
  })
)

export const discardJiraMigration = Atom.family((req: JiraMigrationRequest) =>
  Api.runtime.fn(
    Effect.fn("discardJiraMigration")(function* (_input: void) {
      yield* Api.use((client) =>
        client.jiraMigrations.discard({ params: req.params })
      )
      yield* Reactivity.invalidate([Keys.jiraMigrations(req.params.orgSlug)])
    })
  )
)
