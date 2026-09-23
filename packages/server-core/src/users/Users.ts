import type { User } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export interface UserSummary {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly username: string | null
}

export interface UsersShape {
  readonly findByEmail: (email: string) => Effect.Effect<UserSummary | null>
  readonly findManyByIds: (
    ids: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<UserSummary>>
  readonly fullByIds: (
    ids: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<User>>
}

export class Users extends Context.Service<Users, UsersShape>()(
  "@pp/server-core/users/Users"
) {}
