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
import {
  blockLookupFor,
  expandTemplateKeepingHints,
  formatAttachmentMarkdown,
  formatBlockIssue,
  isPristineTemplateBody,
  isRasterImageContentType,
  parseTicketBlocks,
  serializeTicketBlocks,
  stripDefinitionHints,
  stripHints,
  type McpTools,
  TicketListQuery,
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
  type Library as LibraryValue,
  type SprintState,
  type TemplateKey,
  type TicketId,
  type TicketType,
  type UpdateGroupInput,
  type UpdateTicketInput
} from "@pp/shared"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Schema from "effect/Schema"
import { Tool } from "effect/unstable/ai"

import { orgTool } from "./access"
import { McpCurrentUser } from "./McpRequestUser"
import {
  McpToolkit,
  toToolkitHandlers,
  type McpHandlerEnv,
  type McpHandlers,
  type McpToolsByName
} from "./toolkit"

const DEFAULT_LIMIT = 50

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
    const current = yield* McpCurrentUser
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

const withBlocks = <T extends Readonly<{ body: string }>>(detail: T) => ({
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
})

const isUntouchedBody = (body: string, library: LibraryValue): boolean => {
  if (body.trim() === "") return true
  const lookup = blockLookupFor(library)
  const comparable = stripHints(body)
  return library.templates.some((template) =>
    isPristineTemplateBody(comparable, template, lookup)
  )
}

const TICKET_TYPES: ReadonlyArray<TicketType> = [
  "feat",
  "bug",
  "chore",
  "other"
]

const me = (_input: {}) =>
  Effect.gen(function* () {
    const current = yield* McpCurrentUser
    const betterAuth = yield* BetterAuth
    const orgs = yield* betterAuth.listOrganizations(current.id)
    return {
      user: current,
      roles: orgs.map((o) => ({ orgSlug: o.orgSlug, role: o.role }))
    }
  })

const list_orgs = (input: Pagination) =>
  Effect.gen(function* () {
    const current = yield* McpCurrentUser
    const betterAuth = yield* BetterAuth
    return yield* betterAuth.listOrganizationsPaged(
      current.id,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  })

const get_org = Effect.fn("get_org")(function* (input: { orgSlug: string }) {
  const current = yield* McpCurrentUser
  const betterAuth = yield* BetterAuth
  const org = yield* betterAuth.getOrganization(current.id, input.orgSlug)
  const orgStorage = yield* OrgStorage
  const { status, lastCheckedAt } = yield* orgStorage.getStatus()
  return { ...org, storage: { status, lastCheckedAt } }
})

const list_projects = (input: { orgSlug: string } & Pagination) =>
  Effect.gen(function* () {
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
    const tickets = yield* Tickets
    const detail = yield* tickets.get(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.id
    )
    return withBlocks(detail)
  })

const list_statuses = (input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const current = yield* McpCurrentUser
    const statuses = yield* ProjectStatuses
    return yield* statuses.list(input.orgSlug, current.id, input.projectSlug)
  })

const list_tags = (
  input: { orgSlug: string; projectSlug: string } & Pagination
) =>
  Effect.gen(function* () {
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
    const projects = yield* Projects.Projects
    yield* projects.requireMember(input.orgSlug, current.id, input.projectSlug)
    const docs = yield* TicketDocs.TicketDocs
    return yield* docs.readRaw(input.orgSlug, input.projectSlug, input.id)
  })

const list_blocks = (input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
    const tickets = yield* Tickets
    const { orgSlug, projectSlug, body, ...payload } = input
    const sanitizedBody =
      body === undefined
        ? undefined
        : yield* sanitizeMcpBody(orgSlug, projectSlug, body)
    const created = yield* tickets.create(orgSlug, current.id, projectSlug, {
      ...payload,
      ...(sanitizedBody === undefined ? {} : { body: sanitizedBody })
    })
    return withBlocks(created)
  })

const templateBodyFor = (
  orgSlug: string,
  projectSlug: string,
  id: TicketId,
  template: TemplateKey
) =>
  Effect.gen(function* () {
    const current = yield* McpCurrentUser
    const projects = yield* Projects.Projects
    const tickets = yield* Tickets
    const library = yield* Library
    yield* projects.requireMember(orgSlug, current.id, projectSlug)
    const expansion = yield* library.expandForCreate(
      orgSlug,
      projectSlug,
      template
    )
    const [ticket, projectLibrary] = yield* Effect.all(
      [
        tickets.get(orgSlug, current.id, projectSlug, id),
        library.projectLibrary(orgSlug, current.id, projectSlug)
      ],
      { concurrency: 2 }
    )
    if (!isUntouchedBody(ticket.body, projectLibrary)) {
      return yield* new Validation({
        reason: `template_needs_body:${template}`
      })
    }
    return { body: expansion.body, expectedBody: ticket.body }
  })

