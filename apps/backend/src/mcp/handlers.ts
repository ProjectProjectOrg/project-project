import * as AttachmentUploads from "@pp/server-core/attachments/AttachmentUploads"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import { Comments } from "@pp/server-core/comments/Comments"
import { GroupDocs } from "@pp/server-core/groups/GroupDocs"
import { Groups } from "@pp/server-core/groups/Groups"
import { Library } from "@pp/server-core/library/Library"
import { ProjectDocs } from "@pp/server-core/projects/ProjectDocs"
import * as Projects from "@pp/server-core/projects/Projects"
import { ProjectStatuses } from "@pp/server-core/projects/ProjectStatuses"
import { OrgStorage } from "@pp/server-core/storage/OrgStorage"
import { Tags } from "@pp/server-core/tags/Tags"
import * as TicketDocs from "@pp/server-core/tickets/TicketDocs"
import { TicketIndex } from "@pp/server-core/tickets/TicketIndex"
import { Tickets } from "@pp/server-core/tickets/Tickets"
import { Users } from "@pp/server-core/users/Users"
import {
  blockLookupFor,
  CurrentUser,
  expandTemplateKeepingHints,
  formatAttachmentMarkdown,
  formatBlockIssue,
  isRasterImageContentType,
  parseTicketBlocks,
  serializeTicketBlocks,
  stripDefinitionHints,
  type McpTools,
  TicketListQuery,
  Unauthorized,
  Validation,
  validateTicketBlocks,
  tryDecodeCursor,
  type AttachBranchInput,
  type CompleteSprintInput,
  type CreateGroupInput,
  type CreateTicketInput,
  type GroupFilter,
  type GroupId,
  type Pagination,
  type SprintState,
  type TicketId,
  type TicketType,
  type UpdateGroupInput,
  type UpdateTicketInput
} from "@pp/shared"
import * as Effect from "effect/Effect"
import type * as Schema from "effect/Schema"

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
  Exclude<
    E,
    {
      readonly _tag:
        | "MarkdownError"
        | "BetterAuthError"
        | "MalformedTicketDocument"
    }
  >,
  R
> =>
  eff.pipe(
    Effect.catchTags({
      MarkdownError: (e: unknown) => Effect.die(e),
      BetterAuthError: (e: unknown) => Effect.die(e),
      MalformedTicketDocument: (e: unknown) => Effect.die(e)
    })
  ) as Effect.Effect<
    A,
    Exclude<
      E,
      {
        readonly _tag:
          | "MarkdownError"
          | "BetterAuthError"
          | "MalformedTicketDocument"
      }
    >,
    R
  >

// CurrentUser is intentionally absent — the dispatcher provides it per call
// via `Effect.provideService`, so it shouldn't appear in the runtime's R.
export type McpToolServices =
  | AttachmentUploads.AttachmentUploads
  | OrgStorage
  | Users
  | BetterAuth
  | Comments
  | Projects.Projects
  | Tickets
  | Groups
  | Tags
  | ProjectStatuses
  | ProjectDocs
  | GroupDocs
  | TicketDocs.TicketDocs
  | TicketIndex
  | Library

const sanitizeMcpBody = (orgSlug: string, projectSlug: string, body: string) =>
  Effect.gen(function* () {
    const [firstIssue] = validateTicketBlocks(body)
    if (firstIssue !== undefined) {
      return yield* new Validation({
        reason: `block_markup:${formatBlockIssue(firstIssue)}`
      })
    }
    const segments = parseTicketBlocks(body)
    if (!segments.some((segment) => segment.kind === "block")) return body
    const current = yield* CurrentUser
    const library = yield* Library
    const lookup = blockLookupFor(
      yield* library.projectLibrary(orgSlug, current.id, projectSlug)
    )
    return serializeTicketBlocks(
      segments.map((segment) => {
        if (segment.kind === "markdown") return segment
        const definition = lookup(segment.type)
        return definition === undefined
          ? segment
          : {
              ...segment,
              content: stripDefinitionHints(segment.content, definition.content)
            }
      })
    )
  })

const TICKET_TYPES: ReadonlyArray<TicketType> = [
  "feat",
  "bug",
  "chore",
  "other"
]

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

const get_org = Effect.fn("get_org")(function* (input: { orgSlug: string }) {
  const current = yield* CurrentUser
  const betterAuth = yield* BetterAuth
  const org = yield* betterAuth.getOrganization(current.id, input.orgSlug)
  const orgStorage = yield* OrgStorage
  const { status, lastCheckedAt } = yield* orgStorage.getStatus(
    input.orgSlug,
    current.id
  )
  return { ...org, storage: { status, lastCheckedAt } }
})

