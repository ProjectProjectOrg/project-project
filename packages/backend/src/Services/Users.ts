import { Context, type Effect } from "effect"

export interface UserSummary {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly username: string | null
}

export interface UsersShape {
  readonly findByEmail: (
    email: string
  ) => Effect.Effect<UserSummary | null>
  readonly findManyByIds: (
    ids: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<UserSummary>>
}

export class Users extends Context.Tag("Users")<Users, UsersShape>() {}
