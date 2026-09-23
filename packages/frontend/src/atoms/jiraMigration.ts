import * as Atom from "effect/unstable/reactivity/Atom"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Effect from "effect/Effect"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import type {
  ConfigureJiraMigrationInput,
  CreateJiraMigrationInput,
  JiraMigrationRevisionInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"

export type JiraOrgRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export type JiraProjectsRequest = Readonly<{
  params: Readonly<{ cloudId: string }>
}>

export type JiraMigrationRequest = Readonly<{
  params: Readonly<{ orgSlug: string; migrationId: string }>
}>

export const jiraOrgRequest = (orgSlug: string): JiraOrgRequest => ({
  params: { orgSlug }
})

export const jiraProjectsRequest = (cloudId: string): JiraProjectsRequest => ({
  params: { cloudId }
})

export const jiraMigrationKey = (
  orgSlug: string,
  migrationId: string
): JiraMigrationRequest => ({ params: { orgSlug, migrationId } })

export const jiraProfileAtom = Api.query("jira", "profile", {
  timeToLive: "1 minute"
})

export const jiraSitesAtom = Api.query("jira", "sites", {
  timeToLive: "1 minute"
})

export const jiraProjectsAtom = Atom.family((req: JiraProjectsRequest) =>
  req.params.cloudId
    ? Api.query("jira", "projects", {
        params: req.params,
        timeToLive: "1 minute"
      })
    : Atom.make(Result.success([]))
)

const jiraMigrationsQuery = (req: JiraOrgRequest) =>
  Api.query("jiraMigrations", "list", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.jiraMigrations(req.params.orgSlug)]
  })

export const jiraMigrationsAtom = Atom.family((req: JiraOrgRequest) =>
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

export const jiraMigrationAtom = Atom.family((req: JiraMigrationRequest) =>
  Atom.optimistic(jiraMigrationQuery(req))
)

export const refreshJiraMigrationAtom = Atom.family(
  (req: JiraMigrationRequest) =>
    Api.runtime.fn(
      Effect.fn("refreshJiraMigration")(function* (_input: void, get) {
        yield* Effect.sync(() => get.refresh(jiraMigrationAtom(req)))
      })
    )
)

export const createJiraMigrationAtom = Atom.family((req: JiraOrgRequest) =>
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
  Atom.optimisticFn(jiraMigrationAtom(req), {
    reducer: (current, _input: JiraMigrationRevisionInput) => current,
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("jiraMigrationLifecycle")(function* (
          input: JiraMigrationRevisionInput
        ) {
          const migration = yield* Api.use((client) =>
            client.jiraMigrations[operation]({
              params: req.params,
              payload: input
            })
          )
          set(Result.success(migration))
          yield* Reactivity.invalidate([
            Keys.jiraMigrations(req.params.orgSlug),
            ...(migration.status === "succeeded"
              ? [Keys.projects(req.params.orgSlug)]
              : [])
          ])
          return migration
        })
      )
  })

export const rescanJiraMigrationAtom = Atom.family(
  (req: JiraMigrationRequest) => lifecycleMutation(req, "rescan")
)

export const runJiraMigrationAtom = Atom.family((req: JiraMigrationRequest) =>
  lifecycleMutation(req, "run")
)

export const cancelJiraMigrationAtom = Atom.family(
  (req: JiraMigrationRequest) => lifecycleMutation(req, "cancel")
)

export const configureJiraMigrationAtom = Atom.family(
  (req: JiraMigrationRequest) =>
    Atom.optimisticFn(jiraMigrationAtom(req), {
      reducer: (current, _input: ConfigureJiraMigrationInput) => current,
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("configureJiraMigration")(function* (
            input: ConfigureJiraMigrationInput
          ) {
            const migration = yield* Api.use((client) =>
              client.jiraMigrations.configure({
                params: req.params,
                payload: input
              })
            )
            set(Result.success(migration))
            yield* Reactivity.invalidate([
              Keys.jiraMigrations(req.params.orgSlug)
            ])
            return migration
          })
        )
    })
)

export const discardJiraMigrationAtom = Atom.family(
  (req: JiraMigrationRequest) =>
    Api.runtime.fn(
      Effect.fn("discardJiraMigration")(function* (_input: void) {
        yield* Api.use((client) =>
          client.jiraMigrations.discard({ params: req.params })
        )
        yield* Reactivity.invalidate([Keys.jiraMigrations(req.params.orgSlug)])
      })
    )
)
