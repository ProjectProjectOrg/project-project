import { Access } from "@pp/server-core/access/Access"
import { AttachmentUploads } from "@pp/server-core/attachments/AttachmentUploads"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import { Comments } from "@pp/server-core/comments/Comments"
import { GroupDocs } from "@pp/server-core/groups/GroupDocs"
import { Groups } from "@pp/server-core/groups/Groups"
import { Library } from "@pp/server-core/library/Library"
import { ProjectDocs } from "@pp/server-core/projects/ProjectDocs"
import { ProjectGitAutomation } from "@pp/server-core/projects/ProjectGitAutomation"
import { Projects } from "@pp/server-core/projects/Projects"
import { ProjectStatuses } from "@pp/server-core/projects/ProjectStatuses"
import { OrgStorage } from "@pp/server-core/storage/OrgStorage"
import { Tags } from "@pp/server-core/tags/Tags"
import * as TicketCommands from "@pp/server-core/tickets/TicketCommands"
import { TicketDocs } from "@pp/server-core/tickets/TicketDocs"
import * as TicketGit from "@pp/server-core/tickets/TicketGit"
import { TicketIndex } from "@pp/server-core/tickets/TicketIndex"
import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"

export const toolDependencies = [
  Access,
  AttachmentUploads,
  BetterAuth,
  Comments,
  GroupDocs,
  Groups,
  Library,
  OrgStorage,
  ProjectDocs,
  ProjectGitAutomation,
  ProjectStatuses,
  Projects,
  Tags,
  TicketDocs,
  TicketGit.TicketGit,
  TicketIndex,
  TicketQueries.TicketQueries,
  TicketCommands.TicketCommands
] as const

export type ToolServices = (typeof toolDependencies)[number]["Identifier"]