const list_projects = (input: { orgSlug: string } & Pagination) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects.Projects
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
    const projects = yield* Projects.Projects
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
  } & TicketListQuery &
    Pick<Pagination, "limit">
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tickets = yield* Tickets
    const query = TicketListQuery.make(input)
    const page = yield* tickets.list(
      input.orgSlug,
      current.id,
      input.projectSlug,
      query,
      input.limit
    )
    return {
      items: page.items.map((row) => row.ticket),
      nextCursor: page.nextCursor
    }
  })

const get_ticket = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tickets = yield* Tickets
    const detail = yield* tickets.get(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.id
    )
    return {
      ...detail,
      blocks: parseTicketBlocks(detail.body).flatMap((segment) =>
        segment.kind === "block"
          ? [
              {
                type: segment.type,
                sync: segment.sync === true,
                content: segment.content
              }
            ]
          : []
      )
    }
  })

const list_statuses = (input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const statuses = yield* ProjectStatuses
    return yield* statuses.list(input.orgSlug, current.id, input.projectSlug)
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
    const projects = yield* Projects.Projects
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
    const projects = yield* Projects.Projects
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
    const projects = yield* Projects.Projects
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
    const projects = yield* Projects.Projects
    yield* projects.requireMember(input.orgSlug, current.id, input.projectSlug)
    const docs = yield* TicketDocs.TicketDocs
    return yield* docs.readRaw(input.orgSlug, input.projectSlug, input.id)
  })

const list_blocks = (input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const library = yield* Library
    const result = yield* library.projectLibrary(
      input.orgSlug,
      current.id,
      input.projectSlug
    )
    return result.blocks
      .filter((block) => !block.hidden)
      .map((block) => ({
        key: block.key,
        name: block.name,
        description: block.description,
        sync: block.sync,
        origin: block.origin,
        content: block.content
      }))
  })

const list_templates = (input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const library = yield* Library
    const result = yield* library.projectLibrary(
      input.orgSlug,
      current.id,
      input.projectSlug
    )
    const lookup = blockLookupFor(result)
    return result.templates
      .filter((template) => !template.hidden)
      .map((template) => ({
        key: template.key,
        name: template.name,
        description: template.description,
        type: template.type,
        priority: template.priority,
        tags: template.tags,
        body: expandTemplateKeepingHints(template, lookup),
        isDefaultFor: TICKET_TYPES.filter(
          (type) => result.defaults[type] === template.key
        )
      }))
  })

const create_ticket = (
  input: { orgSlug: string; projectSlug: string } & CreateTicketInput
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tickets = yield* Tickets
    const { orgSlug, projectSlug, body, ...payload } = input
    const sanitizedBody =
      body === undefined
        ? undefined
        : yield* sanitizeMcpBody(orgSlug, projectSlug, body)
    return yield* tickets.create(orgSlug, current.id, projectSlug, {
      ...payload,
      ...(sanitizedBody === undefined ? {} : { body: sanitizedBody })
    })
  })

const update_ticket = (
  input: {
    orgSlug: string
    projectSlug: string
    id: TicketId
  } & UpdateTicketInput
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tickets = yield* Tickets
    const { orgSlug, projectSlug, id, body, ...payload } = input
    const sanitizedBody =
      body === undefined
        ? undefined
        : yield* sanitizeMcpBody(orgSlug, projectSlug, body)
    const updated = yield* tickets.update(
      orgSlug,
      current.id,
      projectSlug,
      id,
      {
        ...payload,
        ...(sanitizedBody === undefined ? {} : { body: sanitizedBody })
      }
    )
    return updated.ticket
  })

const prepare_ticket_attachment = Effect.fn("prepare_ticket_attachment")(
  function* (
    input: Schema.Schema.Type<typeof McpTools.prepare_ticket_attachment.input>
  ) {
    const current = yield* CurrentUser
    const uploads = yield* AttachmentUploads.AttachmentUploads
    const { orgSlug, projectSlug, ticketId, density, width, ...payload } = input
    const prepared = yield* uploads.prepare(
      { orgSlug, projectSlug, ticketId },
      current.id,
      payload
    )
    return {
      ...prepared,
      markdown: formatAttachmentMarkdown({
        kind: isRasterImageContentType(payload.contentType) ? "image" : "file",
        alt: payload.filename,
        url: prepared.url,
        density,
        width
      })
    }
  }
)

const create_comment = (input: {
  orgSlug: string
  projectSlug: string
  ticketId: TicketId
  body: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const comments = yield* Comments
    return yield* comments
      .create(input.orgSlug, current.id, input.projectSlug, input.ticketId, {
        body: input.body
      })
      .pipe(
        Effect.catchTag("InvalidCommentBody", (error) =>
          Effect.fail(new Validation({ reason: error.reason }))
        )
      )
  })

