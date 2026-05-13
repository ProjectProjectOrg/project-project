import * as Effect from "effect/Effect"
import {
  CurrentUser,
  Unauthorized,
  tryDecodeCursor,
  type GroupFilter,
  type Pagination,
  type SprintState,
  type TicketFilter
} from "@projectproject/shared"
import { Users } from "../Services/Users"
import { BetterAuth } from "../Services/BetterAuth"
import { Projects } from "../Services/Projects"
import { Tickets } from "../Services/Tickets"
import { Groups } from "../Services/Groups"
import { Tags } from "../Services/Tags"
import { ProjectDocs } from "../Services/ProjectDocs"
import { GroupDocs } from "../Services/GroupDocs"
import { TicketDocs } from "../Services/TicketDocs"
import type { HandlersMap } from "./dispatch"

const DEFAULT_LIMIT = 50

// MarkdownError (filesystem-level failure inside a *Docs / *Service read) and
// BetterAuthError (failure inside the Better Auth wrapper) are backend-only
// signals. The MCP catalog deliberately doesn't declare them — clients can't
// act on either — so handlers `dieInternal` them. The dispatcher's defect
// pipeline maps the result to a generic "Internal error" tool response and
// logs the cause.
const dieInternal = <A, E, R>(
  eff: Effect.Effect<A, E, R>
): Effect.Effect<
  A,
  Exclude<E, { readonly _tag: "MarkdownError" | "BetterAuthError" }>,
  R
> =>
  eff.pipe(
    Effect.catchTags({
      MarkdownError: (e: unknown) => Effect.die(e),
      BetterAuthError: (e: unknown) => Effect.die(e)
    })
  ) as Effect.Effect<
    A,
    Exclude<E, { readonly _tag: "MarkdownError" | "BetterAuthError" }>,
    R
  >

// CurrentUser is intentionally absent — the dispatcher provides it per call
// via `Effect.provideService`, so it shouldn't appear in the runtime's R.
type Env =
  | Users
  | BetterAuth
  | Projects
  | Tickets
  | Groups
  | Tags
  | ProjectDocs
  | GroupDocs
  | TicketDocs

const me = (_input: {}) =>
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
  input: {
    orgSlug: string
    projectSlug: string
    filter?: GroupFilter
  } & Pagination
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const groups = yield* Groups
    return yield* groups.listPaged(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.filter,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const list_sprints = (
  input: {
    orgSlug: string
    projectSlug: string
    state?: SprintState
  } & Pagination
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const groups = yield* Groups
    return yield* groups.listSprintsPaged(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.state,
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

const get_project_doc = (input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    yield* projects.requireMember(input.orgSlug, current.id, input.projectSlug)
    const docs = yield* ProjectDocs
    return yield* docs.readRaw(input.orgSlug, input.projectSlug)
  })

const get_group_doc = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    yield* projects.requireMember(input.orgSlug, current.id, input.projectSlug)
    const docs = yield* GroupDocs
    return yield* docs.readRaw(input.orgSlug, input.projectSlug, input.id)
  })

const get_ticket_doc = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects
    yield* projects.requireMember(input.orgSlug, current.id, input.projectSlug)
    const docs = yield* TicketDocs
    return yield* docs.readRaw(input.orgSlug, input.projectSlug, input.id)
  })

export const handlers: HandlersMap<Env> = {
  me: (i) => dieInternal(me(i)),
  list_orgs: (i) => dieInternal(list_orgs(i)),
  get_org: (i) => dieInternal(get_org(i)),
  list_projects: (i) => dieInternal(list_projects(i)),
  get_project: (i) => dieInternal(get_project(i)),
  list_groups: (i) => dieInternal(list_groups(i)),
  list_sprints: (i) => dieInternal(list_sprints(i)),
  get_group: (i) => dieInternal(get_group(i)),
  list_tickets: (i) => dieInternal(list_tickets(i)),
  get_ticket: (i) => dieInternal(get_ticket(i)),
  list_tags: (i) => dieInternal(list_tags(i)),
  list_members: (i) => dieInternal(list_members(i)),
  get_git_state: (i) => dieInternal(get_git_state(i)),
  get_project_doc: (i) => dieInternal(get_project_doc(i)),
  get_group_doc: (i) => dieInternal(get_group_doc(i)),
  get_ticket_doc: (i) => dieInternal(get_ticket_doc(i))
}
