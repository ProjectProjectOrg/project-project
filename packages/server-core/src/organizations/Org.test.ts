import { it } from "@effect/vitest"
import { Db } from "@pp/db"
import { member } from "@pp/db/schema"
import { Conflict, OrgScope, type OrgRole } from "@pp/shared"
import { PgDialect } from "drizzle-orm/pg-core"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as TestClock from "effect/testing/TestClock"
import { expect } from "vitest"

import { orgScope } from "../access/testing"
import { Org } from "./Org"
import { OrgLive } from "./OrgLive"

const NOW = "2026-05-19T00:00:00.000Z"
const setNow = TestClock.setTime(
  DateTime.toEpochMillis(DateTime.makeUnsafe(NOW))
)

const dialect = new PgDialect()
const sqlOf = (cond: unknown) => dialect.sqlToQuery(cond as never).sql

const isoDate = (s: string) => DateTime.toDate(DateTime.makeUnsafe(s))
const nowDate = isoDate(NOW)
const daysBefore = (n: number) =>
  DateTime.toDate(DateTime.subtract(DateTime.makeUnsafe(NOW), { days: n }))
const plusGrace = (d: Date) =>
  DateTime.toDate(DateTime.add(DateTime.fromDateUnsafe(d), { days: 14 }))

interface Capture {
  myOrgsWhere?: unknown
  updateSet?: { deletedAt: Date | null }
  updateWhere?: unknown
}

interface DbState {
  myOrgRows?: ReadonlyArray<{ slug: string; name: string; role: string }>
  capture: Capture
}

const makeState = (
  myOrgRows?: ReadonlyArray<{ slug: string; name: string; role: string }>
): DbState => ({ myOrgRows, capture: {} })

const makeDb = (state: DbState) =>
  Layer.succeed(Db, {
    select: () => ({
      from: (table: unknown) =>
        table === member
          ? {
              innerJoin: () => ({
                where: (cond: unknown) => {
                  state.capture.myOrgsWhere = cond
                  return Effect.succeed(state.myOrgRows ?? [])
                }
              })
            }
          : {
              where: () => ({
                limit: () =>
                  Effect.succeed([
                    {
                      name: "Acme",
                      createdAt: isoDate("2026-01-01T00:00:00.000Z")
                    }
                  ])
              })
            }
    }),
    update: () => ({
      set: (values: { deletedAt: Date | null }) => {
        state.capture.updateSet = values
        return {
          where: (cond: unknown) => {
            state.capture.updateWhere = cond
            return Effect.succeed([])
          }
        }
      }
    })
  } as never)

const inScope = (
  state: DbState,
  role: OrgRole,
  deletedAt: Date | null = null
) =>
  Effect.provide(
    Layer.merge(
      OrgLive.pipe(Layer.provide(makeDb(state))),
      Layer.succeed(OrgScope, orgScope(role, { deletedAt }))
    )
  )

it.effect("myOrgs maps rows and filters deleted in the query", () =>
  Effect.gen(function* () {
    const state = makeState([
      { slug: "acme", name: "Acme", role: "owner" },
      { slug: "beta", name: "Beta", role: "member" }
    ])
    const org = yield* Org.pipe(
      Effect.provide(OrgLive.pipe(Layer.provide(makeDb(state))))
    )
    const orgs = yield* org.myOrgs("user-1")
    expect(orgs).toEqual([
      { slug: "acme", name: "Acme", role: "owner" },
      { slug: "beta", name: "Beta", role: "member" }
    ])
    const where = sqlOf(state.capture.myOrgsWhere)
    expect(where).toContain("deleted_at")
    expect(where).toContain("is null")
  })
)

it.effect(
  "get surfaces the caller's role, permissions, deletedAt and purgeAt",
  () => {
    const deletedAt = daysBefore(3)
    return Effect.gen(function* () {
      const org = yield* Org
      const detail = yield* org.get()
      expect(detail).toStrictEqual({
        id: "org-1",
        slug: "acme",
        name: "Acme",
        role: "admin",
        permissions: orgScope("admin").permissions.grants,
        createdAt: isoDate("2026-01-01T00:00:00.000Z"),
        deletedAt,
        purgeAt: plusGrace(deletedAt)
      })
    }).pipe(inScope(makeState(), "admin", deletedAt))
  }
)

it.effect("get returns null deletedAt/purgeAt for a live org", () =>
  Effect.gen(function* () {
    const org = yield* Org
    const detail = yield* org.get()
    expect(detail.deletedAt).toBeNull()
    expect(detail.purgeAt).toBeNull()
  }).pipe(inScope(makeState(), "guest"))
)

it.effect("softDelete sets deletedAt for an owner", () => {
  const state = makeState()
  return Effect.gen(function* () {
    yield* setNow
    const org = yield* Org
    const detail = yield* org.softDelete()
    expect(detail.deletedAt).toEqual(nowDate)
    expect(detail.purgeAt).toEqual(plusGrace(nowDate))
    expect(state.capture.updateSet?.deletedAt).toEqual(nowDate)
  }).pipe(inScope(state, "owner"))
})

it.effect(
  "restore clears deletedAt for an owner within the grace window",
  () => {
    const state = makeState()
    return Effect.gen(function* () {
      yield* setNow
      const org = yield* Org
      const detail = yield* org.restore()
      expect(detail.deletedAt).toBeNull()
      expect(detail.purgeAt).toBeNull()
      expect(state.capture.updateSet?.deletedAt).toBeNull()
    }).pipe(inScope(state, "owner", daysBefore(5)))
  }
)

it.effect("restore rejects a past-grace org with Conflict", () =>
  Effect.gen(function* () {
    yield* setNow
    const org = yield* Org
    const error = yield* Effect.flip(org.restore())
    expect(error).toStrictEqual(new Conflict({ reason: "grace_expired" }))
  }).pipe(inScope(makeState(), "owner", daysBefore(20)))
)

it.effect("restore rejects a live org with Conflict", () =>
  Effect.gen(function* () {
    yield* setNow
    const org = yield* Org
    const error = yield* Effect.flip(org.restore())
    expect(error).toStrictEqual(new Conflict({ reason: "not_deleted" }))
  }).pipe(inScope(makeState(), "owner"))
)
