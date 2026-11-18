import type { GroupId, TicketId } from "@pp/shared"
import * as Brand from "effect/Brand"

export type ReactivityKey = Brand.Branded<string, "ReactivityKey">

const key = Brand.nominal<ReactivityKey>()

/** `orgSlug/slug` — the string every project-scoped reactivity key is built on. */
export const projectScope = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`

// Array form only: record form also hashes the bare key, so every query under it would refresh.
export const Keys = {
  slackOrg: (orgSlug: string) => key(`slack-org/${orgSlug}`),
  slackProject: (scope: string) => key(`slack-project/${scope}`),
  slackProfiles: () => key("slack-profiles"),
  orgEmail: (orgSlug: string) => key(`org-email/${orgSlug}`),
  /** One ticket's content, wherever it is shown. */
  ticket: (scope: string, id: TicketId) => key(`ticket-content/${scope}/${id}`),
  /** Any query whose rows are tickets in this project. */
  ticketsIn: (scope: string) => key(`tickets/${scope}`),
  /** Any list/section/board projection of this project's tickets. */
  ticketLists: (scope: string) => key(`ticket-lists/${scope}`),
  /** Cursor pages loaded on top of a backlog section. */
  ticketPages: (scope: string) => key(`ticket-pages/${scope}`),
  /** Every ticket row, list, section and cursor page in this project. */
  ticketsChanged: (scope: string) => [
    Keys.ticketsIn(scope),
    Keys.ticketLists(scope),
    Keys.ticketPages(scope)
  ],
  /** One ticket's content plus every ticket list in its project. */
  ticketChanged: (scope: string, id: TicketId) => [
    Keys.ticket(scope, id),
    ...Keys.ticketsChanged(scope)
  ],
  /** Queries whose ordering or matching depends on ticket titles. */
  ticketTitleQuery: (scope: string) => key(`ticket-title-query/${scope}`),
  /** Queries that depend on comments on this project's tickets. */
  ticketComments: (scope: string) => key(`ticket-comments/${scope}`),
  /** Queries whose ordering or matching depends on `updatedAt`. */
  ticketUpdatedQuery: (scope: string) => key(`ticket-updated-query/${scope}`),
  /** Any query returning this project's sprints. */
  sprints: (scope: string) => key(`sprints/${scope}`),
  /** Which sprint a ticket belongs to. */
  sprintMembership: (scope: string, groupId?: string) =>
    key(
      groupId === undefined
        ? `sprint-membership/${scope}`
        : `sprint-membership/${scope}/${groupId}`
    ),
  /** One sprint's own content, wherever it is shown. */
  sprint: (scope: string, id: GroupId) => key(`sprint/${scope}/${id}`),
  /** This project's tag definitions. */
  tags: (scope: string) => key(`tags/${scope}`),
  /** Ticket-derived tag usage in this project. */
  tagUsage: (scope: string) => key(`tag-usage/${scope}`),
  /** One organization's block and template library. */
  orgLibrary: (orgSlug: string) => key(`org-library/${orgSlug}`),
  /** This project's effective block and template library. */
  projectLibrary: (scope: string) => key(`project-library/${scope}`),
  /** This project's workflow statuses. */
  statuses: (scope: string) => key(`statuses/${scope}`),
  /** One project's content. */
  project: (scope: string) => key(`project/${scope}`),
  /** Projects belonging to one organization. */
  projects: (orgSlug: string) => key(`projects/${orgSlug}`),
  /** One organization's content. */
  org: (orgSlug: string) => key(`org/${orgSlug}`),
  /** The current user's sidebar pins across one organization. */
  pins: (orgSlug: string) => key(`pins/${orgSlug}`),
  /** Organizations available to the current user. */
  orgs: () => key("orgs"),
  /** Members and invitations for one organization. */
  orgMembers: (orgSlug: string) => key(`org-members/${orgSlug}`),
  /** Invitations available to the current user. */
  invitations: () => key("invitations"),
  /** The current user's session profile. */
  me: () => key("me"),
  /** Comments on one ticket. */
  comments: (scope: string, ticketId: TicketId) =>
    key(`comments/${scope}/${ticketId}`),
  /** Who follows one ticket. */
  ticketSubscribers: (scope: string, ticketId: TicketId) =>
    key(`ticket-subscribers/${scope}/${ticketId}`),
  /** Attachments stored by one organization. */
  attachments: (orgSlug: string) => key(`attachments/${orgSlug}`),
  /** Storage connection state for one organization. */
  storage: (orgSlug: string) => key(`storage/${orgSlug}`),
  /** This project's git automation rules. */
  gitAutomation: (scope: string) => key(`git-automation/${scope}`),
  /** Git state for this project's tickets. */
  gitStates: (scope: string) => key(`git-states/${scope}`),
  /** Branches available to this project. */
  branches: (scope: string) => key(`branches/${scope}`),
  /** GitHub integration state for one organization. */
  githubIntegration: (orgSlug: string) => key(`github-integration/${orgSlug}`),
  /** GitHub authentication state for one organization. */
  githubAuth: (orgSlug: string) => key(`github-auth/${orgSlug}`),
  /** The current user's Everhour profile connection. */
  everhourProfile: () => key("everhour-profile"),
  /** This project's Everhour connection. */
  everhourProject: (scope: string) => key(`everhour-project/${scope}`),
  /** The current user's Figma profile connection. */
  figmaProfile: () => key("figma-profile"),
  /** This project's Figma connection. */
  figmaProject: (scope: string) => key(`figma-project/${scope}`),
  /** Figma links resolved for tickets in this project. */
  figmaTicketLinks: (scope: string) => key(`figma-ticket-links/${scope}`),
  /** The active timer in one organization. */
  activeTimer: (orgSlug: string) => key(`active-timer/${orgSlug}`),
  /** Tracked time for one ticket. */
  ticketTime: (scope: string, ticketId: TicketId) =>
    key(`ticket-time/${scope}/${ticketId}`),
  /** Tracked time for one sprint. */
  sprintTime: (scope: string, groupId: GroupId) =>
    key(`sprint-time/${scope}/${groupId}`),
  /** Work types available to tickets in this project. */
  workTypes: (scope: string) => key(`work-types/${scope}`),
  /** OAuth applications managed by the current user. */
  oauthApplications: () => key("oauth-applications"),
  /** One public OAuth client's metadata. */
  oauthClient: (clientId: string) => key(`oauth-client/${clientId}`),
  jiraMigrations: (orgSlug: string) => key(`jira-migrations/${orgSlug}`),
  jiraMigration: (orgSlug: string, migrationId: string) =>
    key(`jira-migration/${orgSlug}/${migrationId}`)
} as const
