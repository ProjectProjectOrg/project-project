import * as Schema from "effect/Schema"
import { NotFound, Unauthorized } from "../errors"
import { Org } from "../schemas/Org"
import { Member, Project, ProjectDetail, Slug } from "../schemas/Project"
import { Group, GroupDetail, GroupId } from "../schemas/Group"
import { Ticket, TicketDetail, TicketId } from "../schemas/Ticket"
import { Tag } from "../schemas/Tag"
import { GitStatesResponse } from "../schemas/GitState"
import { DocFile } from "./DocFile"
import { MeOutput } from "./MeOutput"
import { Page, Pagination } from "./Pagination"
import { TicketFilter } from "./filters/Ticket"
import { GroupFilter } from "./filters/Group"
import { SprintState } from "../sprintLogic"

export * from "./Pagination"
export * from "./cursor"
export * from "./DocFile"
export * from "./MeOutput"
export * from "./filters/Ticket"
export * from "./filters/Group"

export interface McpToolSpec<
  Input extends Schema.Schema.Any,
  Output extends Schema.Schema.Any,
  Errors extends ReadonlyArray<Schema.Schema.Any>,
> {
  readonly description: string
  readonly input: Input
  readonly output: Output
  readonly errors: Errors
}

export const McpTools = {
  me: {
    description: "Identity of the authed user and their org/project roles.",
    input: Schema.Struct({}),
    output: MeOutput,
    errors: [Unauthorized] as const
  },
  list_orgs: {
    description: "List organizations the caller belongs to.",
    input: Pagination,
    output: Page(Org),
    errors: [Unauthorized] as const
  },
  get_org: {
    description: "Fetch one organization by slug.",
    input: Schema.Struct({ orgSlug: Slug }),
    output: Org,
    errors: [Unauthorized, NotFound] as const
  },
  list_projects: {
    description: "List projects in an org the caller can see.",
    input: Schema.Struct({ orgSlug: Slug, ...Pagination.fields }),
    output: Page(Project),
    errors: [Unauthorized, NotFound] as const
  },
  get_project: {
    description:
      "Fetch one project including github connection, members, and raw markdown body.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug }),
    output: ProjectDetail,
    errors: [Unauthorized, NotFound] as const
  },
  list_groups: {
    description:
      "List groups (sprints, epics, milestones) in a project, optionally " +
      "filtered by kind or active state. `active` is a sprint-only filter " +
      "(non-sprint groups are excluded when it is set); `active: true` keeps " +
      "sprints that are currently running, `active: false` keeps planned or " +
      "completed sprints.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      filter: Schema.optional(GroupFilter),
      ...Pagination.fields
    }),
    output: Page(Group),
    errors: [Unauthorized, NotFound] as const
  },
  list_sprints: {
    description:
      "List sprints in a project, optionally narrowed to a state. " +
      "`state: 'active'` returns sprints that are currently running; " +
      "'planned' returns future sprints; 'completed' returns past sprints; " +
      "omitted returns all sprints. Uses the same active/planned/completed " +
      "logic as the app's sprint page.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      state: Schema.optional(SprintState),
      ...Pagination.fields
    }),
    output: Page(Group),
    errors: [Unauthorized, NotFound] as const
  },
  get_group: {
    description: "Fetch one group including raw markdown body.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug, id: GroupId }),
    output: GroupDetail,
    errors: [Unauthorized, NotFound] as const
  },
  list_tickets: {
    description:
      "List tickets in a project with optional server-side filtering.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      filter: Schema.optional(TicketFilter),
      ...Pagination.fields
    }),
    output: Page(Ticket),
    errors: [Unauthorized, NotFound] as const
  },
  get_ticket: {
    description: "Fetch one ticket including raw markdown body.",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug, id: TicketId }),
    output: TicketDetail,
    errors: [Unauthorized, NotFound] as const
  },
  list_tags: {
    description: "List tags defined in a project.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      ...Pagination.fields
    }),
    output: Page(Tag),
    errors: [Unauthorized, NotFound] as const
  },
  list_members: {
    description: "List members of a project with their role.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      ...Pagination.fields
    }),
    output: Page(Member),
    errors: [Unauthorized, NotFound] as const
  },
  get_git_state: {
    description:
      "Fetch git / PR state for a project, optionally narrowed to one ticket.",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      ticketId: Schema.optional(TicketId)
    }),
    output: GitStatesResponse,
    errors: [Unauthorized, NotFound] as const
  },
  get_project_doc: {
    description:
      "Raw markdown source of a project's project.md (frontmatter + body).",
    input: Schema.Struct({ orgSlug: Slug, projectSlug: Slug }),
    output: DocFile,
    errors: [Unauthorized, NotFound] as const
  },
  get_group_doc: {
    description:
      "Raw markdown source of a group's .md file (frontmatter + body).",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      id: GroupId
    }),
    output: DocFile,
    errors: [Unauthorized, NotFound] as const
  },
  get_ticket_doc: {
    description:
      "Raw markdown source of a ticket's .md file (frontmatter + body).",
    input: Schema.Struct({
      orgSlug: Slug,
      projectSlug: Slug,
      id: TicketId
    }),
    output: DocFile,
    errors: [Unauthorized, NotFound] as const
  }
} as const satisfies Record<string, McpToolSpec<any, any, any>>

export type McpToolName = keyof typeof McpTools
