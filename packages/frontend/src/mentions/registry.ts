import type { ReactNode } from "react"
import type * as Effect from "effect/Effect"
import type { MentionType } from "@projectproject/shared"
import type { AtomRegistry } from "effect/unstable/reactivity/AtomRegistry"
import type { MentionScope } from "./scope"

export type MentionCandidate = {
  readonly id: string
  readonly label: string
  readonly secondary?: string
  readonly image?: string | null
}

export type { MentionScope }

export type MentionProvider = {
  readonly trigger: string
  readonly type: MentionType
  readonly search: (
    query: string
  ) => Effect.Effect<ReadonlyArray<MentionCandidate>, never, AtomRegistry>
  readonly renderRow: (candidate: MentionCandidate) => ReactNode
}

import { userProvider } from "./userProvider"
import { ticketProvider } from "./ticketProvider"

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
