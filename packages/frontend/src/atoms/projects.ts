import { Atom } from "@effect-atom/atom-react"
import { AppApiClient } from "@/services/AppApiClient"
import { ReactivityKey } from "@/atoms/reactivity-keys"
import {
  memberKey,
  orgKey,
  projectKey,
  type MemberKey,
  type OrgKey,
  type ProjectKey
} from "@/atoms/keys"

export { memberKey, orgKey, projectKey }
export type { MemberKey, OrgKey, ProjectKey }

export const projectsListAtom = Atom.family(({ orgSlug }: OrgKey) =>
  AppApiClient.query("projects", "list", {
    path: { orgSlug },
    reactivityKeys: [ReactivityKey.projects],
    timeToLive: "1 minute"
  })
)

export const projectAtom = Atom.family(({ orgSlug, slug }: ProjectKey) =>
  AppApiClient.query("projects", "get", {
    path: { orgSlug, slug },
    reactivityKeys: [ReactivityKey.projects],
    timeToLive: "2 minutes"
  })
)

export const updateProjectAtom = Atom.family((_key: ProjectKey) =>
  AppApiClient.mutation("projects", "update")
)

export const deleteProjectAtom = Atom.family((_key: ProjectKey) =>
  AppApiClient.mutation("projects", "delete")
)

// --- Members --------------------------------------------------------------

export const addMemberAtom = Atom.family((_key: ProjectKey) =>
  AppApiClient.mutation("projects", "addMember")
)

export const updateMemberAtom = Atom.family((_key: MemberKey) =>
  AppApiClient.mutation("projects", "updateMember")
)

export const removeMemberAtom = Atom.family((_key: MemberKey) =>
  AppApiClient.mutation("projects", "removeMember")
)

export const createProjectAtom = Atom.family((_key: OrgKey) =>
  AppApiClient.mutation("projects", "create")
)
