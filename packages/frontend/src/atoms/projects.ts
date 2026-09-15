import * as Effect from "effect/Effect"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import {
  type AddMemberInput,
  type CreateProjectInput,
  type ProjectDetail,
  type UpdateMemberInput,
  type UpdateProjectInput,
  type UpdateProjectSetupInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export interface ProjectsRequest {
  readonly params: { readonly orgSlug: string }
}

export const projectsRequest = (orgSlug: string): ProjectsRequest => ({
  params: { orgSlug }
})

export interface ProjectRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
}

export const projectRequest = (
  orgSlug: string,
  slug: string
): ProjectRequest => ({
  params: { orgSlug, slug }
})

export const projectKey = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`

const scopeOf = (req: ProjectRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const projectsQuery = (req: ProjectsRequest) =>
  Api.query("projects", "list", {
    params: req.params,
    timeToLive: "1 minute",
    reactivityKeys: [Keys.projects(req.params.orgSlug)]
  })

export const projectsFor = Atom.family((req: ProjectsRequest) =>
  Atom.optimistic(projectsQuery(req))
)

const projectQuery = (req: ProjectRequest) =>
  Api.query("projects", "get", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.project(scopeOf(req))]
  })

export const project = Atom.family((req: ProjectRequest) =>
  Atom.optimistic(projectQuery(req))
)

export const updateProject = Atom.family((req: ProjectRequest) =>
  Atom.optimisticFn(project(req), {
    reducer: (current, input: UpdateProjectInput) =>
      AsyncResult.map(current, (value) => ({ ...value, ...input })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: UpdateProjectInput) {
          const updated = yield* Api.use((client) =>
            client.projects.update({ params: req.params, payload: input })
          )
          set(AsyncResult.success(updated))
          yield* Reactivity.invalidate([Keys.projects(req.params.orgSlug)])
          return updated
        })
      )
  })
)

export const updateProjectSetup = Atom.family((req: ProjectRequest) =>
  Atom.optimisticFn(project(req), {
    reducer: (current, input: UpdateProjectSetupInput) =>
      AsyncResult.map(current, (value) => ({
        ...value,
        setup: { ...value.setup, ...input }
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: UpdateProjectSetupInput) {
          const updated = yield* Api.use((client) =>
            client.projects.updateSetup({
              params: req.params,
              payload: input
            })
          )
          set(AsyncResult.success(updated))
          yield* Reactivity.invalidate([Keys.projects(req.params.orgSlug)])
          return updated
        })
      )
  })
)

export const deleteProject = Atom.family((req: ProjectRequest) =>
  Api.runtime.fn(
    Effect.fn(function* (_input: void) {
      yield* Api.use((client) => client.projects.delete({ params: req.params }))
      yield* Reactivity.invalidate([
        Keys.project(scopeOf(req)),
        Keys.projects(req.params.orgSlug),
        Keys.ticketsIn(scopeOf(req))
      ])
    })
  )
)

type MemberMutationRequest = {
  readonly req: ProjectRequest
  readonly id: string
}

const replaceMember = (
  value: ProjectDetail,
  id: string,
  input: UpdateMemberInput
): ProjectDetail => ({
  ...value,
  members: value.members.map((member) =>
    member.id === id ? { ...member, ...input } : member
  )
})

export const addMember = Atom.family(({ req, id }: MemberMutationRequest) =>
  Atom.optimisticFn(project(req), {
    reducer: (current, input: AddMemberInput) =>
      AsyncResult.map(current, (value) => ({
        ...value,
        pendingMembers: [
          ...value.pendingMembers.filter(
            (member) => member.email !== input.email
          ),
          {
            invitationId: `optimistic:${id}`,
            email: input.email,
            role: input.role,
            expiresAt: DateTime.toDate(
              DateTime.makeUnsafe("1970-01-01T00:00:00.000Z")
            )
          }
        ]
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: AddMemberInput) {
          const updated = yield* Api.use((client) =>
            client.projects.addMember({
              params: req.params,
              payload: input
            })
          )
          set(AsyncResult.success(updated))
          return updated
        })
      )
  })
)

export const updateMember = Atom.family(({ req, id }: MemberMutationRequest) =>
  Atom.optimisticFn(project(req), {
    reducer: (current, input: UpdateMemberInput) =>
      AsyncResult.map(current, (value) => replaceMember(value, id, input)),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: UpdateMemberInput) {
          const updated = yield* Api.use((client) =>
            client.projects.updateMember({
              params: { ...req.params, userId: id },
              payload: input
            })
          )
          set(AsyncResult.success(updated))
          return updated
        })
      )
  })
)

export const removeMember = Atom.family(({ req, id }: MemberMutationRequest) =>
  Atom.optimisticFn(project(req), {
    reducer: (current, _input: void) =>
      AsyncResult.map(current, (value) => ({
        ...value,
        members: value.members.filter((member) => member.id !== id)
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (_input: void) {
          const updated = yield* Api.use((client) =>
            client.projects.removeMember({
              params: { ...req.params, userId: id }
            })
          )
          set(AsyncResult.success(updated))
          return updated
        })
      )
  })
)

export const cancelPendingMember = Atom.family(
  ({ req, id }: MemberMutationRequest) =>
    Atom.optimisticFn(project(req), {
      reducer: (current, _input: void) =>
        AsyncResult.map(current, (value) => ({
          ...value,
          pendingMembers: value.pendingMembers.filter(
            (member) => member.invitationId !== id
          )
        })),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (_input: void) {
            const updated = yield* Api.use((client) =>
              client.projects.cancelPendingMember({
                params: { ...req.params, invitationId: id }
              })
            )
            set(AsyncResult.success(updated))
            return updated
          })
        )
    })
)

export const createProject = Atom.family((req: ProjectsRequest) =>
  Api.runtime.fn(
    Effect.fn(function* (input: CreateProjectInput) {
      const created = yield* Api.use((client) =>
        client.projects.create({ params: req.params, payload: input })
      )
      yield* Reactivity.invalidate([
        Keys.projects(req.params.orgSlug),
        Keys.project(projectScope(req.params.orgSlug, created.slug)),
        Keys.ticketsIn(projectScope(req.params.orgSlug, created.slug))
      ])
      return created
    })
  )
)

export const projectBannerPreviewAtom = Atom.family((_key: string) =>
  Atom.make<{
    source: string | null
    crop: { x: number; y: number; zoom: number }
  } | null>(null)
)
