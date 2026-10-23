import { Access } from "@pp/server-core/access/Access"
import { AttachmentUploads } from "@pp/server-core/attachments/AttachmentUploads"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import { Comments } from "@pp/server-core/comments/Comments"
import { GroupDocs } from "@pp/server-core/groups/GroupDocs"
import { Groups } from "@pp/server-core/groups/Groups"
import { Library } from "@pp/server-core/library/Library"
import { ProjectDocs } from "@pp/server-core/projects/ProjectDocs"
import { Projects } from "@pp/server-core/projects/Projects"
import { ProjectStatuses } from "@pp/server-core/projects/ProjectStatuses"
import { OrgStorage } from "@pp/server-core/storage/OrgStorage"
import { Tags } from "@pp/server-core/tags/Tags"
import { TicketDocs } from "@pp/server-core/tickets/TicketDocs"
import { TicketIndex } from "@pp/server-core/tickets/TicketIndex"
import { Tickets } from "@pp/server-core/tickets/Tickets"
import { McpTools, type McpToolName } from "@pp/shared"
import { Tool, Toolkit } from "effect/ai"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { mappedToolErrorText } from "./errorMap"

const handlerDependencies = [
  Access,
  AttachmentUploads,
  BetterAuth,
  Comments,
  GroupDocs,
  Groups,
  Library,
  OrgStorage,
  ProjectDocs,
  ProjectStatuses,
  Projects,
  Tags,
  TicketDocs,
  TicketIndex,
  Tickets
] as const

export type McpHandlerEnv = (typeof handlerDependencies)[number]["Identifier"]

type SpecOf<K extends McpToolName> = (typeof McpTools)[K]
type InputOf<K extends McpToolName> = Schema.Schema.Type<SpecOf<K>["input"]>
type OutputOf<K extends McpToolName> = Schema.Schema.Type<SpecOf<K>["output"]>

type HandlerError = { readonly _tag: string }

export class McpToolFailure extends Schema.TaggedError<McpToolFailure>()(
  "McpToolFailure",
  { message: Schema.String }
) {}

export type McpHandlers<R, E = HandlerError> = {
  readonly [K in McpToolName]: (
    input: InputOf<K>
  ) => Effect.Effect<OutputOf<K>, E, R>
}

const makeTool = <
  Name extends string,
  Parameters extends Schema.Top,
  Success extends Schema.Top
>(
  name: Name,
  spec: {
    readonly description: string
    readonly input: Parameters
    readonly output: Success
  }
) =>
  Tool.make(name, {
    description: spec.description,
    parameters: spec.input,
    success: spec.output,
    failure: McpToolFailure,
    failureMode: "error",
    dependencies: [...handlerDependencies]
  })

export const McpToolkit = Toolkit.make(
  makeTool("me", McpTools.me),
  makeTool("list_orgs", McpTools.list_orgs),
  makeTool("get_org", McpTools.get_org),
  makeTool("list_projects", McpTools.list_projects),
  makeTool("get_project", McpTools.get_project),
  makeTool("list_groups", McpTools.list_groups),
  makeTool("list_sprints", McpTools.list_sprints),
  makeTool("get_group", McpTools.get_group),
  makeTool("list_tickets", McpTools.list_tickets),
  makeTool("get_ticket", McpTools.get_ticket),
  makeTool("list_statuses", McpTools.list_statuses),
  makeTool("list_tags", McpTools.list_tags),
  makeTool("list_members", McpTools.list_members),
  makeTool("get_git_state", McpTools.get_git_state),
  makeTool("get_project_doc", McpTools.get_project_doc),
  makeTool("get_group_doc", McpTools.get_group_doc),
  makeTool("get_ticket_doc", McpTools.get_ticket_doc),
  makeTool("list_blocks", McpTools.list_blocks),
  makeTool("list_templates", McpTools.list_templates),
  makeTool("create_ticket", McpTools.create_ticket),
  makeTool("update_ticket", McpTools.update_ticket),
  makeTool("prepare_ticket_attachment", McpTools.prepare_ticket_attachment),
  makeTool("create_comment", McpTools.create_comment),
  makeTool("attach_branch", McpTools.attach_branch),
  makeTool("stack_branch", McpTools.stack_branch),
  makeTool("unstack_branch", McpTools.unstack_branch),
  makeTool("create_sprint", McpTools.create_sprint),
  makeTool("update_sprint", McpTools.update_sprint),
  makeTool("complete_sprint", McpTools.complete_sprint),
  makeTool("rebuild_ticket_index", McpTools.rebuild_ticket_index),
  makeTool("add_tickets_to_group", McpTools.add_tickets_to_group)
)

