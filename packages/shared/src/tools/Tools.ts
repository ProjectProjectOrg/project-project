import { Tool, Toolkit } from "effect/ai"
import * as Context from "effect/Context"
import * as Schema from "effect/Schema"

import {
  AttachmentTooLarge,
  AttachmentTypeRejected,
  StorageConfigMissing,
  StorageError,
  StorageNotConnected,
  BranchNotFound,
  Conflict,
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  MentionInvalid,
  NotFound,
  RateLimited,
  RepoGone,
  SprintCompletedImmutable,
  Unauthorized,
  Validation
} from "../errors"
import { GroupFilter, TicketListQuery } from "../filters"
import { Page, Pagination } from "../Pagination"
import {
  ATTACHMENT_MAX_BYTES,
  OrgStorageStatus,
  PrepareAttachmentInput,
  PrepareAttachmentResult
} from "../schemas/Attachment"
import { Comment, CreateCommentInput } from "../schemas/Comment"
import { GitAutomationEvent } from "../schemas/GitAutomation"
import { AttachBranchInput, GitStatesResponse } from "../schemas/GitState"
import {
  CompleteSprintInput,
  CompleteSprintOutput,
  CreateGroupInput,
  Group,
  GroupDetail,
  GroupId,
  UpdateGroupInput,
  UpdateGroupTicketsOutput
} from "../schemas/Group"
import {
  BlockKey,
  LibraryContent,
  LibraryDescription,
  LibraryName,
  LibraryOrigin,
  TemplateKey
} from "../schemas/Library"
import { Org } from "../schemas/Org"
import { Member, Project, ProjectDetail, Slug } from "../schemas/Project"
import { ProjectStatus } from "../schemas/Status"
import { Tag, TagName } from "../schemas/Tag"
import {
  ArchiveTicketInput,
  CreateTicketInput,
  Ticket,
  TicketDetail,
  TicketId,
  TicketPriority,
  TicketType,
  UpdateTicketInput
} from "../schemas/Ticket"
import { SprintState } from "../sprintLogic"
import { TicketBodyEdits } from "../ticketBodyEdits"
import { DocFile } from "./DocFile"
import { MeOutput } from "./MeOutput"
import { RebuildTicketIndexOutput } from "./RebuildTicketIndexOutput"

const TicketDetailWithBlocks = Schema.Struct({
  ...TicketDetail.fields,
  blocks: Schema.optional(
    Schema.Array(
      Schema.Struct({
        type: Schema.String,
        sync: Schema.Boolean,
        content: Schema.String
      })
    )
  )
})

const ESTIMATE_GUIDE =
  "An estimate in another unit than the project's, or any estimate while " +
  "`estimation` is `off`, fails with `Validation`."

const PARENT_GUIDE =
  "`parent` is the id of an epic, making the ticket one of its tickets, " +
  "or of another ticket, making it a sub-ticket. The hierarchy is at " +
  "most epic > ticket > sub-ticket: an epic can't have a parent, a " +
  "sub-ticket can't have sub-tickets, and a ticket with sub-tickets can " +
  "only go under an epic."

const BLOCK_FORMAT_POINTER =
  "The named-block format is described in the server instructions."

const MENTION_GUIDE =
  "Mentions are markdown links: `[Label](mention:user/<userId>)` for a " +
  "project member (ids from `list_members`) and " +
  "`[Label](mention:ticket/<T-N>)` for a ticket in the same project; " +
  "unknown or malformed mentions fail with `MentionInvalid`."

const orgSlug = Slug.annotate({
  description: "The organization slug, from `list_orgs`."
})
const projectSlug = Slug.annotate({
  description: "The project slug, from `list_projects`."
})
const ticketId = TicketId.annotate({
  description: "A ticket id such as `T-12`."
})
const groupId = GroupId.annotate({ description: "A group id such as `G-3`." })

const StatusWithAutomation = Schema.Struct({
  ...ProjectStatus.fields,
  setBy: Schema.optional(Schema.Array(GitAutomationEvent))
})

export type ToolCliShape = Readonly<{
  command: readonly [string, ...ReadonlyArray<string>]
  args?: ReadonlyArray<string>
}>

export class ToolCli extends Context.Service<ToolCli, ToolCliShape>()(
  "@pp/shared/tools/Tools/ToolCli"
) {}

export class ToolFailure extends Schema.TaggedError<ToolFailure>()(
  "ToolFailure",
  { error: Schema.String, message: Schema.String }
) {}

