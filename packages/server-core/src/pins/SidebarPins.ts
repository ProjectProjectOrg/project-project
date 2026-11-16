import { Db } from "@pp/db"
import { sidebarPin, ticketIndex } from "@pp/db/schema"
import {
  NotFound,
  OrgScope,
  type PinKind,
  type PinnedSprint,
  type PinOrderKey,
  PinTarget,
  ProjectScope,
  SidebarPin
} from "@pp/shared"
import { and, eq, inArray, sql } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { generateKeyBetween } from "fractional-indexing"

import * as Access from "../access/Access"
import * as GroupDocs from "../groups/GroupDocs"
import type * as Markdown from "../markdown/Markdown"

export class SidebarPins extends Context.Service<
  SidebarPins,
  Readonly<{
    list: () => Effect.Effect<ReadonlyArray<SidebarPin>, never, OrgScope>
    pin: (
      target: PinTarget
    ) => Effect.Effect<
      SidebarPin,
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    reorder: (
      kind: PinKind,
      ref: string,
      orderKey: PinOrderKey
    ) => Effect.Effect<
      SidebarPin,
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    unpin: (
      kind: PinKind,
      ref: string
    ) => Effect.Effect<void, never, ProjectScope>
  }>
>()("@pp/server-core/pins/SidebarPins") {}

type PinScope = Readonly<{
  userId: string
  projectId: string
  orgSlug: string
  slug: string
}>

type PinnedTicket = Readonly<{
  title: string
  status: string
  archivedAt: Date | null
}>

type Found = Readonly<{ ticket: PinnedTicket } | { sprint: PinnedSprint }>

type PinRow = Readonly<{
  kind: PinKind
  ref: string
  orderKey: string
  title: string | null
  status: string | null
  archivedAt: Date | null
}>

const orNotFound = <A>(option: Option.Option<A>) =>
  Effect.fromOption(option).pipe(Effect.mapError(() => new NotFound()))

const decodePin = Schema.decodeUnknownOption(Schema.toType(SidebarPin))
const decodeTarget = Schema.decodeUnknownOption(PinTarget)

const compareBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const comparePins = (a: SidebarPin, b: SidebarPin) =>
  compareBytes(a.projectSlug, b.projectSlug) ||
  compareBytes(a.orderKey, b.orderKey) ||
  compareBytes(a.kind, b.kind) ||
  compareBytes(a.ref, b.ref)

