import type { GroupId, TicketId } from "@pp/shared"

/** `orgSlug/slug` — the string every project-scoped reactivity key is built on. */
export const projectScope = (orgSlug: string, slug: string): string =>
  `${orgSlug}/${slug}`

/**
 * Reactivity keys, array form only.
 *
 * Record form (`{ tickets: [...] }`) also hashes the bare key `tickets`, which
 * every ticket query would register under, so any ticket mutation would refresh
 * every ticket query. Array form keeps invalidation precise.
 *
 * The strings match the ones the pre-migration modules used. They are already
 * descriptive and keeping them keeps this change about structure rather than
 * string churn.
 */
export const Keys = {
  /** One ticket's content, wherever it is shown. */
  ticket: (scope: string, id: TicketId): string =>
    `ticket-content/${scope}/${id}`,
  /** Any query whose rows are tickets in this project. */
  ticketsIn: (scope: string): string => `tickets/${scope}`,
  /** Any list/section/board projection of this project's tickets. */
  ticketLists: (scope: string): string => `ticket-lists/${scope}`,
  /** Cursor pages loaded on top of a backlog section. */
  ticketPages: (scope: string): string => `ticket-pages/${scope}`,
  /** Queries whose ordering or matching depends on ticket titles. */
  ticketTitleQuery: (scope: string): string => `ticket-title-query/${scope}`,
  /** Queries that depend on who commented on this project's tickets. */
  ticketActivity: (scope: string): string => `ticket-activity/${scope}`,
  /** Queries whose ordering or matching depends on `updatedAt`. */
  ticketUpdatedQuery: (scope: string): string =>
    `ticket-updated-query/${scope}`,
  /** Any query returning this project's sprints. */
  sprints: (scope: string): string => `sprints/${scope}`,
  /** Which sprint a ticket belongs to. */
  sprintMembership: (scope: string, groupId?: string): string =>
    groupId === undefined
      ? `sprint-membership/${scope}`
      : `sprint-membership/${scope}/${groupId}`,
  /** One sprint's own content, wherever it is shown. */
  sprint: (scope: string, id: GroupId): string => `sprint/${scope}/${id}`,
  /** This project's tag definitions. */
  tags: (scope: string): string => `tags/${scope}`,
  /** Ticket-derived tag usage in this project. */
  tagUsage: (scope: string): string => `tag-usage/${scope}`,
  /** This project's workflow statuses. */
  statuses: (scope: string): string => `statuses/${scope}`,
  /** One project's content. */
  project: (scope: string): string => `project/${scope}`,
  /** Projects belonging to one organization. */
  projects: (orgSlug: string): string => `projects/${orgSlug}`,
  /** One organization's content. */
  org: (orgSlug: string): string => `org/${orgSlug}`,
  /** Organizations available to the current user. */
  orgs: (): string => "orgs",
  /** Members and invitations for one organization. */
  orgMembers: (orgSlug: string): string => `org-members/${orgSlug}`,
  /** Invitations available to the current user. */
  invitations: (): string => "invitations",
  /** The current user's session profile. */
  me: (): string => "me",
  /** Comments on one ticket. */
  comments: (scope: string, ticketId: TicketId): string =>
    `comments/${scope}/${ticketId}`,
  /** Attachments stored by one organization. */
  attachments: (orgSlug: string): string => `attachments/${orgSlug}`,
  /** Storage connection state for one organization. */
  storage: (orgSlug: string): string => `storage/${orgSlug}`,
  /** Git state for this project's tickets. */
  gitStates: (scope: string): string => `git-states/${scope}`,
  /** Branches available to this project. */
  branches: (scope: string): string => `branches/${scope}`,
  /** GitHub integration state for one organization. */
  githubIntegration: (orgSlug: string): string =>
    `github-integration/${orgSlug}`,
  /** GitHub authentication state for one organization. */
  githubAuth: (orgSlug: string): string => `github-auth/${orgSlug}`,
  /** The current user's Everhour profile connection. */
  everhourProfile: (): string => "everhour-profile",
  /** This project's Everhour connection. */
  everhourProject: (scope: string): string => `everhour-project/${scope}`,
  /** The current user's Figma profile connection. */
  figmaProfile: (): string => "figma-profile",
  /** This project's Figma connection. */
  figmaProject: (scope: string): string => `figma-project/${scope}`,
  /** Figma links resolved for tickets in this project. */
  figmaTicketLinks: (scope: string): string => `figma-ticket-links/${scope}`,
  /** The active timer in one organization. */
  activeTimer: (orgSlug: string): string => `active-timer/${orgSlug}`,
  /** Tracked time for one ticket. */
  ticketTime: (scope: string, ticketId: TicketId): string =>
    `ticket-time/${scope}/${ticketId}`,
  /** Work types available to tickets in this project. */
  workTypes: (scope: string): string => `work-types/${scope}`,
  /** OAuth applications managed by the current user. */
  oauthApplications: (): string => "oauth-applications",
  /** One public OAuth client's metadata. */
  oauthClient: (clientId: string): string => `oauth-client/${clientId}`
} as const
