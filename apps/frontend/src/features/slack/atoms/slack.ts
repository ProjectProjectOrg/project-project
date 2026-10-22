import type {
  ConnectSlackInput,
  SaveSlackProjectInput,
  SlackProfile
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export type SlackOrgRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>
export type SlackProjectRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>
export const slackOrgRequest = (orgSlug: string): SlackOrgRequest => ({
  params: { orgSlug }
})
export const slackProjectRequest = (
  orgSlug: string,
  slug: string
): SlackProjectRequest => ({ params: { orgSlug, slug } })

export const slackOrg = Atom.family((req: SlackOrgRequest) =>
  Atom.optimistic(
    Api.query("slack", "orgStatus", {
      params: req.params,
      timeToLive: "30 seconds",
      reactivityKeys: [Keys.slackOrg(req.params.orgSlug)]
    })
  )
)
export const slackManifest = Atom.family((req: SlackOrgRequest) =>
  Atom.optimistic(
    Api.query("slack", "manifest", {
      params: req.params,
      timeToLive: "5 minutes"
    })
  )
)
export const connectSlackOrg = Atom.family((req: SlackOrgRequest) =>
  Atom.optimisticFn(slackOrg(req), {
    reducer: (current, _input: ConnectSlackInput) => current,
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("connectSlackOrg")(function* (input: ConnectSlackInput) {
          const status = yield* Api.use((api) =>
            api.slack.connectOrg({ params: req.params, payload: input })
          )
          set(Result.success(status))
          yield* Reactivity.invalidate([
            Keys.slackOrg(req.params.orgSlug),
            Keys.slackProfiles()
          ])
          return status
        })
      )
  })
)
export const disconnectSlackOrg = Atom.family((req: SlackOrgRequest) =>
  Atom.optimisticFn(slackOrg(req), {
    reducer: (current, _input: void) =>
      Result.map(current, () => ({ connection: null })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("disconnectSlackOrg")(function* (_input: void) {
          const status = yield* Api.use((api) =>
            api.slack.disconnectOrg({ params: req.params })
          )
          set(Result.success(status))
          yield* Reactivity.invalidate([
            Keys.slackOrg(req.params.orgSlug),
            Keys.slackProfiles()
          ])
          return status
        })
      )
  })
)
export const slackProject = Atom.family((req: SlackProjectRequest) =>
  Atom.optimistic(
    Api.query("slack", "projectStatus", {
      params: req.params,
      timeToLive: "30 seconds",
      reactivityKeys: [
        Keys.slackProject(projectScope(req.params.orgSlug, req.params.slug)),
        Keys.slackOrg(req.params.orgSlug)
      ]
    })
  )
)
export const slackChannels = Atom.family((req: SlackProjectRequest) =>
  Atom.optimistic(
    Api.query("slack", "channels", {
      params: req.params,
      timeToLive: "30 seconds",
      reactivityKeys: [Keys.slackOrg(req.params.orgSlug)]
    })
  )
)
export const saveSlackProject = Atom.family((req: SlackProjectRequest) =>
  Atom.optimisticFn(slackProject(req), {
    reducer: (current, input: SaveSlackProjectInput) =>
      Result.map(current, (status) => ({
        ...status,
        settings: {
          ...input,
          channelName:
            status.settings?.channelId === input.channelId
              ? status.settings.channelName
              : input.channelId
        }
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("saveSlackProject")(function* (input: SaveSlackProjectInput) {
          const status = yield* Api.use((api) =>
            api.slack.saveProject({ params: req.params, payload: input })
          )
          set(Result.success(status))
          return status
        })
      )
  })
)
export const disconnectSlackProject = Atom.family((req: SlackProjectRequest) =>
  Atom.optimisticFn(slackProject(req), {
    reducer: (current, _input: void) =>
      Result.map(current, (status) => ({ ...status, settings: null })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("disconnectSlackProject")(function* (_input: void) {
          const status = yield* Api.use((api) =>
            api.slack.disconnectProject({ params: req.params })
          )
          set(Result.success(status))
          return status
        })
      )
  })
)
export const testSlackProject = Atom.family((req: SlackProjectRequest) =>
  Api.runtime.fn(
    Effect.fn("testSlackProject")(function* (_input: void) {
      yield* Api.use((api) => api.slack.testProject({ params: req.params }))
    })
  )
)
export const slackProfiles = Atom.family(
  (_req: Readonly<Record<string, never>>) =>
    Atom.optimistic(
      Api.query("slack", "profiles", {
        timeToLive: "30 seconds",
        reactivityKeys: [Keys.slackProfiles()]
      })
    )
)
export const disconnectSlackProfile = Atom.family((req: SlackOrgRequest) =>
  Atom.optimisticFn(slackProfiles({}), {
    reducer: (current, _input: void) =>
      Result.map(current, (profiles) =>
        unlinkProfile(profiles, req.params.orgSlug)
      ),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("disconnectSlackProfile")(function* (_input: void, get) {
          yield* Api.use((api) =>
            api.slack.disconnectProfile({ params: req.params })
          )
          set(
            Result.map(get(slackProfiles({})), (profiles) =>
              unlinkProfile(profiles, req.params.orgSlug)
            )
          )
        })
      )
  })
)

const unlinkProfile = (
  profiles: ReadonlyArray<SlackProfile>,
  orgSlug: string
) =>
  profiles.map((profile) =>
    profile.orgSlug === orgSlug
      ? { ...profile, slackUserId: null, displayName: null }
      : profile
  )
