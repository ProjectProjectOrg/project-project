import type { InboxItem, PrivateFact, PrivateSync } from "@pp/shared"
import { TicketId, TicketStatus } from "@pp/shared"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { InboxSource } from "./inboxSource"

const ticketId = Schema.decodeUnknownSync(TicketId)

export const testCrypto = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) =>
      globalThis.crypto.getRandomValues(new Uint8Array(size)),
    digest: () => Effect.die(new Error("no digest in tests"))
  })
)

export const inboxEngine = (source: InboxSource["Service"]) =>
  Layer.merge(Layer.succeed(InboxSource, source), testCrypto)

export const quietInbox = inboxEngine({
  pull: () => Effect.die(new Error("no private scope in this test")),
  mark: () => Effect.die(new Error("no private scope in this test"))
})

const at = (minute: number) =>
  DateTime.toDateUtc(
    DateTime.makeUnsafe(`2026-11-16T10:${String(minute).padStart(2, "0")}:00Z`)
  )

export const inboxFact = (
  id: string,
  minute: number,
  state: "unread" | "read" | "done",
  orgSlug = "acme"
): PrivateFact => {
  const item: InboxItem = {
    projectSlug: "app",
    ticket: {
      id: ticketId(id),
      title: id,
      status: TicketStatus.make("todo"),
      archived: false
    },
    unread: state === "unread",
    direct: [],
    latest: { kind: "commented", commentId: "c1" },
    latestAt: at(minute),
    firstAt: at(minute),
    actor: null,
    unreadCount: state === "unread" ? 1 : 0,
    lastReadAt: state === "unread" ? null : at(minute)
  }
  return {
    id: `project-1/${id}`,
    orgSlug,
    projectSlug: "app",
    ticketId: ticketId(id),
    subscribed: true,
    inbox: { done: state === "done", item }
  }
}

export const privateSnapshot = (
  base: string,
  facts: ReadonlyArray<PrivateFact>
): PrivateSync => ({ kind: "snapshot", base, first: true, facts, next: null })

export const privateChanges = (
  cursor: string,
  upserts: ReadonlyArray<PrivateFact>,
  deletes: ReadonlyArray<string> = []
): PrivateSync => ({ kind: "changes", cursor, upserts, deletes, more: false })
