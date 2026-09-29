import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import { Comments } from "@pp/server-core/comments/Comments"
import { Groups } from "@pp/server-core/groups/Groups"
import { Projects } from "@pp/server-core/projects/Projects"
import { ProjectStatuses } from "@pp/server-core/projects/ProjectStatuses"
import { Tags } from "@pp/server-core/tags/Tags"
import { Tickets } from "@pp/server-core/tickets/Tickets"
import {
  AddMemberInput,
  CreateCommentInput,
  CreateGroupInput,
  CreateProjectInput,
  CreateStatusInput,
  CreateTagInput,
  CreateTicketInput,
  ReorderStatusInput,
  UpdateProjectInput,
  type TicketDetail
} from "@pp/shared"
import * as Console from "effect/Console"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { generateKeyBetween } from "fractional-indexing"

import { bootstrapOrg } from "../src/bootstrap/org"
import { BackendRuntimeLive } from "../src/runtime"
import { BootstrapStore, bootstrapInput } from "./lib/bootstrapStore"
import {
  demoProjects,
  demoTeammate,
  type DemoPerson,
  type DemoProject,
  type DemoSprint,
  type DemoStatus,
  type DemoTicket
} from "./lib/demoProjects"

type People = Readonly<Record<DemoPerson, string>>

type ProjectScope = Readonly<{
  orgSlug: string
  slug: string
  people: People
}>

type SeededTicket = Readonly<{
  seed: DemoTicket
  detail: TicketDetail
}>

const decodeProject = Schema.decodeEffect(CreateProjectInput)
const decodeProjectLook = Schema.decodeEffect(UpdateProjectInput)
const decodeMember = Schema.decodeEffect(AddMemberInput)
const decodeStatus = Schema.decodeEffect(CreateStatusInput)
const decodeReorder = Schema.decodeEffect(ReorderStatusInput)
const decodeTag = Schema.decodeEffect(CreateTagInput)
const decodeTicket = Schema.decodeEffect(CreateTicketInput)
const decodeComment = Schema.decodeEffect(CreateCommentInput)
const decodeSprint = Schema.decodeEffect(CreateGroupInput)

const DEMO_USER_MENTION = /mention:user\/(owner|teammate)\b/g

const log = (message: string) => Console.log(`[seed-dev] ${message}`)

const ensureTeammate = Effect.fn("ensureTeammate")(function* (
  organizationId: string
) {
  const store = yield* BootstrapStore
  const existing = yield* store.findUserByEmail(demoTeammate.email)
  const user = existing ?? (yield* store.createUser(demoTeammate))
  const membership = yield* store.findMember({
    organizationId,
    userId: user.id
  })
  if (membership === null) {
    yield* store.createMember({
      organizationId,
      userId: user.id,
      role: "member"
    })
  }
  return user.id
})

const addStatus = Effect.fn("addStatus")(function* (
  scope: ProjectScope,
  demo: DemoStatus
) {
  const statuses = yield* ProjectStatuses
  const existing = yield* statuses.list(
    scope.orgSlug,
    scope.people.owner,
    scope.slug
  )
  const afterIndex = existing.findIndex((status) => status.slug === demo.after)
  const orderKey = generateKeyBetween(
    existing[afterIndex]?.orderKey ?? null,
    existing[afterIndex + 1]?.orderKey ?? null
  )
  const created = yield* statuses.create(
    scope.orgSlug,
    scope.people.owner,
    scope.slug,
    yield* decodeStatus(demo.status)
  )
  yield* statuses.reorder(
    scope.orgSlug,
    scope.people.owner,
    scope.slug,
    created.slug,
    yield* decodeReorder({ orderKey })
  )
})

const addTicket = Effect.fn("addTicket")(function* (
  scope: ProjectScope,
  demo: DemoTicket
) {
  const tickets = yield* Tickets
  const comments = yield* Comments
  const detail = yield* tickets.create(
    scope.orgSlug,
    scope.people.owner,
    scope.slug,
    yield* decodeTicket({
      ...demo.ticket,
      body: demo.ticket.body?.replace(
        DEMO_USER_MENTION,
        (mention, person: string) =>
          person === "owner" || person === "teammate"
            ? `mention:user/${scope.people[person]}`
            : mention
      ),
      assignees: (demo.assignees ?? []).map((person) => scope.people[person])
    })
  )
  yield* Effect.forEach(
    demo.comments ?? [],
    (comment) =>
      Effect.flatMap(decodeComment({ body: comment.body }), (input) =>
        comments.create(
          scope.orgSlug,
          scope.people[comment.author],
          scope.slug,
          detail.id,
          input
        )
      ),
    { discard: true }
  )
  return { seed: demo, detail }
})

