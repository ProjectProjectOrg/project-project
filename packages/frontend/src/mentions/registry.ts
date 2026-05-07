import type { ReactNode } from "react"
import type { Effect } from "effect"
import type { MentionRef, MentionType } from "@projectproject/shared"

export interface MentionCandidate {
  readonly id: string
  readonly label: string
  readonly secondary?: string
}

export interface MentionScope {
  readonly orgSlug?: string
  readonly slug?: string
}

export interface MentionProvider {
  readonly trigger: string
  readonly type: MentionType
  readonly search: (
    query: string,
    scope: MentionScope
  ) => Effect.Effect<ReadonlyArray<MentionCandidate>, unknown, unknown>
  readonly renderRow: (candidate: MentionCandidate) => ReactNode
  readonly renderChip: (ref: MentionRef) => ReactNode
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
