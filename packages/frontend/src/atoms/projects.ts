import { Atom } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"

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

export const updateProjectAtom = runtime.fn(
  Effect.fn(function* (
    input: {
      orgSlug: string
      slug: string
      name?: string
      body?: string
    },
    get
  ) {
    const client = yield* ApiClient
    const { orgSlug, slug, ...payload } = input
    const updated = yield* client.projects.update({
      path: { orgSlug, slug },
      payload
    })
    get.refresh(projectAtom(projectKey(orgSlug, slug)))
    get.refresh(projectsListAtom(orgSlug))
    return updated
  })
)

export const deleteProjectAtom = runtime.fn(
  Effect.fn(function* (input: { orgSlug: string; slug: string }, get) {
    const client = yield* ApiClient
    yield* client.projects.delete({
      path: { orgSlug: input.orgSlug, slug: input.slug }
    })
    get.refresh(projectsListAtom(input.orgSlug))
  })
)

// --- Members --------------------------------------------------------------

export const addMemberAtom = runtime.fn(
  Effect.fn(function* (
    input: {
      orgSlug: string
      slug: string
      email: string
      role: "admin" | "member"
    },
    get
  ) {
    const client = yield* ApiClient
    const updated = yield* client.projects.addMember({
      path: { orgSlug: input.orgSlug, slug: input.slug },
      payload: { email: input.email, role: input.role }
    })
    get.refresh(projectAtom(projectKey(input.orgSlug, input.slug)))
    return updated
  })
)

export const updateMemberAtom = runtime.fn(
  Effect.fn(function* (
    input: {
      orgSlug: string
      slug: string
      userId: string
      role: "admin" | "member"
    },
    get
  ) {
    const client = yield* ApiClient
    const updated = yield* client.projects.updateMember({
      path: {
        orgSlug: input.orgSlug,
        slug: input.slug,
        userId: input.userId
      },
      payload: { role: input.role }
    })
    get.refresh(projectAtom(projectKey(input.orgSlug, input.slug)))
    return updated
  })
)

export const removeMemberAtom = runtime.fn(
  Effect.fn(function* (
    input: { orgSlug: string; slug: string; userId: string },
    get
  ) {
    const client = yield* ApiClient
    yield* client.projects.removeMember({
      path: {
        orgSlug: input.orgSlug,
        slug: input.slug,
        userId: input.userId
      }
    })
    get.refresh(projectAtom(projectKey(input.orgSlug, input.slug)))
  })
)

export const createProjectAtom = runtime.fn(
  Effect.fn(function* (input: { orgSlug: string; name: string }, get) {
    const client = yield* ApiClient
    const project = yield* client.projects.create({
      path: { orgSlug: input.orgSlug },
      payload: { name: input.name }
    })
    get.refresh(projectsListAtom(input.orgSlug))
    return project
  })
)
