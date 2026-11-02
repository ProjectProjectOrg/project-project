import * as Access from "@pp/server-core/access/Access"
import { AttachmentUploads } from "@pp/server-core/attachments/AttachmentUploads"
import * as BetterAuth from "@pp/server-core/auth/BetterAuth"
import { Comments } from "@pp/server-core/comments/Comments"
import * as GroupDocs from "@pp/server-core/groups/GroupDocs"
import * as Groups from "@pp/server-core/groups/Groups"
import * as Library from "@pp/server-core/library/Library"
import * as ProjectDocs from "@pp/server-core/projects/ProjectDocs"
import * as ProjectGitAutomation from "@pp/server-core/projects/ProjectGitAutomation"
import * as ProjectMembers from "@pp/server-core/projects/ProjectMembers"
import * as Projects from "@pp/server-core/projects/Projects"
import * as ProjectStatuses from "@pp/server-core/projects/ProjectStatuses"
import * as OrgStorage from "@pp/server-core/storage/OrgStorage"
import { Tags } from "@pp/server-core/tags/Tags"
import * as TicketCommands from "@pp/server-core/tickets/TicketCommands"
import * as TicketDocs from "@pp/server-core/tickets/TicketDocs"
import * as TicketGit from "@pp/server-core/tickets/TicketGit"
import * as TicketIndex from "@pp/server-core/tickets/TicketIndex"
import * as TicketIndexMaintenance from "@pp/server-core/tickets/TicketIndexMaintenance"
import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"

export const toolDependencies = [
  Access.Access,
  AttachmentUploads,
  BetterAuth.BetterAuth,
  Comments,
  GroupDocs.GroupDocs,
  Groups.Groups,
  Library.Library,
  OrgStorage.OrgStorage,
  ProjectDocs.ProjectDocs,
  ProjectGitAutomation.ProjectGitAutomation,
  ProjectMembers.ProjectMembers,
  ProjectStatuses.ProjectStatuses,
  Projects.Projects,
  Tags,
  TicketDocs.TicketDocs,
  TicketGit.TicketGit,
  TicketIndex.TicketIndex,
  TicketIndexMaintenance.TicketIndexMaintenance,
  TicketQueries.TicketQueries,
  TicketCommands.TicketCommands
] as const

export type ToolServices = (typeof toolDependencies)[number]["Identifier"]
