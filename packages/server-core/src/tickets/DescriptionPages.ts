import { Db } from "@pp/db"
import { groupIndex, ticketIndex } from "@pp/db/schema"
import {
  type DescriptionPage,
  NO_DESCRIPTION_REVISION,
  ProjectScope
} from "@pp/shared"
import { and, asc, eq, gt, inArray, isNotNull, isNull, not } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import * as GroupDocs from "../groups/GroupDocs"
import type * as Markdown from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import { encodeSyncCursor } from "../sync/ProjectFacts"
import * as SyncLog from "../sync/SyncLog"
import { makeDescriber } from "./TicketDescriptions"
import type * as TicketDocs from "./TicketDocs"

export const DescriptionPageLimit = Context.Reference<number>(
  "@pp/server-core/tickets/DescriptionPages/DescriptionPageLimit",
  { defaultValue: () => 250 }
)

const PHASES = ["unfinished", "finished", "archived"] as const

const PageToken = Schema.Struct({
  phase: Schema.Literals(PHASES),
  after: Schema.String
})
type PageToken = typeof PageToken.Type

const encodeToken = Schema.encodeSync(Schema.fromJsonString(PageToken))
const decodeToken = Schema.decodeUnknownOption(Schema.fromJsonString(PageToken))

const FIRST: PageToken = { phase: "unfinished", after: "" }

export class DescriptionPages extends Context.Service<
  DescriptionPages,
  Readonly<{
    page: (
      token: string | undefined
    ) => Effect.Effect<
      DescriptionPage,
      Markdown.MarkdownError | TicketDocs.MalformedTicketDocument,
      ProjectScope
    >
  }>
>()("@pp/server-core/tickets/DescriptionPages") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const groupDocs = yield* GroupDocs.GroupDocs
  const finishedStatuses = yield* FinishedStatuses
  const syncLog = yield* SyncLog.SyncLog
  const describe = yield* makeDescriber

  const groups = Effect.fn("DescriptionPages.groups")(function* (
    scope: ProjectScope["Service"]
  ) {
    const revision = encodeSyncCursor(yield* syncLog.head(scope.projectId))
    const ids = yield* db
      .select({ id: groupIndex.groupId })
      .from(groupIndex)
      .where(eq(groupIndex.projectId, scope.projectId))
      .pipe(Effect.orDie)
    const found = yield* Effect.forEach(
      ids,
      ({ id }) =>
        groupDocs.read(scope.orgSlug, scope.slug, id).pipe(
          Effect.map((document) => ({
            id: document.id,
            body: document.body,
            revision
          })),
          Effect.catchTag("NotFound", () => Effect.succeed(null))
        ),
      { concurrency: 8 }
    )
    return found.filter((group) => group !== null)
  })

  const page = Effect.fn("DescriptionPages.page")(function* (
    encoded: string | undefined
  ) {
    const scope = yield* ProjectScope
    const limit = yield* DescriptionPageLimit
    const token =
      encoded === undefined
        ? FIRST
        : Option.getOrElse(decodeToken(encoded), () => FIRST)
    const finished = [
      ...(yield* finishedStatuses.forProject(scope.orgSlug, scope.slug))
    ]
    const inPhase = {
      unfinished: and(
        isNull(ticketIndex.archivedAt),
        not(inArray(ticketIndex.status, finished))
      ),
      finished: and(
        isNull(ticketIndex.archivedAt),
        inArray(ticketIndex.status, finished)
      ),
      archived: isNotNull(ticketIndex.archivedAt)
    }[token.phase]
    const groupDescriptions = encoded === undefined ? yield* groups(scope) : []
    const rows = yield* db
      .select({
        id: ticketIndex.ticketId,
        revision: ticketIndex.descriptionRevision
      })
      .from(ticketIndex)
      .where(
        and(
          eq(ticketIndex.projectId, scope.projectId),
          gt(ticketIndex.ticketId, token.after),
          inPhase
        )
      )
      .orderBy(asc(ticketIndex.ticketId))
      .limit(limit)
      .pipe(Effect.orDie)
    const found = yield* Effect.forEach(
      rows,
      (row) =>
        describe(scope, row.id, row.revision ?? NO_DESCRIPTION_REVISION).pipe(
          Effect.catchTag("NotFound", () => Effect.succeed(null))
        ),
      { concurrency: 8 }
    )
    const last = rows.at(-1)
    const following = PHASES[PHASES.indexOf(token.phase) + 1]
    const next: PageToken | null =
      rows.length === limit && last !== undefined
        ? { phase: token.phase, after: last.id }
        : following === undefined
          ? null
          : { phase: following, after: "" }
    return {
      descriptions: found.filter((description) => description !== null),
      groups: groupDescriptions,
      next: next === null ? null : encodeToken(next)
    } satisfies DescriptionPage
  })

  return DescriptionPages.of({ page })
})

export const layer = Layer.effect(DescriptionPages, make)
