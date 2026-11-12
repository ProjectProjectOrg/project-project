import { Db } from "@pp/db"
import { organization, projectIndex, ticketIndex } from "@pp/db/schema"
import { TicketRank } from "@pp/shared"
import { eq } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import * as GroupDocs from "../groups/GroupDocs"
import * as Markdown from "../markdown/Markdown"
import { initialRankOrder } from "./rankBackfill"
import { ranksBetween } from "./ranks"
import * as TicketIndexMaintenance from "./TicketIndexMaintenance"
import type { TicketProject } from "./ticketProject"

const rankOf = (data: Record<string, unknown>): string | null =>
  typeof data.rank === "string" && data.rank !== "" ? data.rank : null

const timeOf = (value: unknown): number =>
  value instanceof Date
    ? value.getTime()
    : typeof value === "string"
      ? Date.parse(value)
      : 0

const backfillProject = (project: TicketProject) =>
  Effect.gen(function* () {
    const markdown = yield* Markdown.Markdown
    const groupDocs = yield* GroupDocs.GroupDocs
    const { orgSlug, slug } = project
    const ids = yield* markdown.listTicketIds(orgSlug, slug)
    const files = yield* Effect.forEach(
      ids,
      (id) =>
        markdown.readTicketParts(orgSlug, slug, id).pipe(
          Effect.map((parts) => [{ id, parts }]),
          Effect.catchTag("NotFound", () => Effect.succeed([]))
        ),
      { concurrency: 8 }
    ).pipe(Effect.map((reads) => reads.flat()))
    const unranked = files.filter(({ parts }) => rankOf(parts.data) === null)
    if (unranked.length === 0) return
    const groupIds = yield* groupDocs.listIds(orgSlug, slug)
    const groups = yield* Effect.forEach(
      groupIds,
      (id) =>
        groupDocs.read(orgSlug, slug, id).pipe(
          Effect.map((group) => [group]),
          Effect.catchTag("NotFound", () => Effect.succeed([]))
        ),
      { concurrency: 8 }
    ).pipe(Effect.map((reads) => reads.flat()))
    const top = files
      .flatMap(({ parts }) => rankOf(parts.data) ?? [])
      .toSorted()[0]
    const order = initialRankOrder(
      groups,
      unranked.map(({ id, parts }) => ({
        id,
        createdAt: timeOf(parts.data.createdAt)
      })),
      yield* DateTime.nowAsDate
    )
    const ranks = ranksBetween(
      { lower: null, upper: top === undefined ? null : TicketRank.make(top) },
      order.length
    )
    const byId = new Map(unranked.map((file) => [file.id, file.parts]))
    yield* Effect.forEach(
      order,
      (id, index) => {
        const parts = byId.get(id)
        return parts === undefined
          ? Effect.void
          : markdown.writeTicketWithRegion(
              orgSlug,
              slug,
              id,
              { ...parts.data, rank: ranks[index] },
              parts.description,
              parts.region
            )
      },
      { concurrency: 8, discard: true }
    )
    yield* Effect.logInfo("backfilled ticket ranks", {
      orgSlug,
      slug,
      count: order.length
    })
  })

export const backfillTicketRanks = Effect.gen(function* () {
  const db = yield* Db
  const maintenance = yield* TicketIndexMaintenance.TicketIndexMaintenance
  const projects = yield* db
    .selectDistinct({
      orgSlug: organization.slug,
      organizationId: projectIndex.organizationId,
      projectId: projectIndex.id,
      slug: projectIndex.slug
    })
    .from(ticketIndex)
    .innerJoin(projectIndex, eq(projectIndex.id, ticketIndex.projectId))
    .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
    .where(eq(ticketIndex.rank, ""))
    .pipe(Effect.orDie)
  yield* Effect.forEach(
    projects,
    (project) =>
      backfillProject(project).pipe(
        Effect.andThen(maintenance.rebuildProject(project)),
        Effect.catchCause((cause) =>
          Effect.logError("ticket rank backfill failed", cause).pipe(
            Effect.annotateLogs({
              orgSlug: project.orgSlug,
              slug: project.slug
            })
          )
        )
      ),
    { discard: true }
  )
})

export const TicketRankBackfillLive = Layer.effectDiscard(backfillTicketRanks)
