import { Db } from "@pp/db"
import { UserId, type User } from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export type UserSummary = Readonly<{
  id: string
  email: string
  name: string
  username: string | null
}>

export class Users extends Context.Service<
  Users,
  Readonly<{
    findByEmail: (email: string) => Effect.Effect<UserSummary | null>
    findManyByIds: (
      ids: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyArray<UserSummary>>
    fullByIds: (
      ids: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyArray<User>>
  }>
>()("@pp/server-core/users/Users") {}

const decodeUserId = Schema.decodeSync(UserId)

const userColumns = {
  id: true,
  email: true,
  name: true,
  username: true
} as const

const make = Effect.gen(function* () {
  const db = yield* Db

  const findByEmail = Effect.fn("Users.findByEmail")(function* (email: string) {
    const row = yield* db.query.user
      .findFirst({
        columns: userColumns,
        where: {
          RAW: (table, _operators) =>
            _operators.eq(table.email, email.toLowerCase())
        }
      })
      .pipe(Effect.orDie)
    return row ?? null
  })

  const findManyByIds = Effect.fn("Users.findManyByIds")(function* (
    ids: ReadonlyArray<string>
  ): Effect.fn.Return<ReadonlyArray<UserSummary>> {
    if (ids.length === 0) return []
    return yield* db.query.user
      .findMany({
        columns: userColumns,
        where: {
          RAW: (table, _operators) => _operators.inArray(table.id, [...ids])
        }
      })
      .pipe(Effect.orDie)
  })

  const fullByIds = Effect.fn("Users.fullByIds")(function* (
    ids: ReadonlyArray<string>
  ): Effect.fn.Return<ReadonlyArray<User>> {
    if (ids.length === 0) return []
    const rows = yield* db.query.user
      .findMany({
        columns: {
          id: true,
          email: true,
          name: true,
          username: true,
          image: true,
          createdAt: true
        },
        where: {
          RAW: (table, _operators) => _operators.inArray(table.id, [...ids])
        }
      })
      .pipe(Effect.orDie)
    return rows.map(
      (r): User => ({
        id: decodeUserId(r.id),
        email: r.email,
        name: r.name,
        username: r.username,
        image: r.image ?? null,
        createdAt: r.createdAt,
        activeOrgSlug: null,
        personalGithub: {
          connected: false
        },
        editorPreference: "github",
        personalEverhour: {
          connected: false,
          everhourUserId: null,
          name: null,
          email: null,
          lastVerifiedAt: null,
          lastCheckError: null
        },
        avatarOptions: []
      })
    )
  })

  return Users.of({ findByEmail, findManyByIds, fullByIds })
})

export const layer = Layer.effect(Users, make)