export const ToolErrors = [
  Unauthorized,
  NotFound,
  Forbidden,
  Conflict,
  Validation,
  MentionInvalid,
  AttachmentTooLarge,
  AttachmentTypeRejected,
  StorageNotConnected,
  StorageConfigMissing,
  StorageError,
  BranchNotFound,
  GitHubTokenExpired,
  GitHubScopeInsufficient,
  RepoGone,
  RateLimited,
  GitHubError,
  SprintCompletedImmutable
] as const

export type ToolError = Schema.Schema.Type<(typeof ToolErrors)[number]>

export type ToolHints =
  | Readonly<{ readOnly: true; openWorld: boolean }>
  | Readonly<{
      readOnly: false
      destructive: boolean
      idempotent: boolean
      openWorld: boolean
    }>

const reads: ToolHints = { readOnly: true, openWorld: false }

const defineTool = <
  const Name extends string,
  Parameters extends Schema.Top,
  Success extends Schema.Top
>(
  name: Name,
  spec: Readonly<{
    title: string
    hints: ToolHints
    description: string
    cli: ToolCliShape
    parameters: Parameters
    success: Success
  }>
) =>
  Tool.make(name, {
    description: spec.description,
    parameters: spec.parameters,
    success: spec.success,
    failure: ToolFailure,
    failureMode: "error"
  })
    .annotate(ToolCli, spec.cli)
    .annotate(Tool.Title, spec.title)
    .annotate(Tool.Readonly, spec.hints.readOnly)
    .annotate(
      Tool.Destructive,
      spec.hints.readOnly ? false : spec.hints.destructive
    )
    .annotate(
      Tool.Idempotent,
      spec.hints.readOnly ? true : spec.hints.idempotent
    )
    .annotate(Tool.OpenWorld, spec.hints.openWorld)

