import { Atom } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"

export const projectsListAtom = runtime
  .atom(
    Effect.gen(function*() {
      const client = yield* ApiClient
      return yield* client.projects.list()
    })
  )
  .pipe(Atom.setIdleTTL("1 minute"))

// One atom per slug, cached in the registry. Failure types come through verbatim
// (Unauthorized | NotFound) so route components can pattern-match.
export const projectAtom = Atom.family((slug: string) =>
  runtime
    .atom(
      Effect.gen(function*() {
        const client = yield* ApiClient
        return yield* client.projects.get({ path: { slug } })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
)

export const updateProjectAtom = runtime.fn(
  Effect.fn(function*(
    input: { slug: string; name?: string; body?: string },
    get
  ) {
    const client = yield* ApiClient
    const { slug, ...payload } = input
    const updated = yield* client.projects.update({
      path: { slug },
      payload
    })
    // Refresh both the detail atom for this slug (fresh body / name) and the
    // list (name change shows up on the cards).
    get.refresh(projectAtom(slug))
    get.refresh(projectsListAtom)
    return updated
  })
)

export const deleteProjectAtom = runtime.fn(
  Effect.fn(function*(input: { slug: string }, get) {
    const client = yield* ApiClient
    yield* client.projects.delete({ path: { slug: input.slug } })
    get.refresh(projectsListAtom)
  })
)

// --- Members --------------------------------------------------------------
// Each mutation refreshes the project detail atom so members change live in
// the UI. The list atom doesn't yet show members so we leave it alone.

export const addMemberAtom = runtime.fn(
  Effect.fn(function*(
    input: { slug: string; email: string; role: "admin" | "member" },
    get
  ) {
    const client = yield* ApiClient
    const updated = yield* client.projects.addMember({
      path: { slug: input.slug },
      payload: { email: input.email, role: input.role }
    })
    get.refresh(projectAtom(input.slug))
    return updated
  })
)

export const updateMemberAtom = runtime.fn(
  Effect.fn(function*(
    input: { slug: string; userId: string; role: "admin" | "member" },
    get
  ) {
    const client = yield* ApiClient
    const updated = yield* client.projects.updateMember({
      path: { slug: input.slug, userId: input.userId },
      payload: { role: input.role }
    })
    get.refresh(projectAtom(input.slug))
    return updated
  })
)

export const removeMemberAtom = runtime.fn(
  Effect.fn(function*(input: { slug: string; userId: string }, get) {
    const client = yield* ApiClient
    yield* client.projects.removeMember({
      path: { slug: input.slug, userId: input.userId }
    })
    get.refresh(projectAtom(input.slug))
  })
)

// Inline create. Refreshes the list atom on success so the new row shows up.
export const createProjectAtom = runtime.fn(
  Effect.fn(function*(input: { name: string }, get) {
    const client = yield* ApiClient
    const project = yield* client.projects.create({ payload: input })
    get.refresh(projectsListAtom)
    return project
  })
)
