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
  ProjectScope,
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

import { orgTool, projectTool } from "./access"
import { McpCurrentUser } from "./McpRequestUser"
import {
  McpToolkit,
  toToolkitHandlers,
  type McpHandlerEnv,
  type McpHandlers,
  type McpToolsByName
} from "./toolkit"

const DEFAULT_LIMIT = 50

const sanitizeMcpBody = (body: string) =>
  Effect.gen(function* () {
    const [firstIssue] = validateTicketBlocks(body)
    if (firstIssue !== undefined) {
      return yield* new Validation({
        reason: `block_markup:${formatBlockIssue(firstIssue)}`
      })
    }
    const segments = parseTicketBlocks(body)
    if (!segments.some((segment) => segment.kind === "block")) return body
    const library = yield* Library
    const lookup = blockLookupFor(yield* library.projectLibrary())
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
  Effect.flatMap(Projects.Projects, (projects) =>
    projects.listPaged(
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  )

const get_project = (_input: { orgSlug: string; projectSlug: string }) =>
  Effect.flatMap(Projects.Projects, (projects) => projects.get())

const list_groups = (
  input: {
    orgSlug: string
    projectSlug: string
    filter?: GroupFilter
  } & Pagination
) =>
  Effect.flatMap(Groups, (groups) =>
    groups.listPaged(
      input.filter,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  )

const list_sprints = (
  input: {
    orgSlug: string
    projectSlug: string
    state?: SprintState
  } & Pagination
) =>
  Effect.flatMap(Groups, (groups) =>
    groups.listSprintsPaged(
      input.state,
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  )

const get_group = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) => Effect.flatMap(Groups, (groups) => groups.get(input.id))

const list_tickets = (
  input: {
    orgSlug: string
    projectSlug: string
  } & TicketListQuery &
    Pick<Pagination, "limit">
) =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const page = yield* tickets.list(TicketListQuery.make(input), input.limit)
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
    const tickets = yield* Tickets
    const detail = yield* tickets.get(input.id)
    return withBlocks(detail)
  })

const list_statuses = (_input: { orgSlug: string; projectSlug: string }) =>
  Effect.flatMap(ProjectStatuses, (statuses) => statuses.list())

const list_tags = (
  input: { orgSlug: string; projectSlug: string } & Pagination
) =>
  Effect.flatMap(Tags, (tags) =>
    tags.listPaged(tryDecodeCursor(input.cursor), input.limit ?? DEFAULT_LIMIT)
  )

const list_members = (
  input: { orgSlug: string; projectSlug: string } & Pagination
) =>
  Effect.flatMap(Projects.Projects, (projects) =>
    projects.listMembersPaged(
      tryDecodeCursor(input.cursor),
      input.limit ?? DEFAULT_LIMIT
    )
  )

const get_git_state = (input: {
  orgSlug: string
  projectSlug: string
  ticketId?: string
}) => Effect.flatMap(Tickets, (tickets) => tickets.getGitState(input.ticketId))

const get_project_doc = (input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const docs = yield* ProjectDocs
    return yield* docs.readRaw(input.orgSlug, input.projectSlug)
  })

const get_group_doc = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) =>
  Effect.gen(function* () {
    const docs = yield* GroupDocs
    return yield* docs.readRaw(input.orgSlug, input.projectSlug, input.id)
  })

const get_ticket_doc = (input: {
  orgSlug: string
  projectSlug: string
  id: string
}) =>
  Effect.gen(function* () {
    const docs = yield* TicketDocs.TicketDocs
    return yield* docs.readRaw(input.orgSlug, input.projectSlug, input.id)
  })

const list_blocks = (_input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const library = yield* Library
    const result = yield* library.projectLibrary()
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

const list_templates = (_input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const library = yield* Library
    const result = yield* library.projectLibrary()
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
    const tickets = yield* Tickets
    const {
      orgSlug: _orgSlug,
      projectSlug: _projectSlug,
      body,
      ...payload
    } = input
    const sanitizedBody =
      body === undefined ? undefined : yield* sanitizeMcpBody(body)
    const created = yield* tickets.create({
      ...payload,
      ...(sanitizedBody === undefined ? {} : { body: sanitizedBody })
    })
    return withBlocks(created)
  })

