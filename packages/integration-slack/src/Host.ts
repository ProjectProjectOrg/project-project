import type { GroupId, SlackError, TicketId } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export type TicketLink = Readonly<{
  orgSlug: string
  slug: string
  id: TicketId
}>

export type TicketSummary = Readonly<{
  id: TicketId
  title: string
  status: string
  assignees: ReadonlyArray<string>
}>

type SealedSecret = Readonly<{
  ciphertext: string
  nonce: string
  tag: string
}>

export class SlackHost extends Context.Service<
  SlackHost,
  Readonly<{
    ticketSummary: (
      request: TicketLink & Readonly<{ organizationId: string; userId: string }>
    ) => Effect.Effect<TicketSummary | null>
    sprint: (
      request: Readonly<{ orgSlug: string; slug: string; id: GroupId }>
    ) => Effect.Effect<Readonly<{
      startsAt: Date | null
      completed: boolean
    }> | null>
    seal: (plaintext: string) => Effect.Effect<SealedSecret, SlackError>
    open: (sealed: SealedSecret) => Effect.Effect<string, SlackError>
  }>
>()("@pp/integration-slack/Host/SlackHost") {}