const attach_branch = (
  input: {
    orgSlug: string
    projectSlug: string
    id: TicketId
  } & AttachBranchInput
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const tickets = yield* Tickets
    const { orgSlug, projectSlug, id, ...payload } = input
    return yield* tickets.attachBranch(
      orgSlug,
      current.id,
      projectSlug,
      id,
      payload
    )
  })

const create_sprint = (
  input: { orgSlug: string; projectSlug: string } & Omit<
    CreateGroupInput,
    "kind"
  >
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const groups = yield* Groups
    const { orgSlug, projectSlug, ...rest } = input
    return yield* groups.create(orgSlug, current.id, projectSlug, {
      ...rest,
      kind: "sprint"
    })
  })

const requireSprintKind = (
  orgSlug: string,
  userId: string,
  projectSlug: string,
  id: GroupId
) =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const group = yield* groups.get(orgSlug, userId, projectSlug, id)
    if (group.kind !== "sprint") {
      return yield* new Validation({ reason: `not_a_sprint:${id}` })
    }
    return group
  })

const update_sprint = (
  input: {
    orgSlug: string
    projectSlug: string
    id: GroupId
  } & Omit<UpdateGroupInput, "completedAt">
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const groups = yield* Groups
    const { orgSlug, projectSlug, id, ...payload } = input
    yield* requireSprintKind(orgSlug, current.id, projectSlug, id)
    return yield* groups.update(orgSlug, current.id, projectSlug, id, payload)
  })

const complete_sprint = (
  input: {
    orgSlug: string
    projectSlug: string
    id: GroupId
  } & CompleteSprintInput
) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const groups = yield* Groups
    const { orgSlug, projectSlug, id, ...payload } = input
    yield* requireSprintKind(orgSlug, current.id, projectSlug, id)
    return yield* groups.complete(orgSlug, current.id, projectSlug, id, payload)
  })

const rebuild_ticket_index = (input: {
  orgSlug: string
  projectSlug: string
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const projects = yield* Projects.Projects
    yield* projects.requireRole(input.orgSlug, current.id, input.projectSlug, [
      "owner",
      "admin"
    ])
    const ticketIndex = yield* TicketIndex
    const project = yield* ticketIndex.projectFor(
      input.orgSlug,
      input.projectSlug
    )
    const summary = yield* ticketIndex.reconcileProject(project, {
      force: true
    })
    return {
      orgSlug: project.orgSlug,
      projectSlug: project.projectSlug,
      rebuilt: summary.rebuilt,
      indexed: summary.indexed,
      skipped: summary.skipped,
      drift: {
        missing: summary.drift.missing,
        orphaned: summary.drift.orphaned,
        stale: summary.drift.stale
      }
    }
  })

const add_tickets_to_group = (input: {
  orgSlug: string
  projectSlug: string
  groupId: GroupId
  ticketIds: ReadonlyArray<TicketId>
}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const groups = yield* Groups
    return yield* groups.addTickets(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.groupId,
      input.ticketIds
    )
  })

export const handlers: HandlersMap<McpToolServices> = {
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
  list_statuses: (i) => dieInternal(list_statuses(i)),
  list_tags: (i) => dieInternal(list_tags(i)),
  list_members: (i) => dieInternal(list_members(i)),
  get_git_state: (i) => dieInternal(get_git_state(i)),
  get_project_doc: (i) => dieInternal(get_project_doc(i)),
  get_group_doc: (i) => dieInternal(get_group_doc(i)),
  get_ticket_doc: (i) => dieInternal(get_ticket_doc(i)),
  list_blocks: (i) => dieInternal(list_blocks(i)),
  list_templates: (i) => dieInternal(list_templates(i)),
  create_ticket: (i) => dieInternal(create_ticket(i)),
  update_ticket: (i) => dieInternal(update_ticket(i)),
  prepare_ticket_attachment: (i) => dieInternal(prepare_ticket_attachment(i)),
  create_comment: (i) => dieInternal(create_comment(i)),
  attach_branch: (i) => dieInternal(attach_branch(i)),
  rebuild_ticket_index: (i) => dieInternal(rebuild_ticket_index(i)),
  add_tickets_to_group: (i) => dieInternal(add_tickets_to_group(i)),
  create_sprint: (i) => dieInternal(create_sprint(i)),
  update_sprint: (i) => dieInternal(update_sprint(i)),
  complete_sprint: (i) => dieInternal(complete_sprint(i))
}