const make = Effect.gen(function* () {
  const db = yield* Db
  const access = yield* Access.Access
  const groupDocs = yield* GroupDocs.GroupDocs

  const targetOf = (kind: PinKind, ref: string) =>
    orNotFound(decodeTarget({ kind, ref }))

  const pinOf = (
    scope: PinScope,
    target: PinTarget,
    orderKey: string,
    found: Found
  ) =>
    orNotFound(
      decodePin({
        projectSlug: scope.slug,
        kind: target.kind,
        ref: target.ref,
        orderKey,
        ...("ticket" in found
          ? { ticket: { id: target.ref, ...found.ticket } }
          : found)
      })
    )

  const sprintOf = (scope: PinScope, id: string) =>
    groupDocs.read(scope.orgSlug, scope.slug, id).pipe(
      Effect.flatMap((group) =>
        group.kind === "sprint"
          ? Effect.succeed({
              sprint: {
                id: group.id,
                name: group.name,
                startsAt: group.startsAt,
                endsAt: group.endsAt,
                completedAt: group.completedAt
              }
            })
          : Effect.fail(new NotFound())
      )
    )

  const ticketOf = (scope: PinScope, id: string) =>
    db
      .select({
        title: ticketIndex.title,
        status: ticketIndex.status,
        archivedAt: ticketIndex.archivedAt
      })
      .from(ticketIndex)
      .where(
        and(
          eq(ticketIndex.projectId, scope.projectId),
          eq(ticketIndex.ticketId, id)
        )
      )
      .limit(1)
      .pipe(
        Effect.orDie,
        Effect.flatMap(([row]) =>
          row === undefined
            ? Effect.fail(new NotFound())
            : Effect.succeed({ ticket: row })
        )
      )

  const resolve = (scope: PinScope, target: PinTarget) =>
    target.kind === "ticket"
      ? ticketOf(scope, target.ref)
      : sprintOf(scope, target.ref)

  const whereTarget = (scope: PinScope, target: PinTarget) =>
    and(
      eq(sidebarPin.userId, scope.userId),
      eq(sidebarPin.projectId, scope.projectId),
      eq(sidebarPin.kind, target.kind),
      eq(sidebarPin.ref, target.ref)
    )

  const topKey = (scope: PinScope) =>
    db
      .select({
        orderKey: sql<string | null>`min(${sidebarPin.orderKey} collate "C")`
      })
      .from(sidebarPin)
      .where(
        and(
          eq(sidebarPin.userId, scope.userId),
          eq(sidebarPin.projectId, scope.projectId)
        )
      )
      .pipe(
        Effect.orDie,
        Effect.map(([row]) => row?.orderKey ?? null)
      )

  const resolveRow = Effect.fnUntraced(function* (
    scope: PinScope | undefined,
    row: PinRow
  ) {
    if (scope === undefined) return yield* new NotFound()
    const target = yield* targetOf(row.kind, row.ref)
    const found: Found =
      target.kind === "sprint"
        ? yield* sprintOf(scope, target.ref)
        : {
            ticket: yield* orNotFound(
              row.title === null || row.status === null
                ? Option.none()
                : Option.some({
                    title: row.title,
                    status: row.status,
                    archivedAt: row.archivedAt
                  })
            )
          }
    return yield* pinOf(scope, target, row.orderKey, found)
  })

  const list = Effect.fn("SidebarPins.list")(function* () {
    const { userId } = yield* OrgScope
    const readable = (yield* access.projectsInOrg()).filter((scope) =>
      scope.permissions.can({ ticket: ["read"] })
    )
    if (readable.length === 0) return []
    const scopeOf = new Map(readable.map((scope) => [scope.projectId, scope]))
    const rows = yield* db
      .select({
        projectId: sidebarPin.projectId,
        kind: sidebarPin.kind,
        ref: sidebarPin.ref,
        orderKey: sidebarPin.orderKey,
        title: ticketIndex.title,
        status: ticketIndex.status,
        archivedAt: ticketIndex.archivedAt
      })
      .from(sidebarPin)
      .leftJoin(
        ticketIndex,
        and(
          eq(sidebarPin.kind, "ticket"),
          eq(ticketIndex.projectId, sidebarPin.projectId),
          eq(ticketIndex.ticketId, sidebarPin.ref)
        )
      )
      .where(
        and(
          eq(sidebarPin.userId, userId),
          inArray(sidebarPin.projectId, [...scopeOf.keys()])
        )
      )
      .pipe(Effect.orDie)
    const pins = yield* Effect.forEach(
      rows,
      (row) => Effect.option(resolveRow(scopeOf.get(row.projectId), row)),
      { concurrency: 8 }
    )
    return pins
      .flatMap((pin) => (Option.isSome(pin) ? [pin.value] : []))
      .toSorted(comparePins)
  })

  const pin = Effect.fn("SidebarPins.pin")(function* (target: PinTarget) {
    const scope = yield* ProjectScope
    const found = yield* resolve(scope, target)
    const orderKey = generateKeyBetween(null, yield* topKey(scope))
    yield* db
      .insert(sidebarPin)
      .values({
        userId: scope.userId,
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        kind: target.kind,
        ref: target.ref,
        orderKey
      })
      .onConflictDoNothing({
        target: [
          sidebarPin.userId,
          sidebarPin.projectId,
          sidebarPin.kind,
          sidebarPin.ref
        ]
      })
      .pipe(Effect.orDie)
    const [row] = yield* db
      .select({ orderKey: sidebarPin.orderKey })
      .from(sidebarPin)
      .where(whereTarget(scope, target))
      .limit(1)
      .pipe(Effect.orDie)
    if (row === undefined) return yield* new NotFound()
    return yield* pinOf(scope, target, row.orderKey, found)
  })

  const reorder = Effect.fn("SidebarPins.reorder")(function* (
    kind: PinKind,
    ref: string,
    orderKey: PinOrderKey
  ) {
    const scope = yield* ProjectScope
    const target = yield* targetOf(kind, ref)
    const updated = yield* db
      .update(sidebarPin)
      .set({ orderKey })
      .where(whereTarget(scope, target))
      .returning({ orderKey: sidebarPin.orderKey })
      .pipe(Effect.orDie)
    if (updated.length === 0) return yield* new NotFound()
    const found = yield* resolve(scope, target)
    return yield* pinOf(scope, target, orderKey, found)
  })

  const unpin = Effect.fn("SidebarPins.unpin")(function* (
    kind: PinKind,
    ref: string
  ) {
    const scope = yield* ProjectScope
    yield* db
      .delete(sidebarPin)
      .where(
        and(
          eq(sidebarPin.userId, scope.userId),
          eq(sidebarPin.projectId, scope.projectId),
          eq(sidebarPin.kind, kind),
          eq(sidebarPin.ref, ref)
        )
      )
      .pipe(Effect.orDie)
  })

  return SidebarPins.of({ list, pin, reorder, unpin })
})

export const layer = Layer.effect(SidebarPins, make)
