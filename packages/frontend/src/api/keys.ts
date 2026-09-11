import type { TicketId } from "@projectproject/shared"

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
  /** Queries whose ordering or matching depends on `updatedAt`. */
  ticketUpdatedQuery: (scope: string): string => `ticket-updated-query/${scope}`
} as const
