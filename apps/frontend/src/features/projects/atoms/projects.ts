import { Project as Roles } from "@pp/access/roles"
import {
  attachmentUrl,
  attachmentWidthForCss,
  canCallProject,
  withAttachmentParams,
  type AddMemberInput,
  type CreateProjectInput,
  type EstimationMode,
  type Project,
  ProjectActor,
  type ProjectDetail,
  type UpdateMemberInput,
  type UpdateProjectInput,
  type UpdateProjectSetupInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { coalescingMutation, viewMutation } from "@/api/viewMutation"
import { me } from "@/features/auth/atoms/auth"
import type { BannerPreview } from "@/features/projects/lib/bannerFrame"
import { evictBannerRenders } from "@/features/projects/lib/bannerRenderCache"
import { bannerSource } from "@/features/projects/lib/bannerSource"
import { preloadImage } from "@/features/projects/lib/imagePreload"

export type ProjectsRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export const projectsRequest = (orgSlug: string): ProjectsRequest => ({
  params: { orgSlug }
})

export type ProjectRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
}>

export const projectRequest = (
  orgSlug: string,
  slug: string
): ProjectRequest => ({
  params: { orgSlug, slug }
})

export const projectKey = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`

const ICON_PRELOAD_CSS_SIZE = 40

const preloadProjectImages = (orgSlug: string, project: Project) => {
  if (project.banner?.type === "attachment") {
    const source = bannerSource(
      orgSlug,
      project.banner,
      typeof window === "undefined" ? undefined : window.innerWidth
    )
    if (source) void preloadImage(source)
  }
  if (project.iconImage) {
    const id =
      project.iconImage.type === "sticker"
        ? project.iconImage.renderedAttachmentId
        : project.iconImage.sourceAttachmentId
    void preloadImage(
      withAttachmentParams(attachmentUrl(orgSlug, id), {
        width: attachmentWidthForCss(
          ICON_PRELOAD_CSS_SIZE * project.iconImage.crop.zoom,
          typeof window === "undefined" ? 1 : window.devicePixelRatio
        )
      })
    )
  }
}

const scopeOf = (req: ProjectRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const projectsQuery = (req: ProjectsRequest) =>
  Atom.map(
    query("projects", "list", {
      params: req.params,
      timeToLive: "1 minute",
      reactivityKeys: [Keys.projects(req.params.orgSlug)]
    }),
    (result) => {
      if (AsyncResult.isSuccess(result) && !result.waiting) {
        for (const project of result.value) {
          preloadProjectImages(req.params.orgSlug, project)
        }
      }
      return result
    }
  )

export const projectsFor = Atom.family((req: ProjectsRequest) =>
  Atom.optimistic(projectsQuery(req))
)

export const confirmedProject = (req: ProjectRequest) =>
  Atom.map(
    query("projects", "get", {
      params: req.params,
      timeToLive: "2 minutes",
      reactivityKeys: [
        Keys.project(scopeOf(req)),
        Keys.orgMembers(req.params.orgSlug)
      ]
    }),
    (result) => {
      if (AsyncResult.isSuccess(result) && !result.waiting) {
        preloadProjectImages(req.params.orgSlug, result.value)
      }
      return result
    }
  )

export const project = Atom.family((req: ProjectRequest) =>
  Atom.optimistic(confirmedProject(req))
)

export const projectActor = Atom.family((req: ProjectRequest) =>
  Atom.make((get) => {
    const detail = get(project(req))
    const viewer = get(me())
    return AsyncResult.isSuccess(detail) && AsyncResult.isSuccess(viewer)
      ? ProjectActor.make(detail.value.permissions, viewer.value.id)
      : ProjectActor.none
  })
)

export const projectEstimation = Atom.family((req: ProjectRequest) =>
  Atom.make((get): EstimationMode => {
    const detail = get(project(req))
    return AsyncResult.isSuccess(detail) ? detail.value.estimation : "off"
  })
)

export const updateProject = Atom.family((req: ProjectRequest) =>
  viewMutation(project(req), {
    name: "updateProject",
    predict: (value, input: UpdateProjectInput) => ({ ...value, ...input }),
    call: (client, input) =>
      ("banner" in input
        ? Effect.promise(() =>
            evictBannerRenders(projectKey(req.params.orgSlug, req.params.slug))
          )
        : Effect.void
      ).pipe(
        Effect.andThen(
          client.projects.update({ params: req.params, payload: input })
        )
      ),
    confirm: confirmProjectUpdate,
    publish: (_updated, input) =>
      input.estimation === undefined
        ? [Keys.projects(req.params.orgSlug)]
        : [
            Keys.projects(req.params.orgSlug),
            ...Keys.ticketsChanged(scopeOf(req))
          ]
  })
)

export const updateProjectSetup = Atom.family((req: ProjectRequest) =>
  coalescingMutation(project(req), {
    name: "updateProjectSetup",
    idleTTL: "10 minutes",
    predict: (value, input: UpdateProjectSetupInput) => ({
      ...value,
      setup: { ...value.setup, ...input }
    }),
    call: (client, payload) =>
      client.projects.updateSetup({ params: req.params, payload }),
    confirm: confirmSetupUpdate,
    publish: () => [Keys.projects(req.params.orgSlug)]
  })
)

export const deleteProject = Atom.family((req: ProjectRequest) =>
  Api.runtime.fn(
    Effect.fn("deleteProject")(function* (_input: void) {
      yield* Api.use((client) => client.projects.delete({ params: req.params }))
      yield* Effect.promise(() =>
        evictBannerRenders(projectKey(req.params.orgSlug, req.params.slug))
      )
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
  color: confirmField(current.color, input.color, confirmed.color),
  estimation: confirmField(
    current.estimation,
    input.estimation,
    confirmed.estimation
  )
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

const withCallerGrants = (
  current: ProjectDetail,
  confirmed: ProjectDetail
): ProjectDetail => ({
  ...current,
  permissions: confirmed.permissions,
  pendingMembers: canCallProject(
    Roles.projectStatement.role(confirmed.permissions)
  )("projects", "addMember")
    ? current.pendingMembers
    : confirmed.pendingMembers
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
    permissions: confirmed.permissions,
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
  viewMutation(project(req), {
    name: "addProjectMember",
    predict: (value, input: AddMemberInput) => ({
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
    }),
    call: (client, input) =>
      client.projects.addMember({ params: req.params, payload: input }),
    confirm: (current, updated, input) =>
      confirmAddedMember(current, updated, input.email),
    publish: () => [Keys.orgMembers(req.params.orgSlug)]
  })
)

export const updateMember = Atom.family(({ req, id }: MemberMutationRequest) =>
  viewMutation(project(req), {
    name: "updateProjectMember",
    predict: (value, input: UpdateMemberInput) =>
      replaceMember(value, id, input),
    call: (client, input) =>
      client.projects.updateMember({
        params: { ...req.params, userId: id },
        payload: input
      }),
    confirm: (current, updated, input) => {
      const member = updated.members.find((item) => item.id === id)
      const confirmed = withCallerGrants(current, updated)
      return member
        ? {
            ...confirmed,
            members: confirmed.members.map((item) =>
              item.id === id && item.role === input.role ? member : item
            )
          }
        : confirmed
    }
  })
)

const withoutMember = (value: ProjectDetail, id: string): ProjectDetail => ({
  ...value,
  members: value.members.filter((member) => member.id !== id)
})

export const removeMember = Atom.family(({ req, id }: MemberMutationRequest) =>
  viewMutation(project(req), {
    name: "removeProjectMember",
    predict: (value, _input: void) => withoutMember(value, id),
    call: (client) =>
      client.projects.removeMember({ params: { ...req.params, userId: id } }),
    confirm: (current, updated) =>
      withoutMember(withCallerGrants(current, updated), id)
  })
)

export const leaveProject = Atom.family((req: ProjectRequest) =>
  Api.runtime.fn(
    Effect.fn("leaveProject")(function* (_input: void) {
      yield* Api.use((client) => client.projects.leave({ params: req.params }))
      yield* Reactivity.invalidate([Keys.projects(req.params.orgSlug)])
    })
  )
)

export const forgetProject = Atom.family((req: ProjectRequest) =>
  Api.runtime.fn(
    Effect.fn("forgetProject")(function* (_input: void) {
      yield* Reactivity.invalidate([Keys.project(scopeOf(req))])
    })
  )
)

const withoutPendingMember = (
  value: ProjectDetail,
  id: string
): ProjectDetail => ({
  ...value,
  pendingMembers: value.pendingMembers.filter(
    (member) => member.invitationId !== id
  )
})

export const cancelPendingMember = Atom.family(
  ({ req, id }: MemberMutationRequest) =>
    viewMutation(project(req), {
      name: "cancelPendingMember",
      predict: (value, _input: void) => withoutPendingMember(value, id),
      call: (client) =>
        client.projects.cancelPendingMember({
          params: { ...req.params, invitationId: id }
        }),
      confirm: (current) => withoutPendingMember(current, id),
      publish: () => [Keys.orgMembers(req.params.orgSlug)]
    })
)

export const createProject = Atom.family((req: ProjectsRequest) =>
  Api.runtime.fn(
    Effect.fn("createProject")(function* (input: CreateProjectInput) {
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

export const projectBannerPreview = Atom.family((_req: ProjectRequest) =>
  Atom.make<BannerPreview | null>(null).pipe(Atom.setIdleTTL("1 minute"))
)
