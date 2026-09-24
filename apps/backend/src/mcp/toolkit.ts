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
import * as Effect from "effect/Effect"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"
import { Tool, Toolkit } from "effect/unstable/ai"

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

export type McpHandlers<R> = {
  readonly [K in McpToolName]: (
    input: InputOf<K>
  ) => Effect.Effect<OutputOf<K>, HandlerError, R>
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

type AnyHandler<R> = (input: never) => Effect.Effect<unknown, HandlerError, R>

export const toToolkitHandlers = <R>(
  handlers: McpHandlers<R>
): Toolkit.HandlersFrom<McpToolsByName> =>
  Record.map(handlers, (handler, name) =>
    handle(name, handler as AnyHandler<R>)
  ) as unknown as Toolkit.HandlersFrom<McpToolsByName>
