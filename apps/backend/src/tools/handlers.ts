import * as AttachmentUploads from "@pp/server-core/attachments/AttachmentUploads"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import { Comments } from "@pp/server-core/comments/Comments"
import { GroupDocs } from "@pp/server-core/groups/GroupDocs"
import { Groups } from "@pp/server-core/groups/Groups"
import { Library } from "@pp/server-core/library/Library"
import { ProjectDocs } from "@pp/server-core/projects/ProjectDocs"
import { ProjectGitAutomation } from "@pp/server-core/projects/ProjectGitAutomation"
import * as Projects from "@pp/server-core/projects/Projects"
import { ProjectStatuses } from "@pp/server-core/projects/ProjectStatuses"
import { OrgStorage } from "@pp/server-core/storage/OrgStorage"
import { Tags } from "@pp/server-core/tags/Tags"
import * as TicketCommands from "@pp/server-core/tickets/TicketCommands"
import * as TicketDocs from "@pp/server-core/tickets/TicketDocs"
import * as TicketGit from "@pp/server-core/tickets/TicketGit"
import { TicketIndex } from "@pp/server-core/tickets/TicketIndex"
import * as TicketIndexMaintenance from "@pp/server-core/tickets/TicketIndexMaintenance"
import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"
import {
  blockLookupFor,
  expandTemplateKeepingHints,
  applyTicketBodyEdits,
  formatAttachmentMarkdown,
  formatBlockIssue,
  formatTicketBodyEditFailure,
  GIT_AUTOMATION_EVENTS,
  isPristineTemplateBody,
  isRasterImageContentType,
  parseTicketBlocks,
  permits,
  ProjectScope,
  serializeTicketBlocks,
  stripDefinitionHints,
  stripHints,
  Tools,
  CurrentUser,
  TicketListQuery,
  Validation,
  validateTicketBlocks,
  tryDecodeCursor,
  type AttachBranchInput,
  type CompleteSprintInput,
  type CreateGroupInput,
  type CreateTicketInput,
  type GroupFilter,
  type GitAutomation,
  type GroupId,
  type Pagination,
  type Library as LibraryValue,
  type ProjectStatus,
  type SprintState,
  type TemplateKey,
  type TicketBodyEdit,
  type TicketId,
  type TicketType,
  type UpdateGroupInput,
  type UpdateTicketInput
} from "@pp/shared"
import type { Tool } from "effect/ai"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"

import { toolRunner } from "./runTool"

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
  "other",
  "epic"
]

const me = (_input: {}) =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const betterAuth = yield* BetterAuth
    const orgs = yield* betterAuth.listOrganizations(current.id)
    return {
      user: current,
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
    const queries = yield* TicketQueries.TicketQueries
    const page = yield* queries.list(TicketListQuery.make(input), input.limit)
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
    const queries = yield* TicketQueries.TicketQueries
    const detail = yield* queries.get(input.id)
    return withBlocks(detail)
  })

const statusesWithAutomation = (
  statuses: ReadonlyArray<ProjectStatus>,
  automation: GitAutomation
) => ({
  statuses: statuses.map((status) => ({
    ...status,
    setBy: GIT_AUTOMATION_EVENTS.filter(
      (event) => automation.rules[event] === status.slug
    )
  })),
  automationForwardOnly: automation.forwardOnly
})

const list_statuses = (_input: { orgSlug: string; projectSlug: string }) =>
  Effect.gen(function* () {
    const statuses = yield* (yield* ProjectStatuses).list()
    const scope = yield* ProjectScope
    if (!permits(scope.permissions, { github: ["read"] })) return { statuses }
    const automation = yield* (yield* ProjectGitAutomation).get()
    return statusesWithAutomation(statuses, automation)
  })

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

type GitStateInput = Readonly<{
  orgSlug: string
  projectSlug: string
  ticketId?: string
}>

const get_git_state = (input: GitStateInput) =>
  Effect.flatMap(TicketGit.TicketGit, (git) =>
    git.getGitState(input.ticketId, { reconcile: false })
  )

