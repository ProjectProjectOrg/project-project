import type { ReactNode } from "react"
import type * as Effect from "effect/Effect"
import type { MentionType } from "@projectproject/shared"
import type { MentionScope } from "./scope"

export interface MentionCandidate {
  readonly id: string
  readonly label: string
  readonly secondary?: string
  readonly image?: string | null
}

export type { MentionScope }

export interface MentionProvider {
  readonly trigger: string
  readonly type: MentionType
  readonly search: (
    query: string,
    scope: MentionScope
  ) => Effect.Effect<ReadonlyArray<MentionCandidate>, unknown, unknown>
  readonly renderRow: (candidate: MentionCandidate) => ReactNode
}

import { userMentionProvider } from "./userProvider"
import { ticketMentionProvider } from "./ticketProvider"

export const mentionProviders: ReadonlyArray<MentionProvider> = [
  userMentionProvider,
  ticketMentionProvider
]

export const providerForTrigger = (
  trigger: string
): MentionProvider | undefined =>
  mentionProviders.find((p) => p.trigger === trigger)

export const providerForType = (
  type: MentionType
): MentionProvider | undefined => mentionProviders.find((p) => p.type === type)
