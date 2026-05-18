import { Atom } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import { CreatableProjectKey } from "@projectproject/shared"

// Atom.family keys must compare by value, not reference. Slugs are DNS-safe
// (no `/`), so a slash is an unambiguous separator between org and project.
export const projectKey = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`

const splitProjectKey = (key: string): { orgSlug: string; slug: string } => {
  const sep = key.indexOf("/")
  return { orgSlug: key.slice(0, sep), slug: key.slice(sep + 1) }
}

export const projectsListAtom = Atom.family((orgSlug: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.projects.list({ path: { orgSlug } })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
)

export const projectAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.projects.get({ path: { orgSlug, slug } })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
})

export const updateProjectAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime.fn(
    Effect.fn(function* (input: { name?: string; body?: string }, get) {
      const client = yield* ApiClient
      const updated = yield* client.projects.update({
        path: { orgSlug, slug },
        payload: input
      })
      get.refresh(projectAtom(key))
      get.refresh(projectsListAtom(orgSlug))
      return updated
    })
  )
})

export const deleteProjectAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime.fn(
    Effect.fn(function* (_input: void, get) {
      const client = yield* ApiClient
      yield* client.projects.delete({ path: { orgSlug, slug } })
      get.refresh(projectsListAtom(orgSlug))
    })
  )
})

// --- Members --------------------------------------------------------------

export const addMemberAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime.fn(
    Effect.fn(function* (
      input: { email: string; role: "admin" | "member" },
      get
    ) {
      const client = yield* ApiClient
      const updated = yield* client.projects.addMember({
        path: { orgSlug, slug },
        payload: input
      })
      get.refresh(projectAtom(key))
      return updated
    })
  )
})

export const memberKey = (orgSlug: string, slug: string, userId: string) =>
  `${orgSlug}/${slug}/${userId}`

const splitMemberKey = (
  key: string
): { orgSlug: string; slug: string; userId: string } => {
  const parts = key.split("/")
  return {
    orgSlug: parts[0],
    slug: parts[1],
    userId: parts.slice(2).join("/")
  }
}

export const updateMemberAtom = Atom.family((key: string) => {
  const { orgSlug, slug, userId } = splitMemberKey(key)
  return runtime.fn(
    Effect.fn(function* (input: { role: "admin" | "member" }, get) {
      const client = yield* ApiClient
      const updated = yield* client.projects.updateMember({
        path: { orgSlug, slug, userId },
        payload: input
      })
      get.refresh(projectAtom(projectKey(orgSlug, slug)))
      return updated
    })
  )
})

export const removeMemberAtom = Atom.family((key: string) => {
  const { orgSlug, slug, userId } = splitMemberKey(key)
  return runtime.fn(
    Effect.fn(function* (_input: void, get) {
      const client = yield* ApiClient
      yield* client.projects.removeMember({ path: { orgSlug, slug, userId } })
      get.refresh(projectAtom(projectKey(orgSlug, slug)))
    })
  )
})

export const pendingMemberKey = (
  orgSlug: string,
  slug: string,
  invitationId: string
) => `${orgSlug}/${slug}/${invitationId}`

const splitPendingMemberKey = (
  key: string
): { orgSlug: string; slug: string; invitationId: string } => {
  const parts = key.split("/")
  return {
    orgSlug: parts[0],
    slug: parts[1],
    invitationId: parts.slice(2).join("/")
  }
}

export const cancelPendingMemberAtom = Atom.family((key: string) => {
  const { orgSlug, slug, invitationId } = splitPendingMemberKey(key)
  return runtime.fn(
    Effect.fn(function* (_input: void, get) {
      const client = yield* ApiClient
      const updated = yield* client.projects.cancelPendingMember({
        path: { orgSlug, slug, invitationId }
      })
      get.refresh(projectAtom(projectKey(orgSlug, slug)))
      return updated
    })
  )
})

export const createProjectAtom = Atom.family((orgSlug: string) =>
  runtime.fn(
    Effect.fn(function* (input: { name: string; key: string }, get) {
      const client = yield* ApiClient
      const key = yield* Schema.decodeUnknown(CreatableProjectKey)(input.key)
      const project = yield* client.projects.create({
        path: { orgSlug },
        payload: { name: input.name, key }
      })
      get.refresh(projectsListAtom(orgSlug))
      return project
    })
  )
)
