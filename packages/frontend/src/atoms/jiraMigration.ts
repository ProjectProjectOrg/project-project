import * as Atom from "effect/unstable/reactivity/Atom"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Effect from "effect/Effect"
import type {
  ConfigureJiraMigrationInput,
  CreateJiraMigrationInput,
  JiraMigrationRevisionInput
} from "@projectproject/shared"
import { projectsListAtom } from "@/atoms/projects"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"

export const jiraProfileAtom = runtime
  .atom(
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.jira.profile()
    })
  )
  .pipe(Atom.setIdleTTL("1 minute"))

export const jiraSitesAtom = runtime
  .atom(
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.jira.sites()
    })
  )
  .pipe(Atom.setIdleTTL("1 minute"))

export const jiraProjectsAtom = Atom.family((cloudId: string) =>
  cloudId
    ? runtime
        .atom(
          Effect.gen(function* () {
            const client = yield* ApiClient
            return yield* client.jira.projects({ params: { cloudId } })
          })
        )
        .pipe(Atom.setIdleTTL("1 minute"))
    : runtime.atom(Effect.succeed([]))
)

export const jiraMigrationKey = (orgSlug: string, migrationId: string) =>
  `${orgSlug}/${migrationId}`

const splitMigrationKey = (key: string) => {
  const separator = key.indexOf("/")
  return {
    orgSlug: key.slice(0, separator),
    migrationId: key.slice(separator + 1)
  }
}

const jiraMigrationsBaseAtom = Atom.family((orgSlug: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.jiraMigrations.list({ params: { orgSlug } })
      })
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
)

export const jiraMigrationsAtom = jiraMigrationsBaseAtom

const jiraMigrationBaseAtom = Atom.family((key: string) => {
  const { orgSlug, migrationId } = splitMigrationKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.jiraMigrations.get({
          params: { orgSlug, migrationId }
        })
      })
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
})

export const jiraMigrationRefreshAtom = jiraMigrationBaseAtom

export const jiraMigrationAtom = Atom.family((key: string) =>
  Atom.optimistic(jiraMigrationBaseAtom(key))
)

export const createJiraMigrationAtom = Atom.family((orgSlug: string) =>
  runtime.fn(
    Effect.fn(function* (input: CreateJiraMigrationInput, get) {
      const client = yield* ApiClient
      const migration = yield* client.jiraMigrations.create({
        params: { orgSlug },
        payload: input
      })
      get.refresh(jiraMigrationsBaseAtom(orgSlug))
      return migration
    })
  )
)

const lifecycleMutation = (
  key: string,
  operation: "rescan" | "run" | "cancel"
) => {
  const { orgSlug, migrationId } = splitMigrationKey(key)
  return Atom.optimisticFn(jiraMigrationAtom(key), {
    reducer: (current, _input: JiraMigrationRevisionInput) =>
      Result.isSuccess(current)
        ? Result.success(current.value, { waiting: true })
        : current,
    fn: runtime.fn(
      Effect.fn(function* (input: JiraMigrationRevisionInput, get) {
        const client = yield* ApiClient
        const migration = yield* client.jiraMigrations[operation]({
          params: { orgSlug, migrationId },
          payload: input
        })
        get.refresh(jiraMigrationBaseAtom(key))
        get.refresh(jiraMigrationsBaseAtom(orgSlug))
        if (migration.status === "succeeded") {
          get.refresh(projectsListAtom(orgSlug))
        }
        return migration
      })
    )
  })
}

export const rescanJiraMigrationAtom = Atom.family((key: string) =>
  lifecycleMutation(key, "rescan")
)

export const runJiraMigrationAtom = Atom.family((key: string) =>
  lifecycleMutation(key, "run")
)

export const cancelJiraMigrationAtom = Atom.family((key: string) =>
  lifecycleMutation(key, "cancel")
)

export const configureJiraMigrationAtom = Atom.family((key: string) => {
  const { orgSlug, migrationId } = splitMigrationKey(key)
  return Atom.optimisticFn(jiraMigrationAtom(key), {
    reducer: (current, _input: ConfigureJiraMigrationInput) =>
      Result.isSuccess(current)
        ? Result.success(current.value, { waiting: true })
        : current,
    fn: runtime.fn(
      Effect.fn(function* (input: ConfigureJiraMigrationInput, get) {
        const client = yield* ApiClient
        const migration = yield* client.jiraMigrations.configure({
          params: { orgSlug, migrationId },
          payload: input
        })
        get.refresh(jiraMigrationBaseAtom(key))
        get.refresh(jiraMigrationsBaseAtom(orgSlug))
        return migration
      })
    )
  })
})

export const discardJiraMigrationAtom = Atom.family((key: string) => {
  const { orgSlug, migrationId } = splitMigrationKey(key)
  return runtime.fn(
    Effect.fn(function* (_input: void, get) {
      const client = yield* ApiClient
      yield* client.jiraMigrations.discard({ params: { orgSlug, migrationId } })
      get.refresh(jiraMigrationsBaseAtom(orgSlug))
    })
  )
})
