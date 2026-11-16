import type { InboxMark, LocalStatus } from "@pp/local"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Stream from "effect/Stream"

import { Keys } from "@/api/keys"
import { localRuntime } from "@/features/local/atoms/localProject"
import { LocalClient } from "@/features/local/lib/localClient"

export const localInboxSync = localRuntime
  .atom(
    Stream.unwrap(
      Effect.map(LocalClient, (client) =>
        Reactivity.stream(
          client
            .InboxPull()
            .pipe(
              Effect.orElseSucceed((): LocalStatus => ({ kind: "failed" }))
            ),
          [Keys.liveResync()]
        )
      )
    )
  )
  .pipe(Atom.keepAlive)

export const localInboxList = Atom.family(
  (request: Readonly<{ orgSlug: string; readSince: string }>) =>
    localRuntime.atom(
      Stream.unwrap(Effect.map(LocalClient, (client) => client.Inbox(request)))
    )
)

export const localInboxUnread = Atom.family((orgSlug: string) =>
  localRuntime.atom(
    Stream.unwrap(
      Effect.map(LocalClient, (client) => client.InboxUnread({ orgSlug }))
    )
  )
)

export const markInbox = localRuntime.fn(
  Effect.fn("markInbox")(function* (mark: InboxMark) {
    const client = yield* LocalClient
    yield* client.InboxMark(mark)
    yield* Reactivity.invalidate([Keys.inbox(mark.orgSlug)])
  }),
  { concurrent: true }
)

export const forgetInbox = localRuntime.atom(
  Effect.flatMap(LocalClient, (client) => client.InboxForget())
)