export type McpToolsByName = {
  readonly [K in McpToolName]: (typeof McpToolkit.tools)[K]
}

const isToolFailure = Schema.is(McpToolFailure)

export const toolFailure = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, McpToolFailure, R> =>
  effect.pipe(
    Effect.catch((error) => {
      if (isToolFailure(error)) return Effect.fail(error)
      const mapped = mappedToolErrorText(error)
      return mapped === undefined
        ? Effect.die(error)
        : Effect.fail(new McpToolFailure({ message: mapped }))
    })
  )

export const handle =
  <I, A, E, R>(
    name: McpToolName,
    handler: (input: I) => Effect.Effect<A, E, R>
  ) =>
  (input: I) =>
    toolFailure(handler(input)).pipe(Effect.withSpan(`mcp.tool.${name}`))

export const toToolkitHandlers = <R extends McpHandlerEnv>(
  handlers: McpHandlers<R>
): McpHandlers<R, McpToolFailure> => ({
  me: handle("me", handlers.me),
  list_orgs: handle("list_orgs", handlers.list_orgs),
  get_org: handle("get_org", handlers.get_org),
  list_projects: handle("list_projects", handlers.list_projects),
  get_project: handle("get_project", handlers.get_project),
  list_groups: handle("list_groups", handlers.list_groups),
  list_sprints: handle("list_sprints", handlers.list_sprints),
  get_group: handle("get_group", handlers.get_group),
  list_tickets: handle("list_tickets", handlers.list_tickets),
  get_ticket: handle("get_ticket", handlers.get_ticket),
  list_statuses: handle("list_statuses", handlers.list_statuses),
  list_tags: handle("list_tags", handlers.list_tags),
  list_members: handle("list_members", handlers.list_members),
  get_git_state: handle("get_git_state", handlers.get_git_state),
  get_project_doc: handle("get_project_doc", handlers.get_project_doc),
  get_group_doc: handle("get_group_doc", handlers.get_group_doc),
  get_ticket_doc: handle("get_ticket_doc", handlers.get_ticket_doc),
  list_blocks: handle("list_blocks", handlers.list_blocks),
  list_templates: handle("list_templates", handlers.list_templates),
  create_ticket: handle("create_ticket", handlers.create_ticket),
  update_ticket: handle("update_ticket", handlers.update_ticket),
  prepare_ticket_attachment: handle(
    "prepare_ticket_attachment",
    handlers.prepare_ticket_attachment
  ),
  create_comment: handle("create_comment", handlers.create_comment),
  attach_branch: handle("attach_branch", handlers.attach_branch),
  stack_branch: handle("stack_branch", handlers.stack_branch),
  unstack_branch: handle("unstack_branch", handlers.unstack_branch),
  create_sprint: handle("create_sprint", handlers.create_sprint),
  update_sprint: handle("update_sprint", handlers.update_sprint),
  complete_sprint: handle("complete_sprint", handlers.complete_sprint),
  rebuild_ticket_index: handle(
    "rebuild_ticket_index",
    handlers.rebuild_ticket_index
  ),
  add_tickets_to_group: handle(
    "add_tickets_to_group",
    handlers.add_tickets_to_group
  )
})
