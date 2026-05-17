import { it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"
import { NotFound, ProjectKey, TicketId } from "@projectproject/shared"
import { TicketsLive } from "../Layers/Tickets"
import { Db } from "./Db"
import { GitHub, type GitHubShape } from "./GitHub"
import { Groups, type GroupsShape } from "./Groups"
import { TicketIdTaken } from "./Markdown"
import { Projects, type ProjectsShape } from "./Projects"
import {
  MalformedTicketDocument,
  TicketDocs,
  type TicketDocsShape,
  type TicketDocument
} from "./TicketDocs"
import { Tickets } from "./Tickets"

const isoDate = (s: string) => DateTime.toDate(DateTime.unsafeMake(s))
const ticketId = Schema.decodeUnknownSync(TicketId)
const projectKey = Schema.decodeUnknownSync(ProjectKey)

function unexpected(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected ${method} call`))
}

function makeTicketDocument(
  id: string,
  overrides: Partial<TicketDocument> = {}
): TicketDocument {
  const now = isoDate("2026-04-01T00:00:00.000Z")
  return {
    id: ticketId(id),
    title: id,
    status: "todo",
    type: "other",
    priority: "med",
    tags: [],
    branch: null,
    pr: null,
    lastTransitionedPr: null,
    assignees: [],
    createdBy: "user-1",
    createdAt: now,
    updatedAt: now,
    body: "",
    ...overrides
  }
}

function makeFakeTicketDocs(initialIds: ReadonlyArray<string>) {
  const documents = new Map<string, TicketDocument>(
    initialIds.map((id) => [id, makeTicketDocument(id)])
  )

  const service = {
    listIds: () =>
      Effect.succeed([...documents.keys()].map((id) => ticketId(id))),
    read: (_org: string, _slug: string, id: string) => {
      const document = documents.get(id)
      return document ? Effect.succeed(document) : Effect.fail(new NotFound())
    },
    create: (_org: string, _slug: string, document: TicketDocument) => {
      if (documents.has(document.id)) return Effect.fail(new TicketIdTaken())
      documents.set(document.id, document)
      return Effect.void
    },
    write: (
      _org: string,
      _slug: string,
      id: string,
      document: TicketDocument
    ) => {
      documents.set(id, document)
      return Effect.void
    },
    remove: (_org: string, _slug: string, id: string) => {
      documents.delete(id)
      return Effect.void
    },
    readRaw: () => unexpected("TicketDocs.readRaw")
  } satisfies TicketDocsShape

  return {
    documents,
    layer: Layer.succeed(TicketDocs, service)
  }
}

function makeFakeProjects(key: string) {
  const service = {
    list: () => unexpected("Projects.list"),
    listPaged: () => unexpected("Projects.listPaged"),
    listMembersPaged: () => unexpected("Projects.listMembersPaged"),
    create: () => unexpected("Projects.create"),
    get: () => unexpected("Projects.get"),
    getKey: () => Effect.succeed(projectKey(key)),
    update: () => unexpected("Projects.update"),
    remove: () => unexpected("Projects.remove"),
    requireMember: () => Effect.succeed({ role: "member" as const }),
    requireRole: () => unexpected("Projects.requireRole"),
    addMember: () => unexpected("Projects.addMember"),
    updateMember: () => unexpected("Projects.updateMember"),
    removeMember: () => unexpected("Projects.removeMember"),
    connectGithub: () => unexpected("Projects.connectGithub"),
    disconnectGithub: () => unexpected("Projects.disconnectGithub")
  } satisfies ProjectsShape

  return Layer.succeed(Projects, service)
}

const FakeDb = Layer.succeed(
  Db,
  new Proxy(
    {},
    {
      get: (_target, prop) =>
        (..._args: ReadonlyArray<unknown>) =>
          unexpected(`Db.${String(prop)}`)
    }
  ) as never
)

const FakeGroups = Layer.succeed(Groups, {
  list: () => unexpected("Groups.list"),
  listPaged: () => unexpected("Groups.listPaged"),
  listSprintsPaged: () => unexpected("Groups.listSprintsPaged"),
  get: () => unexpected("Groups.get"),
  create: () => unexpected("Groups.create"),
  update: () => unexpected("Groups.update"),
  updateTickets: () => unexpected("Groups.updateTickets"),
  addTickets: () => unexpected("Groups.addTickets"),
  updateTicketOrder: () => unexpected("Groups.updateTicketOrder"),
  complete: () => unexpected("Groups.complete"),
  remove: () => unexpected("Groups.remove"),
  removeTicketFromAllGroups: () => Effect.void
} satisfies GroupsShape)

const FakeGitHub = Layer.succeed(GitHub, {
  listUserRepos: () => unexpected("GitHub.listUserRepos"),
  verifyAccess: () => unexpected("GitHub.verifyAccess"),
  createBranch: () => unexpected("GitHub.createBranch"),
  openPullRequest: () => unexpected("GitHub.openPullRequest"),
  fetchProjectStates: () => unexpected("GitHub.fetchProjectStates"),
  listBranches: () => unexpected("GitHub.listBranches"),
  branchExists: () => unexpected("GitHub.branchExists")
} satisfies GitHubShape)

function makeTicketsLayer(
  key: string,
  ticketDocsLayer: Layer.Layer<TicketDocs>
) {
  return TicketsLive.pipe(
    Layer.provide(ticketDocsLayer),
    Layer.provide(makeFakeProjects(key)),
    Layer.provide(FakeGroups),
    Layer.provide(FakeGitHub),
    Layer.provide(FakeDb)
  )
}

function makeTicketsFixture(key: string, initialIds: ReadonlyArray<string>) {
  const docs = makeFakeTicketDocs(initialIds)
  return {
    documents: docs.documents,
    layer: makeTicketsLayer(key, docs.layer)
  }
}

it.effect("create allocates the next id from the project key", () => {
  const { documents, layer } = makeTicketsFixture("FOO", ["FOO-1", "FOO-3"])
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.create("org", "user-1", "p", {
      title: "Add project keys"
    })

    expect(created.id).toBe("FOO-4")
    expect(documents.has("FOO-4")).toBe(true)
  }).pipe(Effect.provide(layer))
})

it.effect("create keeps legacy T project ids readable and sequential", () => {
  const { documents, layer } = makeTicketsFixture("T", ["T-1", "T-35"])
  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.create("org", "user-1", "p", {
      title: "Keep legacy ids"
    })

    expect(created.id).toBe("T-36")
    expect(documents.has("T-36")).toBe(true)
  }).pipe(Effect.provide(layer))
})

it.effect("list skips malformed ticket documents", () => {
  const docs = Layer.succeed(TicketDocs, {
    listIds: () => Effect.succeed([ticketId("T-1"), ticketId("T-2")]),
    read: (_org, _slug, id) =>
      id === "T-1"
        ? Effect.succeed(makeTicketDocument("T-1"))
        : Effect.fail(
            new MalformedTicketDocument({
              orgSlug: "org",
              slug: "project",
              ticketId: id,
              path: `orgs/org/projects/project/tickets/${id}.md`,
              reason: "invalid_frontmatter",
              cause: undefined
            })
          ),
    create: () => unexpected("TicketDocs.create"),
    write: () => unexpected("TicketDocs.write"),
    remove: () => unexpected("TicketDocs.remove"),
    readRaw: () => unexpected("TicketDocs.readRaw")
  } satisfies TicketDocsShape)

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.list("org", "user-1", "project")

    expect(result.map((t) => t.id)).toEqual(["T-1"])
  }).pipe(Effect.provide(makeTicketsLayer("T", docs)))
})
