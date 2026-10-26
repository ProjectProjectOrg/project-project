import type { GroupId, TicketId } from "@pp/shared"
import * as Brand from "effect/Brand"

export type ReactivityKey = Brand.Branded<string, "ReactivityKey">

const key = Brand.nominal<ReactivityKey>()

/** `orgSlug/slug` — the string every project-scoped reactivity key is built on. */
export const projectScope = (orgSlug: string, slug: string): string =>
  `${orgSlug}/${slug}`

// Array form only: record form also hashes the bare key, so every query under it would refresh.
export const Keys = {
  slackOrg: (orgSlug: string): ReactivityKey => key(`slack-org/${orgSlug}`),
  slackProject: (scope: string): ReactivityKey => key(`slack-project/${scope}`),
  slackProfiles: (): ReactivityKey => key("slack-profiles"),
  orgEmail: (orgSlug: string): ReactivityKey => key(`org-email/${orgSlug}`),
  /** One ticket's content, wherever it is shown. */
  ticket: (scope: string, id: TicketId): ReactivityKey =>
    key(`ticket-content/${scope}/${id}`),
  /** Any query whose rows are tickets in this project. */
  ticketsIn: (scope: string): ReactivityKey => key(`tickets/${scope}`),
  /** Any list/section/board projection of this project's tickets. */
  ticketLists: (scope: string): ReactivityKey => key(`ticket-lists/${scope}`),
  /** Cursor pages loaded on top of a backlog section. */
  ticketPages: (scope: string): ReactivityKey => key(`ticket-pages/${scope}`),
  /** Every ticket row, list, section and cursor page in this project. */
  ticketsChanged: (scope: string): ReadonlyArray<ReactivityKey> => [
    Keys.ticketsIn(scope),
    Keys.ticketLists(scope),
    Keys.ticketPages(scope)
  ],
  /** One ticket's content plus every ticket list in its project. */
  ticketChanged: (
    scope: string,
    id: TicketId
  ): ReadonlyArray<ReactivityKey> => [
    Keys.ticket(scope, id),
    ...Keys.ticketsChanged(scope)
  ],
  /** Queries whose ordering or matching depends on ticket titles. */
  ticketTitleQuery: (scope: string): ReactivityKey =>
    key(`ticket-title-query/${scope}`),
  /** Queries that depend on comments on this project's tickets. */
  ticketComments: (scope: string): ReactivityKey =>
    key(`ticket-comments/${scope}`),
  /** Queries whose ordering or matching depends on `updatedAt`. */
  ticketUpdatedQuery: (scope: string): ReactivityKey =>
    key(`ticket-updated-query/${scope}`),
  /** Any query returning this project's sprints. */
  sprints: (scope: string): ReactivityKey => key(`sprints/${scope}`),
  /** Which sprint a ticket belongs to. */
  sprintMembership: (scope: string, groupId?: string): ReactivityKey =>
    key(
      groupId === undefined
        ? `sprint-membership/${scope}`
        : `sprint-membership/${scope}/${groupId}`
    ),
  /** One sprint's own content, wherever it is shown. */
  sprint: (scope: string, id: GroupId): ReactivityKey =>
    key(`sprint/${scope}/${id}`),
  /** This project's tag definitions. */
  tags: (scope: string): ReactivityKey => key(`tags/${scope}`),
  /** Ticket-derived tag usage in this project. */
  tagUsage: (scope: string): ReactivityKey => key(`tag-usage/${scope}`),
  /** One organization's block and template library. */
  orgLibrary: (orgSlug: string): ReactivityKey => key(`org-library/${orgSlug}`),
  /** This project's effective block and template library. */
  projectLibrary: (scope: string): ReactivityKey =>
    key(`project-library/${scope}`),
  /** This project's workflow statuses. */
  statuses: (scope: string): ReactivityKey => key(`statuses/${scope}`),
  /** One project's content. */
  project: (scope: string): ReactivityKey => key(`project/${scope}`),
  /** Projects belonging to one organization. */
  projects: (orgSlug: string): ReactivityKey => key(`projects/${orgSlug}`),
  /** One organization's content. */
  org: (orgSlug: string): ReactivityKey => key(`org/${orgSlug}`),
  /** Organizations available to the current user. */
  orgs: (): ReactivityKey => key("orgs"),
  /** Members and invitations for one organization. */
  orgMembers: (orgSlug: string): ReactivityKey => key(`org-members/${orgSlug}`),
  /** Invitations available to the current user. */
  invitations: (): ReactivityKey => key("invitations"),
  /** The current user's session profile. */
  me: (): ReactivityKey => key("me"),
  /** Comments on one ticket. */
  comments: (scope: string, ticketId: TicketId): ReactivityKey =>
    key(`comments/${scope}/${ticketId}`),
  /** Attachments stored by one organization. */
  attachments: (orgSlug: string): ReactivityKey =>
    key(`attachments/${orgSlug}`),
  /** Storage connection state for one organization. */
  storage: (orgSlug: string): ReactivityKey => key(`storage/${orgSlug}`),
  /** This project's git automation rules. */
  gitAutomation: (scope: string): ReactivityKey =>
    key(`git-automation/${scope}`),
  /** Git state for this project's tickets. */
  gitStates: (scope: string): ReactivityKey => key(`git-states/${scope}`),
  /** Branches available to this project. */
  branches: (scope: string): ReactivityKey => key(`branches/${scope}`),
  /** GitHub integration state for one organization. */
  githubIntegration: (orgSlug: string): ReactivityKey =>
    key(`github-integration/${orgSlug}`),
  /** GitHub authentication state for one organization. */
  githubAuth: (orgSlug: string): ReactivityKey => key(`github-auth/${orgSlug}`),
  /** The current user's Everhour profile connection. */
  everhourProfile: (): ReactivityKey => key("everhour-profile"),
  /** This project's Everhour connection. */
  everhourProject: (scope: string): ReactivityKey =>
    key(`everhour-project/${scope}`),
  /** The current user's Figma profile connection. */
  figmaProfile: (): ReactivityKey => key("figma-profile"),
  /** This project's Figma connection. */
  figmaProject: (scope: string): ReactivityKey => key(`figma-project/${scope}`),
  /** Figma links resolved for tickets in this project. */
  figmaTicketLinks: (scope: string): ReactivityKey =>
    key(`figma-ticket-links/${scope}`),
  /** The active timer in one organization. */
  activeTimer: (orgSlug: string): ReactivityKey =>
    key(`active-timer/${orgSlug}`),
  /** Tracked time for one ticket. */
  ticketTime: (scope: string, ticketId: TicketId): ReactivityKey =>
    key(`ticket-time/${scope}/${ticketId}`),
  /** Work types available to tickets in this project. */
  workTypes: (scope: string): ReactivityKey => key(`work-types/${scope}`),
  /** OAuth applications managed by the current user. */
  oauthApplications: (): ReactivityKey => key("oauth-applications"),
  /** One public OAuth client's metadata. */
  oauthClient: (clientId: string): ReactivityKey =>
    key(`oauth-client/${clientId}`),
  jiraMigrations: (orgSlug: string): ReactivityKey =>
    key(`jira-migrations/${orgSlug}`),
  jiraMigration: (orgSlug: string, migrationId: string): ReactivityKey =>
    key(`jira-migration/${orgSlug}/${migrationId}`)
} as const
