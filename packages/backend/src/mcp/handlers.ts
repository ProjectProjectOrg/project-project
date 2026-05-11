import * as Effect from "effect/Effect"
import {
  CurrentUser,
  Unauthorized,
  tryDecodeCursor,
  type MeOutput,
  type Pagination,
  type TicketFilter
} from "@projectproject/shared"
import { Users } from "../Services/Users"
import { BetterAuth, type BetterAuthError } from "../Services/BetterAuth"
import { Projects } from "../Services/Projects"
import { Tickets } from "../Services/Tickets"
import { Groups } from "../Services/Groups"
import { Tags } from "../Services/Tags"
import type { HandlersMap } from "./dispatch"

const DEFAULT_LIMIT = 50

type Env =
  | CurrentUser
  | Users
  | BetterAuth
  | Projects
  | Tickets
  | Groups
  | Tags

const me = (
  _input: {}
): Effect.Effect<MeOutput, Unauthorized | BetterAuthError, CurrentUser | Users | BetterAuth> =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const users = yield* Users
    const [user] = yield* users.fullByIds([current.id])
    if (!user) return yield* new Unauthorized()
    const betterAuth = yield* BetterAuth
    const orgs = yield* betterAuth.listOrganizations(current.id)
    return {
      user,
      roles: orgs.map((o) => ({ orgSlug: o.orgSlug, role: o.role }))
    }
  })

const list_orgs = (input: Pagination) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const betterAuth = yield* BetterAuth
    return yield* betterAuth.listOrganizationsPaged(
      current.id,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const get_org = (input: { orgSlug: string }) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const betterAuth = yield* BetterAuth
    return yield* betterAuth.getOrganization(current.id, input.orgSlug)
  })

const list_projects = (input: { orgSlug: string } & Pagination) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    return yield* projects.listPaged(
      input.orgSlug,
      current.id,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const get_project = (input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    return yield* projects.get(input.orgSlug, current.id, input.projectSlug)
  })

const list_groups = (
  input: { orgSlug: string; projectSlug: string } & Pagination
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const groups = yield* Groups
    return yield* groups.listPaged(
      input.orgSlug,
      current.id,
      input.projectSlug,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const get_group = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const groups = yield* Groups
    return yield* groups.get(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.id
    )
  })

const list_tickets = (
  input: {
    orgSlug: string
    projectSlug: string
    filter?: TicketFilter
  } & Pagination
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tickets = yield* Tickets
    return yield* tickets.listPaged(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.filter,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const get_ticket = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tickets = yield* Tickets
    return yield* tickets.get(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.id
    )
  })

const list_tags = (
  input: { orgSlug: string; projectSlug: string } & Pagination
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tags = yield* Tags
    return yield* tags.listPaged(
      input.orgSlug,
      current.id,
      input.projectSlug,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const list_members = (
  input: { orgSlug: string; projectSlug: string } & Pagination
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    return yield* projects.listMembersPaged(
      input.orgSlug,
      current.id,
      input.projectSlug,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const get_git_state = (input: {
  orgSlug: string
  projectSlug: string
  ticketId?: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tickets = yield* Tickets
    return yield* tickets.getGitState(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.ticketId
    )
  })

export const handlers: HandlersMap<Env> = {
  me,
  list_orgs,
  get_org,
  list_projects,
  get_project,
  list_groups,
  get_group,
  list_tickets,
  get_ticket,
  list_tags,
  list_members,
  get_git_state
}
