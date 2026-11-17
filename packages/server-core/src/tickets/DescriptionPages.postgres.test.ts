// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import {
  type DescriptionPage,
  ProjectScope,
  TicketId,
  TicketRank,
  TicketStatus
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import pg from "pg"
import { describe, expect } from "vitest"

import { projectScope } from "../access/testing"
import * as Attachments from "../attachments/Attachments"
import * as GroupDocs from "../groups/GroupDocs"
import * as Library from "../library/Library"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import * as SyncLog from "../sync/SyncLog"
import * as DescriptionPages from "./DescriptionPages"
import * as TicketIndexServices from "./indexLayer"
import * as TicketDescriber from "./TicketDescriber"
import * as TicketDocs from "./TicketDocs"
import * as TicketIndex from "./TicketIndex"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.startsWith("/projectproject_effect_v4_")
  ) {
    throw new Error("Test requires an isolated local database")
  }
  process.env.DATABASE_URL = databaseUrl
}

const ticketId = Schema.decodeUnknownSync(TicketId)
const ticketStatus = Schema.decodeUnknownSync(TicketStatus)
const at = DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))

const document = (
  id: string,
  status: string,
  archived = false
): TicketDocs.TicketDocument => ({
  id: ticketId(id),
  title: id,
  status: ticketStatus(status),
  type: null,
  priority: "med",
  rank: TicketRank.make("a0"),
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  assignees: [],
  archivedAt: archived ? at : null,
  createdBy: "test-user",
  createdAt: at,
  updatedBy: "test-user",
  updatedAt: at,
  body: `# ${id}\n`,
  commentsRegion: ""
})

const tickets = [
  document("T-1", "done"),
  document("T-2", "todo"),
  document("T-3", "todo", true),
  document("T-4", "in_progress"),
  document("T-5", "done")
]

const unexpected = (method: string): Effect.Effect<never> =>
  Effect.die(new Error(`unexpected ${method} call`))

const Docs = Layer.succeed(TicketDocs.TicketDocs, {
  listIds: () => unexpected("TicketDocs.listIds"),
  read: (_org, _slug, id) => {
    const found = tickets.find((ticket) => ticket.id === id)
    return found === undefined ? unexpected("read") : Effect.succeed(found)
  },
  create: () => unexpected("TicketDocs.create"),
  write: () => unexpected("TicketDocs.write"),
  update: () => unexpected("TicketDocs.update"),
  remove: () => unexpected("TicketDocs.remove"),
  readRaw: () => unexpected("TicketDocs.readRaw")
} satisfies TicketDocs.TicketDocs["Service"])

const DatabaseLive = DbLive.pipe(Layer.provideMerge(PgLive))

const TestLayer = DescriptionPages.layer.pipe(
  Layer.provideMerge(TicketIndexServices.layer),
  Layer.provideMerge(SyncLog.layer),
  Layer.provide(TicketDescriber.layer),
  Layer.provide(Docs),
  Layer.provide(
    Layer.mergeAll(
      Layer.mock(Library.Library, {
        resolveSynced: (_org, _slug, body) => Effect.succeed(body)
      }),
      Layer.mock(Attachments.Attachments, {
        missingIds: () => Effect.succeed([])
      }),
      Layer.mock(GroupDocs.GroupDocs, {}),
      FinishedStatuses.baseline
    )
  ),
  Layer.provideMerge(DatabaseLive)
)

const withClient = <A>(use: (client: pg.Client) => Promise<A>) =>
  Effect.tryPromise(async () => {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      return await use(client)
    } finally {
      await client.end()
    }
  }).pipe(Effect.orDie)

const seedProject = Effect.gen(function* () {
  const slug = `descriptions-${randomUUID()}`
  yield* withClient(async (client) => {
    await client.query(
      "insert into organization (id, name, slug, created_at) values ($1, $1, $1, now())",
      [slug]
    )
    await client.query(
      "insert into project_index (id, slug, organization_id, key, name, icon, color, created_by, created_at) values ($1, $2, $2, 'T', 'Test', 'folder', 'blue', 'test-user', now())",
      [randomUUID(), slug]
    )
  })
  yield* Effect.addFinalizer(() =>
    withClient((client) =>
      client.query("delete from organization where id = $1", [slug])
    )
  )
  return slug
})

describe.skipIf(!databaseUrl)("DescriptionPages", () => {
  it.effect(
    "pages unfinished tickets first, then finished, then archived",
    () =>
      Effect.gen(function* () {
        const slug = yield* seedProject
        const index = yield* TicketIndex.TicketIndex
        const project = yield* index.projectFor(slug, slug)
        for (const ticket of tickets) yield* index.upsertTicket(project, ticket)
        const pages = yield* DescriptionPages.DescriptionPages
        const scope = projectScope("member", "developer", {
          organizationId: project.organizationId,
          orgSlug: slug,
          slug,
          projectId: project.projectId
        })
        const order: Array<string> = []
        let token: string | undefined = undefined
        do {
          const page: DescriptionPage = yield* pages
            .page(token)
            .pipe(
              Effect.provideService(ProjectScope, scope),
              Effect.provideService(DescriptionPages.DescriptionPageLimit, 2)
            )
          order.push(...page.descriptions.map((description) => description.id))
          token = page.next ?? undefined
        } while (token !== undefined)
        expect(order).toEqual(["T-2", "T-4", "T-1", "T-5", "T-3"])
      }).pipe(Effect.scoped, Effect.provide(TestLayer))
  )
})