export const Tools = Toolkit.make(
  defineTool("me", {
    title: "Who am I",
    hints: reads,
    description:
      "Who you are: the authenticated user, including the `id` to use " +
      "when assigning yourself to a ticket, and each org you belong to " +
      "with your role there. Call this first when you don't know which " +
      "org to work in.",
    cli: { command: ["me"] },
    parameters: Schema.Record(Schema.String, Schema.Never),
    success: MeOutput
  }),
  defineTool("list_orgs", {
    title: "List organizations",
    hints: reads,
    description:
      "List the organizations you belong to. Each `slug` is the `orgSlug` " +
      "other tools take. Paginated: pass `nextCursor` back as `cursor`.",
    cli: { command: ["orgs", "list"] },
    parameters: Pagination,
    success: Page(Org)
  }),
  defineTool("get_org", {
    title: "Get organization",
    hints: reads,
    description:
      "Fetch one organization by slug, including its attachment storage " +
      "status (`not_connected`, `active` or `broken`) and `lastCheckedAt` " +
      "(null when never checked). This is the stored result of the last " +
      "check, not a live test, and uploads still validate storage on " +
      "their own. If storage is not connected or broken, the user has to " +
      "fix it in organization settings before `prepare_ticket_attachment` " +
      "can work.",
    cli: { command: ["orgs", "get"] },
    parameters: Schema.Struct({ orgSlug }),
    success: Schema.Struct({
      ...Org.fields,
      storage: Schema.Struct({
        status: OrgStorageStatus.fields.status,
        lastCheckedAt: OrgStorageStatus.fields.lastCheckedAt
      })
    })
  }),
  defineTool("list_projects", {
    title: "List projects",
    hints: reads,
    description:
      "List the projects in an org that you can see. Each `slug` is the " +
      "`projectSlug` other tools take, and `key` is the prefix of its " +
      "ticket ids (key `T` gives `T-12`). Paginated: pass `nextCursor` " +
      "back as `cursor`.",
    cli: { command: ["projects", "list"] },
    parameters: Schema.Struct({ orgSlug, ...Pagination.fields }),
    success: Page(Project)
  }),
  defineTool("get_project", {
    title: "Get project",
    hints: reads,
    description:
      "Fetch one project: its name and ticket `key`, the GitHub " +
      "connection (`github`, null when no repository is connected, in " +
      "which case git automation never runs), the estimation unit " +
      "(`estimation`, see `create_ticket`), members, your `permissions`, " +
      "and `body`, the project's own markdown description. Read `body` " +
      "for background before writing or refining tickets.",
    cli: { command: ["projects", "get"] },
    parameters: Schema.Struct({ orgSlug, projectSlug }),
    success: ProjectDetail
  }),
  defineTool("list_groups", {
    title: "List groups",
    hints: reads,
    description:
      "List a project's groups: sprints, epics, milestones and other sets " +
      "of tickets (ids like `G-3`). For sprints alone, `list_sprints` is " +
      "simpler. Paginated: pass `nextCursor` back as `cursor`.",
    cli: { command: ["groups", "list"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      filter: Schema.optional(GroupFilter).annotate({
        description:
          "`{ kind?, active? }`; non-sprint groups are excluded when `active` is set."
      }),
      ...Pagination.fields
    }),
    success: Page(Group)
  }),
  defineTool("list_sprints", {
    title: "List sprints",
    hints: reads,
    description:
      "List a project's sprints, using the same rules as the app's sprint " +
      "page. Use this to find the current sprint, and `list_groups` for " +
      "epics and milestones. Paginated: pass `nextCursor` back as `cursor`.",
    cli: { command: ["sprints", "list"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      state: Schema.optional(SprintState).annotate({
        description:
          "`active` (running now), `planned` (future) or `completed` (past); omit for all."
      }),
      ...Pagination.fields
    }),
    success: Page(Group)
  }),
  defineTool("get_group", {
    title: "Get group",
    hints: reads,
    description:
      "Fetch one group (sprint, epic or milestone) by id (`G-N`): its " +
      "kind, dates, member ticket ids (`tickets`) and markdown `body`. To " +
      "read those tickets, call `list_tickets` with `groupId`.",
    cli: { command: ["groups", "get"], args: ["id"] },
    parameters: Schema.Struct({ orgSlug, projectSlug, id: groupId }),
    success: GroupDetail
  }),
  defineTool("list_tickets", {
    title: "List tickets",
    hints: reads,
    description:
      "List a project's tickets, newest first unless `sort` says " +
      "otherwise. Items are summaries without the body; use `get_ticket` " +
      "for a ticket's description. Filters combine with AND, and a list " +
      "filter matches any of its values. Items carry `parent`, " +
      "`subTicketCount` and `subTicketDoneCount`. Ticket `status` values " +
      "are slugs; use the label from `list_statuses` in conversation. " +
      "Paginated: pass `nextCursor` back as `cursor`.",
    cli: { command: ["tickets", "list"] },
    parameters: TicketListQuery.pipe(
      Schema.fieldsAssign({
        orgSlug,
        projectSlug,
        limit: Pagination.fields.limit
      })
    ),
    success: Page(Ticket)
  }),
  defineTool("get_ticket", {
    title: "Get ticket",
    hints: reads,
    description:
      "Fetch one ticket with what you need to work on it: its status " +
      "slug, assignees, branch, `stack`, pull request state (`gitState`) " +
      "and `body`, the markdown description. Synced blocks in `body` are " +
      "already resolved to their current definition text (ticks preserved " +
      "per ticket), and `blocks` splits `body` into its named blocks by " +
      "`type`, so you can read one section without parsing the markdown. " +
      "Read a ticket before updating it: `update_ticket` replaces the " +
      "whole body. Use the label from `list_statuses` when naming its " +
      "status in conversation.",
    cli: { command: ["tickets", "get"], args: ["id"] },
    parameters: Schema.Struct({ orgSlug, projectSlug, id: ticketId }),
    success: TicketDetailWithBlocks
  }),
  defineTool("list_statuses", {
    title: "List statuses",
    hints: reads,
    description:
      "List the project's statuses in workflow order. Each has a stable " +
      "`slug` (what ticket tools take), a `label` (what to say in " +
      "conversation) and an optional `description` of what the status " +
      "means for the team; follow it when deciding whether a ticket is " +
      "ready to start or finished. `setBy` lists the git events that move " +
      "a ticket into the status on their own: `branch_linked`, " +
      "`pr_draft_opened`, `pr_opened`, `pr_merged` (every pull request on " +
      "the ticket merged), `pr_closed` and `branch_deleted`. Automation " +
      "runs only while the project has a GitHub repository connected " +
      "(`get_project`), and when `automationForwardOnly` is true it never " +
      "moves a ticket backwards. Don't set a status by hand that " +
      "automation will set for you. `setBy` and `automationForwardOnly` " +
      "are left out when you can't read the project's GitHub settings.",
    cli: { command: ["statuses", "list"] },
    parameters: Schema.Struct({ orgSlug, projectSlug }),
    success: Schema.Struct({
      statuses: Schema.Array(StatusWithAutomation),
      automationForwardOnly: Schema.optional(Schema.Boolean)
    })
  }),
  defineTool("list_tags", {
    title: "List tags",
    hints: reads,
    description:
      "List the tags defined in a project. Tickets can only use existing " +
      "tags: `create_ticket` and `update_ticket` fail on an unknown name. " +
      "Paginated: pass `nextCursor` back as `cursor`.",
    cli: { command: ["tags", "list"] },
    parameters: Schema.Struct({ orgSlug, projectSlug, ...Pagination.fields }),
    success: Page(Tag)
  }),
  defineTool("list_members", {
    title: "List members",
    hints: reads,
    description:
      "List the project's members with their role. Use a member's `id` in " +
      "ticket `assignees` and in `[Label](mention:user/<id>)` mentions. " +
      "Paginated: pass `nextCursor` back as `cursor`.",
    cli: { command: ["members", "list"] },
    parameters: Schema.Struct({ orgSlug, projectSlug, ...Pagination.fields }),
    success: Page(Member)
  }),
  defineTool("get_git_state", {
    title: "Check Git state",
    hints: { readOnly: true, openWorld: true },
    description:
      "Fetch GitHub state for a project's tickets, keyed by ticket id in " +
      "`states`, or for one ticket with `ticketId`. Each state's `tag` " +
      "says where the ticket stands: `no_branch`, `branch_pending` or " +
      "`pr_pending` (still being set up), `branch_no_pr`, `pr_open` (with " +
      "`draft` and `checks`: `passing`, `failing`, `pending`, `neutral` " +
      "or `none`), `pr_merged`, `pr_closed`, or `stale_branch` (the " +
      "linked branch no longer exists on GitHub). `stacks` holds the pull " +
      "request of each stacked layer, and `repoStatus` and `tokenStatus` " +
      "report problems with the repository connection. Use this to check " +
      "pull requests and CI across a project; `get_ticket` carries the " +
      "same `gitState` for a single ticket. This only reads: it never " +
      "links branches or moves statuses. `sync_git_state` does.",
    cli: { command: ["git", "state"], args: ["ticketId"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      ticketId: Schema.optional(TicketId).annotate({
        description: "Limit the result to one ticket."
      })
    }),
    success: GitStatesResponse
  }),
  defineTool("sync_git_state", {
    title: "Sync Git state",
    hints: {
      readOnly: false,
      destructive: true,
      idempotent: true,
      openWorld: true
    },
    description:
      "Fetch GitHub state for a project's tickets and run git automation " +
      "on it: link branches and pull requests that name a ticket, stack " +
      "layers, mark deleted branches stale and move statuses per `setBy` " +
      "in `list_statuses`. The app does the same whenever it shows git " +
      "state, so call this only when you need the result now, for " +
      "example right after opening a pull request. Returns the same " +
      "shape as `get_git_state`; `transitioned` lists the status moves " +
      "and `changedTicketIds` the tickets written.",
    cli: { command: ["git", "sync"], args: ["ticketId"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      ticketId: Schema.optional(TicketId).annotate({
        description: "Limit the result to one ticket."
      })
    }),
    success: GitStatesResponse
  }),
  defineTool("get_project_doc", {
    title: "Get project document",
    hints: reads,
    description:
      "Raw source of the project's `project.md`: YAML frontmatter and " +
      "markdown body, exactly as stored. `get_project` returns the same " +
      "data parsed, plus members and permissions; use this when you need " +
      "the file verbatim.",
    cli: { command: ["projects", "doc"] },
    parameters: Schema.Struct({ orgSlug, projectSlug }),
    success: DocFile
  }),
  defineTool("get_group_doc", {
    title: "Get group document",
    hints: reads,
    description:
      "Raw source of a group's markdown file: YAML frontmatter and body, " +
      "exactly as stored. `get_group` returns the same data parsed; use " +
      "this when you need the file verbatim.",
    cli: { command: ["groups", "doc"], args: ["id"] },
    parameters: Schema.Struct({ orgSlug, projectSlug, id: groupId }),
    success: DocFile
  }),
  defineTool("get_ticket_doc", {
    title: "Get ticket document",
    hints: reads,
    description:
      "Raw source of a ticket's markdown file: YAML frontmatter and body, " +
      "exactly as stored. Prefer `get_ticket`, which returns the parsed " +
      "ticket with resolved blocks and git state; use this when you need " +
      "the file verbatim.",
    cli: { command: ["tickets", "doc"], args: ["id"] },
    parameters: Schema.Struct({ orgSlug, projectSlug, id: ticketId }),
    success: DocFile
  }),
  defineTool("list_blocks", {
    title: "List blocks",
    hints: reads,
    description:
      "List the blocks available to a project: the org's and the " +
      "project's own, with project overriding org. Built-in starting " +
      "points only count once the org or project has adopted them. Each " +
      "entry's `content` is the block's canonical markdown, exactly as it " +
      'should appear inside `<block type="key">…</block>` in a ticket ' +
      "body, including any trailing `{{hint}}` placeholder text (e.g. " +
      "`**Expected:**{{what should have happened}}`) showing what to fill " +
      "in. Hints are never written into a ticket: replace each one with " +
      "real content, or delete the hint text and leave the rest of the " +
      "line as-is. Hidden blocks are omitted. `sync` true means the block " +
      "is a shared, managed definition. " +
      BLOCK_FORMAT_POINTER,
    cli: { command: ["blocks", "list"] },
    parameters: Schema.Struct({ orgSlug, projectSlug }),
    success: Schema.Array(
      Schema.Struct({
        key: BlockKey,
        name: LibraryName,
        description: LibraryDescription,
        sync: Schema.Boolean,
        origin: LibraryOrigin,
        content: LibraryContent
      })
    )
  }),
  defineTool("list_templates", {
    title: "List templates",
    hints: reads,
    description:
      "List the templates available to a project: the org's and the " +
      "project's own, with project overriding org. Each entry's `body` is " +
      "the template fully expanded, its block references resolved to " +
      "their current definitions, with `{{hint}}` placeholders kept so " +
      "you can see what to fill in. Pass the same `key` as `template` to " +
      "`create_ticket` to have the server do the expansion (with hints " +
      "stripped) when it creates the ticket. `isDefaultFor` lists the " +
      "ticket types the app preselects this template for; the server " +
      "never applies it on its own, so pass `template` explicitly. When " +
      "`isDefaultFor` names exactly one type, creating from the template " +
      "without an explicit `type` gives the ticket that type. Hidden " +
      "templates are omitted. " +
      BLOCK_FORMAT_POINTER,
    cli: { command: ["templates", "list"] },
    parameters: Schema.Struct({ orgSlug, projectSlug }),
    success: Schema.Array(
      Schema.Struct({
        key: TemplateKey,
        name: LibraryName,
        description: LibraryDescription,
        priority: Schema.NullOr(TicketPriority),
        tags: Schema.Array(TagName),
        body: Schema.String,
        isDefaultFor: Schema.Array(TicketType)
      })
    )
  }),
  defineTool("create_ticket", {
    title: "Create ticket",
    hints: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false
    },
    description:
      "Create a ticket in a project. Follow the ticket-writing guidance " +
      "in the server instructions: check for an existing ticket first, " +
      "start from a template, and write a title and summary that someone " +
      "without your context can follow.\n\n" +
      "`title` is required; every other field has a default. " +
      PARENT_GUIDE +
      " An unknown tag name fails. " +
      ESTIMATE_GUIDE +
      "\n\n" +
      "With a template and no `body`, the server expands the template " +
      "into the body with hints stripped. With both, `body` wins and the " +
      "template only supplies defaults: its priority and tags, and its " +
      "type when `isDefaultFor` names exactly one (an explicit `type` " +
      "always wins).\n\n" +
      "A malformed block in `body` fails with `Validation` naming the " +
      "line. " +
      BLOCK_FORMAT_POINTER +
      " " +
      MENTION_GUIDE +
      " Returns the full ticket, with the same `blocks` breakdown as " +
      "`get_ticket`.",
    cli: { command: ["tickets", "create"], args: ["title"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      ...CreateTicketInput.fields
    }),
    success: TicketDetailWithBlocks
  }),
  defineTool("update_ticket", {
    title: "Update ticket",
    hints: {
      readOnly: false,
      destructive: true,
      idempotent: false,
      openWorld: false
    },
    description:
      "Update a ticket. Every field is optional and omitted fields are " +
      "left unchanged. " +
      PARENT_GUIDE +
      " A ticket with children can't switch between epic and another " +
      "type. " +
      ESTIMATE_GUIDE +
      "\n\n" +
      "`edits` changes part of the description without resending it, and " +
      "is the way to make small changes such as ticking an acceptance " +
      "criterion or adding an attachment. Each entry runs in order " +
      "against the current stored description: " +
      '`{ kind: "replace", oldText, newText, replaceAll? }` replaces ' +
      "exact text (it must match once, or set `replaceAll`); " +
      '`{ kind: "append", text }` adds markdown at the end; ' +
      '`{ kind: "replace_block", type, content }` replaces the content ' +
      "of the one named block of that type, heading included, keeping its " +
      "tags (synced blocks can't be replaced). If any edit fails, nothing " +
      "is saved and `Validation` names the edit's index. `edits` can't be " +
      "combined with `body` or `template`.\n\n" +
      "For a rewrite, read the current body with `get_ticket`, edit it, " +
      "and send it back in full as `body` so nothing is lost. Fill named " +
      "blocks in rather than replacing them; a malformed block fails " +
      "with `Validation` naming the line. " +
      BLOCK_FORMAT_POINTER +
      " " +
      MENTION_GUIDE +
      "\n\n" +
      "A `template` only shapes the body; type, priority and tags change " +
      "only when passed. Without `body`, the server expands the template " +
      "(hints stripped) into the description, but only while the " +
      "description is empty or still an untouched template; otherwise it " +
      "fails with `Validation`, and you fill in the template's body from " +
      "`list_templates` and pass it as `body`. When both are given, " +
      "`body` wins.\n\n" +
      "The branch can't be changed here; use `attach_branch`. Returns the " +
      "full ticket after the update, with the same `blocks` breakdown as " +
      "`get_ticket`.",
    cli: { command: ["tickets", "update"], args: ["id"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      id: ticketId,
      ...UpdateTicketInput.fields,
      template: Schema.optional(Schema.NullOr(TemplateKey)).annotate({
        description:
          "A template key from `list_templates` to expand into the body."
      }),
      edits: Schema.optional(TicketBodyEdits).annotate({
        description:
          'Edits to the description, run in order: `{ kind: "replace", oldText, newText, replaceAll? }`, ' +
          '`{ kind: "append", text }` or `{ kind: "replace_block", type, content }`. ' +
          "Can't be combined with `body` or `template`."
      }),
      expectedUpdatedAt: Schema.optional(Schema.DateFromString).annotate({
        description:
          "The `updatedAt` you read; the update fails with `Conflict` if the ticket changed since."
      })
    }),
    success: TicketDetailWithBlocks
  }),
  defineTool("archive_ticket", {
    title: "Archive ticket",
    hints: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      openWorld: false
    },
    description:
      "Archive a ticket once it is no longer needed, for example after " +
      "folding it into another ticket or superseding it. Archiving is not " +
      "deletion: the ticket keeps its id, description, comments and " +
      "history, drops out of `list_tickets` and boards, and " +
      "`restore_ticket` brings it back unchanged. Permanent deletion is " +
      "left to people in the app. Sub-tickets are not archived with their " +
      "parent.\n\n" +
      "`reason` is recorded on the ticket's activity, attributed to you; " +
      "name the ticket that replaces it, e.g. " +
      "`Folded into [T-238](mention:ticket/T-238)`. " +
      MENTION_GUIDE +
      " Archiving an archived ticket changes nothing and keeps its " +
      "original reason. Returns the ticket with `archivedAt` set.",
    cli: { command: ["tickets", "archive"], args: ["id"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      id: ticketId,
      reason: ArchiveTicketInput.fields.reason.annotate({
        description:
          "Why the ticket is archived, as markdown up to 20,000 characters."
      })
    }),
    success: TicketDetail
  }),
  defineTool("restore_ticket", {
    title: "Restore ticket",
    hints: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      openWorld: false
    },
    description:
      "Restore an archived ticket so it shows in `list_tickets` and " +
      "boards again, with its status, description and history as they " +
      "were. Find archived tickets with `list_tickets` and `archived` set " +
      "to true, and read one with `get_ticket`. Restoring a " +
      "ticket that isn't archived changes nothing. Returns the ticket " +
      "with `archivedAt` null.",
    cli: { command: ["tickets", "restore"], args: ["id"] },
    parameters: Schema.Struct({ orgSlug, projectSlug, id: ticketId }),
    success: TicketDetail
  }),
  defineTool("prepare_ticket_attachment", {
    title: "Prepare attachment upload",
    hints: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: true
    },
    description:
      "Prepare an attachment upload for an existing ticket. Requires organization storage " +
      `and project membership. Accepts non-empty files up to ${ATTACHMENT_MAX_BYTES / (1024 * 1024)} MiB; ` +
      "the server measures the file size. " +
      "Returns ready-to-paste markdown using the filename as its label and the permanent URL with display parameters. " +
      "POST the local file to the returned uploadUrl: curl --fail-with-body --request POST " +
      "--data-binary '@/path/to/file' --header 'Content-Type: <contentType>' '<uploadUrl>'. " +
      "The HTTP response returns the committed id, permanent url, filename, and contentType; " +
      "no separate commit call is needed. The uploadUrl is a temporary credential: " +
      "use it only for the upload, and prepare again if it expires. Retrying a completed " +
      "upload returns its metadata without replacing its bytes. After a successful upload, " +
      "add the returned markdown with an update_ticket append edit. " +
      "Only insert markdown after the upload succeeds. Never save uploadUrl in markdown. " +
      "Does not modify the description automatically. Do not send file paths or base64 as " +
      "file content. If storage is not connected, connect it in organization settings and retry.",
    cli: {
      command: ["attachments", "prepare"],
      args: ["ticketId", "filename"]
    },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      ticketId,
      filename: PrepareAttachmentInput.fields.filename,
      contentType: PrepareAttachmentInput.fields.contentType,
      density: Schema.optional(Schema.Literals(["rich", "compact"])).annotate({
        description: "`rich` (default, expanded) or `compact` (inline chip)."
      }),
      width: Schema.optional(
        Schema.Finite.pipe(
          Schema.check(Schema.isInt()),
          Schema.check(Schema.isGreaterThan(0))
        )
      ).annotate({
        description:
          "Display width in pixels for expanded images; compact images keep it for later expansion. No effect on files."
      })
    }),
    success: Schema.Struct({
      ...PrepareAttachmentResult.fields,
      markdown: Schema.String
    })
  }),
  defineTool("create_comment", {
    title: "Comment on ticket",
    hints: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false
    },
    description:
      "Add a comment to a ticket, attributed to you. `body` is CommonMark " +
      "markdown, 1–20,000 characters. Use it to record what you did, for " +
      "example after opening a pull request: what changed, the PR link, " +
      "and anything a reviewer should know. " +
      MENTION_GUIDE +
      " Returns the created comment.",
    cli: { command: ["tickets", "comment"], args: ["ticketId"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      ticketId,
      ...CreateCommentInput.fields
    }),
    success: Comment
  }),
  defineTool("attach_branch", {
    title: "Attach branch",
    hints: {
      readOnly: false,
      destructive: true,
      idempotent: true,
      openWorld: true
    },
    description:
      "Link a GitHub branch to a ticket as the ticket's own branch. " +
      "Create and push the branch with your own git tooling first: the " +
      "name is checked against the project's connected repository, and a " +
      "branch that doesn't exist fails with `BranchNotFound`. Put the " +
      "ticket id in the branch name (e.g. `feat/T-12-short-description`).\n\n" +
      "Opening a pull request also links its branch automatically when " +
      "the PR mentions exactly one ticket, through the branch name, the " +
      "PR title or a closing keyword such as `Closes T-12` in its body. " +
      "Call this tool to link the branch before a pull request exists, or " +
      "when the PR doesn't mention the ticket.\n\n" +
      "This replaces any branch the ticket already has (`branch` in " +
      "`get_ticket`); to add branches on top of it for stacked pull " +
      "requests, use `stack_branch`. Linking can move the ticket's status " +
      "when a status is set by `branch_linked` (see `list_statuses`). " +
      "Returns the updated ticket.",
    cli: { command: ["branches", "attach"], args: ["id", "name"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      id: ticketId,
      ...AttachBranchInput.fields
    }),
    success: TicketDetail
  }),
  defineTool("stack_branch", {
    title: "Stack branch",
    hints: {
      readOnly: false,
      destructive: true,
      idempotent: true,
      openWorld: true
    },
    description:
      "Add a GitHub branch to the stack on top of a ticket's own branch, " +
      "for work split into stacked pull requests (e.g. with `gh stack`). " +
      "Call it once per layer above the ticket's branch, bottom to top. " +
      "The ticket needs a branch first (`attach_branch`), the branch must " +
      "exist on the connected repository (`BranchNotFound` otherwise) and " +
      "it can't belong to another ticket (`Conflict`). A pull request " +
      "that mentions the ticket is also stacked automatically when it " +
      "opens on a ticket that already has a branch. Pull request state " +
      "for each layer comes from GitHub. Returns the updated ticket.",
    cli: { command: ["branches", "stack"], args: ["id", "name"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      id: ticketId,
      ...AttachBranchInput.fields
    }),
    success: TicketDetail
  }),
  defineTool("unstack_branch", {
    title: "Unstack branch",
    hints: {
      readOnly: false,
      destructive: true,
      idempotent: true,
      openWorld: false
    },
    description:
      "Remove a branch from a ticket's stack. The branch is remembered as " +
      "ignored so it is not stacked on the ticket again automatically; " +
      "`stack_branch` adds it back. Fails with `Conflict` when the branch " +
      "is not stacked on the ticket. Returns the updated ticket.",
    cli: { command: ["branches", "unstack"], args: ["id", "name"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      id: ticketId,
      ...AttachBranchInput.fields
    }),
    success: TicketDetail
  }),
  defineTool("create_sprint", {
    title: "Create sprint",
    hints: {
      readOnly: false,
      destructive: true,
      idempotent: false,
      openWorld: false
    },
    description:
      "Create a sprint in a project. This tool only creates sprints, not " +
      "epics or milestones. Set the sprint's markdown `body` afterwards " +
      "with `update_sprint`. Returns the created sprint.",
    cli: { command: ["sprints", "create"], args: ["name"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      name: CreateGroupInput.fields.name,
      color: CreateGroupInput.fields.color,
      startsAt: CreateGroupInput.fields.startsAt,
      endsAt: CreateGroupInput.fields.endsAt,
      tickets: CreateGroupInput.fields.tickets
    }),
    success: Group
  }),
  defineTool("update_sprint", {
    title: "Update sprint",
    hints: {
      readOnly: false,
      destructive: true,
      idempotent: true,
      openWorld: false
    },
    description:
      "Update a sprint's metadata. Targets `kind: 'sprint'` groups only — " +
      "passing the id of an epic or milestone fails with `Validation` " +
      "(`reason: not_a_sprint:<id>`). Every field is optional; omitted " +
      "fields are left unchanged. To complete a sprint, use " +
      "`complete_sprint` (it carries destination semantics for " +
      "carryover); this tool deliberately excludes `completedAt`. Returns " +
      "the updated sprint.",
    cli: { command: ["sprints", "update"], args: ["id"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      id: groupId,
      name: UpdateGroupInput.fields.name,
      body: UpdateGroupInput.fields.body,
      color: UpdateGroupInput.fields.color,
      startsAt: UpdateGroupInput.fields.startsAt,
      endsAt: UpdateGroupInput.fields.endsAt
    }),
    success: GroupDetail
  }),
  defineTool("complete_sprint", {
    title: "Complete sprint",
    hints: {
      readOnly: false,
      destructive: true,
      idempotent: false,
      openWorld: false
    },
    description:
      "Complete a sprint, sending any carryover (non-`done`) tickets to " +
      "the chosen destination. Targets `kind: 'sprint'` groups only — " +
      "passing the id of an epic or milestone fails with `Validation` " +
      "(`reason: not_a_sprint:<id>`). " +
      "Already-completed sprints fail with `SprintCompletedImmutable`. " +
      "Returns the now-completed sprint plus the `carried` ticket ids the " +
      "server moved to the destination.",
    cli: { command: ["sprints", "complete"], args: ["id"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      id: groupId,
      ...CompleteSprintInput.fields
    }),
    success: CompleteSprintOutput
  }),
  defineTool("rebuild_ticket_index", {
    title: "Rebuild ticket index",
    hints: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      openWorld: false
    },
    description:
      "Rebuild the operational ticket index for a project from its markdown " +
      "ticket documents (the source of truth). The index powers ticket " +
      "lists, counts, search, tag usage, and branch/PR routing; it is kept " +
      "in sync on every write and reconciled on backend boot, so this repair " +
      "action is only needed when drift is suspected. The rebuild is " +
      "transactional (the project's rows are replaced atomically) and " +
      "idempotent. Requires the PM role on the project. Returns " +
      "the drift that was detected (ticket ids `missing` from the index, " +
      "`orphaned` rows with no backing document, and `stale` rows whose " +
      "content was out of date), the number of documents `indexed`, the " +
      "number `skipped` because they were unreadable, and whether the index " +
      "was actually `rebuilt`.",
    cli: { command: ["tickets", "rebuild-index"] },
    parameters: Schema.Struct({ orgSlug, projectSlug }),
    success: RebuildTicketIndexOutput
  }),
  defineTool("add_tickets_to_group", {
    title: "Add tickets to group",
    hints: {
      readOnly: false,
      destructive: true,
      idempotent: true,
      openWorld: false
    },
    description:
      "Add one or more tickets to a group (sprint, epic, or milestone). " +
      "Additive: existing membership is preserved, ids already in the " +
      "group are deduplicated. The most common use is putting a newly " +
      "created ticket on the active sprint — discover the active sprint " +
      "via `list_sprints` with `state: 'active'`, then call this tool " +
      "with its `id`. Sprint membership is exclusive across sprints, so " +
      "if any of the supplied tickets belong to a different sprint they " +
      "are evicted from that sprint and the eviction is reported in the " +
      "`evicted` field of the response. Adding to a completed sprint " +
      "fails with `SprintCompletedImmutable`. Returns the updated group " +
      "and the list of evictions.",
    cli: { command: ["groups", "add-tickets"], args: ["groupId"] },
    parameters: Schema.Struct({
      orgSlug,
      projectSlug,
      groupId,
      ticketIds: Schema.Array(TicketId).annotate({
        description: "The tickets to add."
      })
    }),
    success: UpdateGroupTicketsOutput
  })
)

export type ToolName = keyof typeof Tools.tools
