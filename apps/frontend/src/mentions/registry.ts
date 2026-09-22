import type { MentionType } from "@pp/shared"
import type * as Effect from "effect/Effect"
import type { AtomRegistry } from "effect/unstable/reactivity/AtomRegistry"
import type { ReactNode } from "react"

import type { MentionScope } from "./scope"

export type MentionCandidate = Readonly<{
  id: string
  label: string
  secondary?: string
  image?: string | null
}>

export type { MentionScope }

export type MentionProvider = Readonly<{
  trigger: string
  type: MentionType
  search: (
    query: string
  ) => Effect.Effect<ReadonlyArray<MentionCandidate>, never, AtomRegistry>
  renderRow: (candidate: MentionCandidate) => ReactNode
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