const update_ticket = (
  input: {
    orgSlug: string
    projectSlug: string
    id: TicketId
    template?: TemplateKey | null
  } & UpdateTicketInput
) =>
  Effect.gen(function* () {
    const current = yield* McpCurrentUser
    const tickets = yield* Tickets
    const { orgSlug, projectSlug, id, body, template, ...payload } = input
    const templateBody =
      body === undefined && template !== undefined && template !== null
        ? yield* templateBodyFor(orgSlug, projectSlug, id, template)
        : undefined
    const sanitizedBody =
      body !== undefined
        ? yield* sanitizeMcpBody(orgSlug, projectSlug, body)
        : templateBody?.body
    const updated = yield* tickets
      .update(
        orgSlug,
        current.id,
        projectSlug,
        id,
        {
          ...payload,
          ...(sanitizedBody === undefined ? {} : { body: sanitizedBody })
        },
        undefined,
        templateBody?.expectedBody
      )
      .pipe(
        Effect.catchTag("Validation", (error) =>
          error.reason === "ticket_body_changed" && template != null
            ? Effect.fail(
                new Validation({ reason: `template_needs_body:${template}` })
              )
            : Effect.fail(error)
        )
      )
    return withBlocks(updated.ticket)
  })

const prepare_ticket_attachment = (
  input: Schema.Schema.Type<typeof McpTools.prepare_ticket_attachment.input>
) =>
  Effect.gen(function* () {
    const current = yield* McpCurrentUser
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
  })

const create_comment = (input: {
  orgSlug: string
  projectSlug: string
  ticketId: TicketId
  body: string
}) =>
  Effect.gen(function* () {
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
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
    const current = yield* McpCurrentUser
    const projects = yield* Projects.Projects
    yield* projects.requireRole(input.orgSlug, current.id, input.projectSlug, [
      "pm"
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
    const current = yield* McpCurrentUser
    const groups = yield* Groups
    return yield* groups.addTickets(
      input.orgSlug,
      current.id,
      input.projectSlug,
      input.groupId,
      input.ticketIds
    )
  })

export const handlers: McpHandlers<McpHandlerEnv> = {
  me,
  list_orgs,
  get_org: orgTool("membership", get_org),
  list_projects: orgTool("membership", list_projects),
  get_project: orgTool("membership", get_project),
  list_groups: orgTool("membership", list_groups),
  list_sprints: orgTool("membership", list_sprints),
  get_group: orgTool("membership", get_group),
  list_tickets: orgTool("membership", list_tickets),
  get_ticket: orgTool("membership", get_ticket),
  list_statuses: orgTool("membership", list_statuses),
  list_tags: orgTool("membership", list_tags),
  list_members: orgTool("membership", list_members),
  get_git_state: orgTool("membership", get_git_state),
  get_project_doc: orgTool("membership", get_project_doc),
  get_group_doc: orgTool("membership", get_group_doc),
  get_ticket_doc: orgTool("membership", get_ticket_doc),
  list_blocks: orgTool("membership", list_blocks),
  list_templates: orgTool("membership", list_templates),
  create_ticket: orgTool("membership", create_ticket),
  update_ticket: orgTool("membership", update_ticket),
  prepare_ticket_attachment: orgTool("membership", prepare_ticket_attachment),
  create_comment: orgTool("membership", create_comment),
  attach_branch: orgTool("membership", attach_branch),
  rebuild_ticket_index: orgTool("membership", rebuild_ticket_index),
  add_tickets_to_group: orgTool("membership", add_tickets_to_group),
  create_sprint: orgTool("membership", create_sprint),
  update_sprint: orgTool("membership", update_sprint),
  complete_sprint: orgTool("membership", complete_sprint)
}

export const toolkitHandlers = McpToolkit.of(toToolkitHandlers(handlers))

export const McpToolkitHandlersLive: Layer.Layer<
  Tool.HandlersFor<McpToolsByName>,
  never,
  McpHandlerEnv
> = McpToolkit.toLayer(toolkitHandlers)
