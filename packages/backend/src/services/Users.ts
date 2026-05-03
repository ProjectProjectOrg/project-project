// Users service — read-only helpers over Better Auth's user table.
//
// We don't go through Better Auth's API for these because (a) Better Auth's
// public API is signed-in-user-shaped, not "look up someone else", and
// (b) we already have a Drizzle client for our own queries. Hitting the
// shared user table directly is the simplest seam.
//
// Surface stays small on purpose: only what Projects (and later Tickets'
// assignee resolution) actually need.

import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { user } from "../db/schema"
import { Db } from "./Db"

export interface UserSummary {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly username: string | null
}

export class Users extends Effect.Service<Users>()(
  "Users",
  {
    effect: Effect.gen(function*() {
      const db = yield* Db

      const findByEmail = (
        email: string
      ): Effect.Effect<UserSummary | null> =>
        db
          .select({
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.username
          })
          .from(user)
          .where(eq(user.email, email.toLowerCase()))
          .limit(1)
          .pipe(Effect.map((rows) => rows[0] ?? null), Effect.orDie)

      const findManyByIds = (
        ids: ReadonlyArray<string>
      ): Effect.Effect<ReadonlyArray<UserSummary>> =>
        Effect.gen(function*() {
          if (ids.length === 0) return [] as ReadonlyArray<UserSummary>
          // Drizzle's `inArray` import path varies; a simple OR-chain via
          // `eq` would balloon the SQL. We use `Promise.all` of single-row
          // lookups for a PoC-scale member list (≤ a few dozen). Swap to
          // `inArray` when this becomes a hot path.
          const results = yield* Effect.forEach(
            ids,
            (id) =>
              db
                .select({
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  username: user.username
                })
                .from(user)
                .where(eq(user.id, id))
                .limit(1)
                .pipe(Effect.map((rows) => rows[0] ?? null), Effect.orDie),
            { concurrency: 8 }
          )
          return results.filter((r): r is UserSummary => r !== null)
        })

      return { findByEmail, findManyByIds } as const
    })
  }
) {}
