// Compound keys for `Atom.family`.
//
// Atom.family memoizes by Effect's `Equal.equals` (it stores entries in a
// MutableHashMap). `Data.struct` produces values that compare structurally
// by Equal, so two calls with the same fields return the same atom — no
// stringify/parse round-trip required.
//
// Each family has its own typed key. Distinct shapes mean a TicketKey can't
// be passed where a ProjectKey is expected, and vice versa.

import { Data } from "effect"
import type { CommentId, TicketId } from "@projectproject/shared"

// Org-scoped --------------------------------------------------------------

export type OrgKey = ReturnType<typeof orgKey>
export const orgKey = (orgSlug: string) => Data.struct({ orgSlug })

// Project-scoped ----------------------------------------------------------

export type ProjectKey = ReturnType<typeof projectKey>
export const projectKey = (orgSlug: string, slug: string) =>
  Data.struct({ orgSlug, slug })

// Project-scoped lists / state. All structurally identical to ProjectKey;
// re-exported under domain-specific names so callsites read clearly.
export const ticketsListKey = projectKey
export const tagsKey = projectKey
export const gitStatesKey = projectKey
export const ticketListUiKey = projectKey

// Ticket-scoped -----------------------------------------------------------

export type TicketKey = ReturnType<typeof ticketKey>
export const ticketKey = (orgSlug: string, slug: string, id: TicketId) =>
  Data.struct({ orgSlug, slug, id })

// Comments list lives on the ticket — same shape as TicketKey.
export const commentsKey = ticketKey

// Single comment ----------------------------------------------------------

export type CommentKey = ReturnType<typeof commentKey>
export const commentKey = (
  orgSlug: string,
  slug: string,
  id: TicketId,
  commentId: CommentId
) => Data.struct({ orgSlug, slug, id, commentId })

// Member ------------------------------------------------------------------

export type MemberKey = ReturnType<typeof memberKey>
export const memberKey = (orgSlug: string, slug: string, userId: string) =>
  Data.struct({ orgSlug, slug, userId })

// GitHub branches search --------------------------------------------------

export type BranchesKey = ReturnType<typeof branchesKey>
export const branchesKey = (orgSlug: string, slug: string, q: string) =>
  Data.struct({ orgSlug, slug, q })

// GitHub repo picker ------------------------------------------------------

export type ReposKey = ReturnType<typeof reposKey>
export const reposKey = (q: string) => Data.struct({ q })
