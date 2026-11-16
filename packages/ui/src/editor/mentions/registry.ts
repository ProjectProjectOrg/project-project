import type { MentionType } from "@pp/shared"
import type * as Effect from "effect/Effect"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
import type { ReactNode } from "react"

import type { SearchPage } from "@/lib/searchPages"

import type { MentionSearchFailed } from "./errors"
import type { MentionScope } from "./scope"

export type MentionCandidate = Readonly<{
  id: string
  label: string
  secondary?: string
  image?: string | null
}>

export type MentionPage = SearchPage<MentionCandidate>

export type { MentionScope }

export type MentionProvider = Readonly<{
  type: MentionType
  search: (
    query: string,
    cursor: string | null
  ) => Effect.Effect<MentionPage, MentionSearchFailed, AtomRegistry>
  renderRow: (candidate: MentionCandidate) => ReactNode
  heading: () => string
  failed: () => string
}>
