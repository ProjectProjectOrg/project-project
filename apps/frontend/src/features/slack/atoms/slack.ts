import type {
  ConnectSlackInput,
  SaveSlackProjectInput,
  SlackProfile
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { replaceWith, viewMutation } from "@/api/viewMutation"

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
const slackOrgKeys = (req: SlackOrgRequest) => [
  Keys.slackOrg(req.params.orgSlug),
  Keys.slackProfiles()
]
export const connectSlackOrg = Atom.family((req: SlackOrgRequest) =>
  viewMutation(slackOrg(req), {
    name: "connectSlackOrg",
    predict: (status, _input: ConnectSlackInput) => status,
    call: (api, input) =>
      api.slack.connectOrg({ params: req.params, payload: input }),
    confirm: replaceWith,
    publish: () => slackOrgKeys(req)
  })
)
export const disconnectSlackOrg = Atom.family((req: SlackOrgRequest) =>
  viewMutation(slackOrg(req), {
    name: "disconnectSlackOrg",
    predict: (_status, _input: void) => ({ connection: null }),
    call: (api) => api.slack.disconnectOrg({ params: req.params }),
    confirm: replaceWith,
    publish: () => slackOrgKeys(req)
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
  Api.query("slack", "channels", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.slackOrg(req.params.orgSlug)]
  })
)
export const saveSlackProject = Atom.family((req: SlackProjectRequest) =>
  viewMutation(slackProject(req), {
    name: "saveSlackProject",
    predict: (status, input: SaveSlackProjectInput) => ({
      ...status,
      settings: {
        ...input,
        channelName:
          status.settings?.channelId === input.channelId
            ? status.settings.channelName
            : input.channelId
      }
    }),
    call: (api, input) =>
      api.slack.saveProject({ params: req.params, payload: input }),
    confirm: replaceWith
  })
)
export const disconnectSlackProject = Atom.family((req: SlackProjectRequest) =>
  viewMutation(slackProject(req), {
    name: "disconnectSlackProject",
    predict: (status, _input: void) => ({ ...status, settings: null }),
    call: (api) => api.slack.disconnectProject({ params: req.params }),
    confirm: replaceWith
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
  viewMutation(slackProfiles({}), {
    name: "disconnectSlackProfile",
    predict: (profiles, _input: void) =>
      unlinkProfile(profiles, req.params.orgSlug),
    call: (api) => api.slack.disconnectProfile({ params: req.params }),
    confirm: (profiles) => unlinkProfile(profiles, req.params.orgSlug)
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