const sync_git_state = (input: GitStateInput) =>
  Effect.flatMap(TicketGit.TicketGit, (git) =>
    git.getGitState(input.ticketId, { reconcile: true })
  )

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
    const commands = yield* TicketCommands.TicketCommands
    const {
      orgSlug: _orgSlug,
      projectSlug: _projectSlug,
      body,
      ...payload
    } = input
    const sanitizedBody =
      body === undefined ? undefined : yield* sanitizeMcpBody(body)
    const created = yield* commands.create({
      ...payload,
      ...(sanitizedBody === undefined ? {} : { body: sanitizedBody })
    })
    return withBlocks(created)
  })

const templateBodyFor = (id: TicketId, template: TemplateKey) =>
  Effect.gen(function* () {
    const { orgSlug, slug } = yield* ProjectScope
    const queries = yield* TicketQueries.TicketQueries
    const library = yield* Library
    const expansion = yield* library.expandForCreate(orgSlug, slug, template)
    const [ticket, projectLibrary] = yield* Effect.all(
      [queries.get(id), library.projectLibrary()],
      { concurrency: 2 }
    )
    if (!isUntouchedBody(ticket.body, projectLibrary)) {
      return yield* new Validation({
        reason: `template_needs_body:${template}`
      })
    }
    return { body: expansion.body, expectedBody: ticket.body }
  })

const editedBody = (id: TicketId, edits: ReadonlyArray<TicketBodyEdit>) =>
  Effect.gen(function* () {
    const ticket = yield* (yield* TicketQueries.TicketQueries).get(id)
    const result = applyTicketBodyEdits(ticket.body, edits)
    if (!result.ok) {
      return yield* new Validation({
        reason: `edit_failed:${result.index}:${formatTicketBodyEditFailure(result.failure)}`
      })
    }
    return {
      body: yield* sanitizeMcpBody(result.body),
      expectedBody: ticket.body
    }
  })

const update_ticket = (
  input: {
    orgSlug: string
    projectSlug: string
    id: TicketId
    template?: TemplateKey | null
    edits?: ReadonlyArray<TicketBodyEdit>
    expectedUpdatedAt?: Date
  } & UpdateTicketInput
) =>
  Effect.gen(function* () {
    const commands = yield* TicketCommands.TicketCommands
    const {
      orgSlug: _orgSlug,
      projectSlug: _projectSlug,
      id,
      body,
      template,
      edits,
      expectedUpdatedAt,
      ...payload
    } = input
    if (edits !== undefined && (body !== undefined || template != null)) {
      return yield* new Validation({ reason: "edits_with_body_or_template" })
    }
    const write = Effect.gen(function* () {
      const pending =
        edits !== undefined
          ? yield* editedBody(id, edits)
          : body === undefined && template !== undefined && template !== null
            ? yield* templateBodyFor(id, template)
            : undefined
      const nextBody =
        body !== undefined ? yield* sanitizeMcpBody(body) : pending?.body
      return yield* commands.update(
        id,
        {
          ...payload,
          ...(nextBody === undefined ? {} : { body: nextBody })
        },
        undefined,
        { body: pending?.expectedBody, updatedAt: expectedUpdatedAt }
      )
    })
    const updated = yield* (
      edits === undefined
        ? write
        : write.pipe(
            Effect.retry({
              times: 2,
              while: (error) =>
                Predicate.isTagged(error, "Validation") &&
                error.reason === "ticket_body_changed"
            })
          )
    ).pipe(
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

const archive_ticket = (
  input: Tool.Parameters<typeof Tools.tools.archive_ticket>
) =>
  Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
    commands.archive(input.id, input.reason)
  ).pipe(
    Effect.catchTag("InvalidCommentBody", (error) =>
      Effect.fail(new Validation({ reason: error.reason }))
    )
  )

const restore_ticket = (
  input: Tool.Parameters<typeof Tools.tools.restore_ticket>
) =>
  Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
    commands.unarchive(input.id)
  )

const prepare_ticket_attachment = (
  input: Tool.Parameters<typeof Tools.tools.prepare_ticket_attachment>
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
    const git = yield* TicketGit.TicketGit
    const {
      orgSlug: _orgSlug,
      projectSlug: _projectSlug,
      id,
      ...payload
    } = input
    return yield* git.attachBranch(id, payload)
  })

