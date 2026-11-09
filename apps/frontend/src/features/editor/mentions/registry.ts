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
  trigger: string
  type: MentionType
  search: (
    query: string,
    cursor: string | null
  ) => Effect.Effect<MentionPage, MentionSearchFailed, AtomRegistry>
  renderRow: (candidate: MentionCandidate) => ReactNode
  notes: Readonly<{
    loading: () => string
    empty: () => string
    failed: () => string
  }>
}>

import { ticketProvider } from "./ticketProvider"
import { userProvider } from "./userProvider"

export const mentionProviders = (
  scope: MentionScope
): ReadonlyArray<MentionProvider> => [
  userProvider(scope),
  ticketProvider(scope)
]

export const providerForTrigger = (
  providers: ReadonlyArray<MentionProvider>,
  trigger: string
): MentionProvider | undefined =>
  providers.find((provider) => provider.trigger === trigger)

export const providerForType = (
  providers: ReadonlyArray<MentionProvider>,
  type: MentionType
): MentionProvider | undefined =>
  providers.find((provider) => provider.type === type)
