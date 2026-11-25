import type { MentionType } from "@pp/shared"
import type { ReactNode } from "react"

import type { MentionScope } from "./scope"

/*
 * A kind of thing "@" can mention (people, tickets) and how its menu group
 * looks. The search behind it is the app's (EditorServices
 * MentionSearch).
 */

export type MentionCandidate = Readonly<{
  id: string
  label: string
  secondary?: string
  image?: string | null
}>

export type { MentionScope }

export type MentionProvider = Readonly<{
  type: MentionType
  renderRow: (candidate: MentionCandidate) => ReactNode
  heading: () => string
  failed: () => string
}>

export type MentionSearchStatus =
  | "idle"
  | "loading"
  | "searching"
  | "ready"
  | "failed"

// One group's results for the current query.
export type MentionResults = Readonly<{
  items: ReadonlyArray<MentionCandidate>
  status: MentionSearchStatus
}>