const templateBodyFor = (id: TicketId, template: TemplateKey) =>
  Effect.gen(function* () {
    const { orgSlug, slug } = yield* ProjectScope
    const tickets = yield* Tickets
    const library = yield* Library
    const expansion = yield* library.expandForCreate(orgSlug, slug, template)
    const [ticket, projectLibrary] = yield* Effect.all(
      [tickets.get(id), library.projectLibrary()],
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
    const tickets = yield* Tickets
    const {
      orgSlug: _orgSlug,
      projectSlug: _projectSlug,
      id,
      body,
      template,
      ...payload
    } = input
    const templateBody =
      body === undefined && template !== undefined && template !== null
        ? yield* templateBodyFor(id, template)
        : undefined
    const sanitizedBody =
      body !== undefined ? yield* sanitizeMcpBody(body) : templateBody?.body
    const updated = yield* tickets
      .update(
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
    const uploads = yield* AttachmentUploads.AttachmentUploads
    const {
      orgSlug: _orgSlug,
      projectSlug: _projectSlug,
      ticketId,
      density,
      width,
      ...payload
    } = input
    const prepared = yield* uploads.prepare(ticketId, payload)
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
  Effect.flatMap(Comments, (comments) =>
    comments.create(input.ticketId, { body: input.body })
  ).pipe(
    Effect.catchTag("InvalidCommentBody", (error) =>
      Effect.fail(new Validation({ reason: error.reason }))
    )
  )

const attach_branch = (
  input: {
    orgSlug: string
    projectSlug: string
    id: TicketId
  } & AttachBranchInput
) =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const {
      orgSlug: _orgSlug,
      projectSlug: _projectSlug,
      id,
      ...payload
    } = input
    return yield* tickets.attachBranch(id, payload)
  })

const create_sprint = (
  input: { orgSlug: string; projectSlug: string } & Omit<
    CreateGroupInput,
    "kind"
  >
) =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const { orgSlug: _orgSlug, projectSlug: _projectSlug, ...rest } = input
    return yield* groups.create({ ...rest, kind: "sprint" })
  })

const requireSprintKind = (id: GroupId) =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const group = yield* groups.get(id)
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
    const groups = yield* Groups
    const {
      orgSlug: _orgSlug,
      projectSlug: _projectSlug,
      id,
      ...payload
    } = input
    yield* requireSprintKind(id)
    return yield* groups.update(id, payload)
  })

const complete_sprint = (
  input: {
    orgSlug: string
    projectSlug: string
    id: GroupId
  } & CompleteSprintInput
) =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const {
      orgSlug: _orgSlug,
      projectSlug: _projectSlug,
      id,
      ...payload
    } = input
    yield* requireSprintKind(id)
    return yield* groups.complete(id, payload)
  })

const rebuild_ticket_index = (input: {
  orgSlug: string
  projectSlug: string
}) =>
  Effect.gen(function* () {
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
  Effect.flatMap(Groups, (groups) =>
    groups.addTickets(input.groupId, input.ticketIds)
  )

export const handlers: McpHandlers<McpHandlerEnv> = {
  me,
  list_orgs,
  get_org: orgTool("membership", get_org),
  list_projects: orgTool("membership", list_projects),
  get_project: projectTool({ docs: ["read"] }, get_project),
  list_groups: projectTool({ ticket: ["read"] }, list_groups),
  list_sprints: projectTool({ ticket: ["read"] }, list_sprints),
  get_group: projectTool({ ticket: ["read"] }, get_group),
  list_tickets: projectTool({ ticket: ["read"] }, list_tickets),
  get_ticket: projectTool({ ticket: ["read"] }, get_ticket),
  list_statuses: projectTool({ ticket: ["read"] }, list_statuses),
  list_tags: projectTool({ ticket: ["read"] }, list_tags),
  list_members: projectTool({ ticket: ["read"] }, list_members),
  get_git_state: projectTool({ github: ["read"] }, get_git_state),
  get_project_doc: projectTool(
    { docs: ["read"], github: ["read"] },
    get_project_doc
  ),
  get_group_doc: projectTool({ ticket: ["read"] }, get_group_doc),
  get_ticket_doc: projectTool(
    { ticket: ["read"], github: ["read"] },
    get_ticket_doc
  ),
  list_blocks: projectTool({ ticket: ["read"] }, list_blocks),
  list_templates: projectTool({ ticket: ["read"] }, list_templates),
  create_ticket: projectTool({ ticket: ["create"] }, create_ticket),
  update_ticket: projectTool("membership", update_ticket),
  prepare_ticket_attachment: projectTool(
    { attachment: ["upload"] },
    prepare_ticket_attachment
  ),
  create_comment: projectTool({ comment: ["create"] }, create_comment),
  attach_branch: projectTool({ github: ["write"] }, attach_branch),
  rebuild_ticket_index: projectTool(
    { settings: ["manage"] },
    rebuild_ticket_index
  ),
  add_tickets_to_group: projectTool("membership", add_tickets_to_group),
  create_sprint: projectTool({ sprint: ["manage"] }, create_sprint),
  update_sprint: projectTool({ sprint: ["manage"] }, update_sprint),
  complete_sprint: projectTool({ sprint: ["manage"] }, complete_sprint)
}

export const toolkitHandlers = McpToolkit.of(toToolkitHandlers(handlers))

export const McpToolkitHandlersLive: Layer.Layer<
  Tool.HandlersFor<McpToolsByName>,
  never,
  McpHandlerEnv
> = McpToolkit.toLayer(toolkitHandlers)