type StackBranchToolInput = Readonly<{
  orgSlug: string
  projectSlug: string
  id: TicketId
}> &
  AttachBranchInput

const stack_branch = (input: StackBranchToolInput) =>
  Effect.flatMap(TicketGit.TicketGit, (git) =>
    git.stackBranch(input.id, { name: input.name })
  )

const unstack_branch = (input: StackBranchToolInput) =>
  Effect.flatMap(TicketGit.TicketGit, (git) =>
    git.unstackBranch(input.id, { name: input.name })
  )

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
    const maintenance = yield* TicketIndexMaintenance.TicketIndexMaintenance
    const project = yield* ticketIndex.projectFor(
      input.orgSlug,
      input.projectSlug
    )
    const summary = yield* maintenance.reconcileProject(project, {
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

export const ToolHandlersLive = Tools.toLayer(
  Effect.gen(function* () {
    const run = yield* toolRunner
    return Tools.of({
      me: run.user(me),
      list_orgs: run.user(list_orgs),
      get_org: run.org("membership", get_org),
      list_projects: run.org("membership", list_projects),
      get_project: run.project({ docs: ["read"] }, get_project),
      list_groups: run.project({ ticket: ["read"] }, list_groups),
      list_sprints: run.project({ ticket: ["read"] }, list_sprints),
      get_group: run.project({ ticket: ["read"] }, get_group),
      list_tickets: run.project({ ticket: ["read"] }, list_tickets),
      get_ticket: run.project({ ticket: ["read"] }, get_ticket),
      list_statuses: run.project({ ticket: ["read"] }, list_statuses),
      list_tags: run.project({ ticket: ["read"] }, list_tags),
      list_members: run.project({ ticket: ["read"] }, list_members),
      get_git_state: run.project({ github: ["read"] }, get_git_state),
      sync_git_state: run.project({ github: ["read"] }, sync_git_state),
      get_project_doc: run.project(
        { docs: ["read"], github: ["read"] },
        get_project_doc
      ),
      get_group_doc: run.project({ ticket: ["read"] }, get_group_doc),
      get_ticket_doc: run.project(
        { ticket: ["read"], github: ["read"] },
        get_ticket_doc
      ),
      list_blocks: run.project({ ticket: ["read"] }, list_blocks),
      list_templates: run.project({ ticket: ["read"] }, list_templates),
      create_ticket: run.project({ ticket: ["create"] }, create_ticket),
      update_ticket: run.project("membership", update_ticket),
      archive_ticket: run.project({ ticket: ["update"] }, archive_ticket),
      restore_ticket: run.project({ ticket: ["update"] }, restore_ticket),
      prepare_ticket_attachment: run.project(
        { attachment: ["upload"] },
        prepare_ticket_attachment
      ),
      create_comment: run.project({ comment: ["create"] }, create_comment),
      attach_branch: run.project({ github: ["write"] }, attach_branch),
      stack_branch: run.project({ github: ["write"] }, stack_branch),
      unstack_branch: run.project({ github: ["write"] }, unstack_branch),
      rebuild_ticket_index: run.project(
        { settings: ["manage"] },
        rebuild_ticket_index
      ),
      add_tickets_to_group: run.project("membership", add_tickets_to_group),
      create_sprint: run.project({ sprint: ["manage"] }, create_sprint),
      update_sprint: run.project({ sprint: ["manage"] }, update_sprint),
      complete_sprint: run.project({ sprint: ["manage"] }, complete_sprint)
    })
  })
)