const addSprint = Effect.fn("addSprint")(function* (
  scope: ProjectScope,
  demo: DemoSprint,
  seeded: ReadonlyArray<SeededTicket>
) {
  const groups = yield* Groups
  const today = DateTime.startOf(yield* DateTime.now, "day")
  const startsAt = DateTime.add(today, { days: demo.startsInDays })
  const endsAt = DateTime.add(startsAt, { days: demo.lengthInDays })
  const members = seeded.filter((ticket) => ticket.seed.sprint === demo.slot)
  yield* groups.create(
    scope.orgSlug,
    scope.people.owner,
    scope.slug,
    yield* decodeSprint({
      name: demo.name,
      kind: "sprint",
      startsAt: DateTime.formatIso(startsAt),
      endsAt: DateTime.formatIso(endsAt),
      tickets: members.map((ticket) => ticket.detail.id)
    })
  )
  return `${demo.name} (${demo.slot}, ${members.length} tickets)`
})

const statusSummary = (seeded: ReadonlyArray<SeededTicket>) => {
  const counts = new Map<string, number>()
  for (const { detail } of seeded) {
    counts.set(detail.status, (counts.get(detail.status) ?? 0) + 1)
  }
  return [...counts].map(([status, count]) => `${status} ${count}`).join(", ")
}

const seedProject = Effect.fn("seedProject")(function* (
  orgSlug: string,
  people: People,
  demo: DemoProject
) {
  const projects = yield* Projects
  const tags = yield* Tags
  const existing = (yield* projects.list(orgSlug, people.owner)).find(
    (project) => project.key === demo.project.key
  )
  if (existing !== undefined) {
    yield* log(`${orgSlug}/${existing.slug} exists, skipped`)
    return
  }

  const project = yield* projects.create(
    orgSlug,
    people.owner,
    yield* decodeProject(demo.project)
  )
  const scope: ProjectScope = { orgSlug, slug: project.slug, people }
  yield* projects.update(
    orgSlug,
    people.owner,
    project.slug,
    yield* decodeProjectLook(demo.look)
  )
  yield* projects.addMember(
    orgSlug,
    people.owner,
    project.slug,
    yield* decodeMember({ email: demoTeammate.email, role: "member" })
  )
  yield* Effect.forEach(demo.statuses, (status) => addStatus(scope, status), {
    discard: true
  })
  yield* Effect.forEach(
    demo.tags,
    (tag) =>
      Effect.flatMap(decodeTag(tag), (input) =>
        tags.create(orgSlug, people.owner, project.slug, input)
      ),
    { discard: true }
  )
  const seeded = yield* Effect.forEach(demo.tickets, (ticket) =>
    addTicket(scope, ticket)
  )
  const sprints = yield* Effect.forEach(demo.sprints, (sprint) =>
    addSprint(scope, sprint, seeded)
  )

  yield* log(
    `${orgSlug}/${project.slug} created: ${seeded.length} tickets (${statusSummary(seeded)})`
  )
  if (sprints.length > 0) {
    yield* log(`${orgSlug}/${project.slug} sprints: ${sprints.join(", ")}`)
  }
})

const main = Effect.gen(function* () {
  const input = yield* bootstrapInput
  const store = yield* BootstrapStore
  const { org, owner } = yield* bootstrapOrg(store, input)
  const teammate = yield* ensureTeammate(org.id)
  yield* log(
    `org ${org.slug}, owner ${owner.email}, teammate ${demoTeammate.email}`
  )
  yield* Effect.forEach(
    demoProjects,
    (demo) => seedProject(org.slug, { owner: owner.id, teammate }, demo),
    { discard: true }
  )
})

BunRuntime.runMain(
  main.pipe(
    Effect.provide(Layer.merge(BackendRuntimeLive, BootstrapStore.layer))
  )
)
