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

export type ProjectsRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export const projectsRequest = (orgSlug: string): ProjectsRequest => ({
  params: { orgSlug }
})

export type ProjectRequest = Readonly<{
  params: Readonly<{ orgSlug: string; readonly slug: string }>
}>

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
        Effect.fn(function* (input: UpdateProjectInput, get) {
          const updated = yield* Api.use((client) =>
            client.projects.update({ params: req.params, payload: input })
          )
          set(
            AsyncResult.map(get(project(req)), (current) =>
              confirmProjectUpdate(current, updated, input)
            )
          )
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
        Effect.fn(function* (input: UpdateProjectSetupInput, get) {
          const updated = yield* Api.use((client) =>
            client.projects.updateSetup({
              params: req.params,
              payload: input
            })
          )
          set(
            AsyncResult.map(get(project(req)), (current) =>
              confirmSetupUpdate(current, updated, input)
            )
          )
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

type MemberMutationRequest = Readonly<{
  req: ProjectRequest
  id: string
}>

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

const confirmField = <Value>(
  current: Value,
  optimistic: Value | undefined,
  confirmed: Value
): Value =>
  optimistic !== undefined && current === optimistic ? confirmed : current

const confirmProjectUpdate = (
  current: ProjectDetail,
  confirmed: ProjectDetail,
  input: UpdateProjectInput
): ProjectDetail => ({
  ...current,
  banner: confirmField(current.banner, input.banner, confirmed.banner),
  iconImage: confirmField(
    current.iconImage,
    input.iconImage,
    confirmed.iconImage
  ),
  name: confirmField(current.name, input.name, confirmed.name),
  body: confirmField(current.body, input.body, confirmed.body),
  icon: confirmField(current.icon, input.icon, confirmed.icon),
  color: confirmField(current.color, input.color, confirmed.color)
})

const confirmSetupUpdate = (
  current: ProjectDetail,
  confirmed: ProjectDetail,
  input: UpdateProjectSetupInput
): ProjectDetail => ({
  ...current,
  setup: {
    ...current.setup,
    workflowReviewedAt: confirmField(
      current.setup.workflowReviewedAt,
      input.workflowReviewedAt,
      confirmed.setup.workflowReviewedAt
    ),
    invitePeopleDismissedAt: confirmField(
      current.setup.invitePeopleDismissedAt,
      input.invitePeopleDismissedAt,
      confirmed.setup.invitePeopleDismissedAt
    ),
    connectGithubDismissedAt: confirmField(
      current.setup.connectGithubDismissedAt,
      input.connectGithubDismissedAt,
      confirmed.setup.connectGithubDismissedAt
    )
  }
})

const sameEmail = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0

const confirmAddedMember = (
  current: ProjectDetail,
  confirmed: ProjectDetail,
  email: string
): ProjectDetail => {
  const member = confirmed.members.find((item) => sameEmail(item.email, email))
  const pendingMember = confirmed.pendingMembers.find((item) =>
    sameEmail(item.email, email)
  )
  return {
    ...current,
    members: member
      ? [
          ...current.members.filter(
            (item) => item.id !== member.id && !sameEmail(item.email, email)
          ),
          member
        ]
      : current.members,
    pendingMembers: [
      ...current.pendingMembers.filter((item) => !sameEmail(item.email, email)),
      ...(pendingMember ? [pendingMember] : [])
    ]
  }
}

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
        Effect.fn(function* (input: AddMemberInput, get) {
          const updated = yield* Api.use((client) =>
            client.projects.addMember({
              params: req.params,
              payload: input
            })
          )
          set(
            AsyncResult.map(get(project(req)), (current) =>
              confirmAddedMember(current, updated, input.email)
            )
          )
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
        Effect.fn(function* (input: UpdateMemberInput, get) {
          const updated = yield* Api.use((client) =>
            client.projects.updateMember({
              params: { ...req.params, userId: id },
              payload: input
            })
          )
          const member = updated.members.find((item) => item.id === id)
          set(
            member
              ? AsyncResult.map(get(project(req)), (current) => ({
                  ...current,
                  members: current.members.map((item) =>
                    item.id === id && item.role === input.role ? member : item
                  )
                }))
              : get(project(req))
          )
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
        Effect.fn(function* (_input: void, get) {
          const updated = yield* Api.use((client) =>
            client.projects.removeMember({
              params: { ...req.params, userId: id }
            })
          )
          set(
            AsyncResult.map(get(project(req)), (current) => ({
              ...current,
              members: current.members.filter((item) => item.id !== id)
            }))
          )
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
          Effect.fn(function* (_input: void, get) {
            const updated = yield* Api.use((client) =>
              client.projects.cancelPendingMember({
                params: { ...req.params, invitationId: id }
              })
            )
            set(
              AsyncResult.map(get(project(req)), (current) => ({
                ...current,
                pendingMembers: current.pendingMembers.filter(
                  (item) => item.invitationId !== id
                )
              }))
            )
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
