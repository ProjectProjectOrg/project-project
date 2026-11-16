import type { TicketDataKind } from "@pp/local"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"

import { LocalClient } from "../lib/localClient"
import { localReady, localRuntime } from "./localProject"

export type TicketDataKey = Readonly<{
  orgSlug: string
  slug: string
  ticket: string
  kind: TicketDataKind
}>

const requestOf = (key: TicketDataKey) => ({
  project: { orgSlug: key.orgSlug, slug: key.slug },
  ticket: key.ticket,
  kind: key.kind
})

const cachedData = Atom.family((key: TicketDataKey) =>
  localRuntime.atom((get) =>
    get(localReady({ orgSlug: key.orgSlug, slug: key.slug })) === true
      ? Effect.flatMap(LocalClient, (client) =>
          client.CachedTicketData(requestOf(key))
        )
      : Effect.succeed(null)
  )
)

const written = new Map<string, string>()

export const locallyCached =
  <A, I>(key: TicketDataKey, schema: Schema.Codec<A, I>) =>
  <E>(
    self: Atom.Atom<AsyncResult.AsyncResult<A, E>>
  ): Atom.Atom<AsyncResult.AsyncResult<A, E>> => {
    const json = Schema.fromJsonString(schema)
    const encode = Schema.encodeOption(json)
    const decode = Schema.decodeUnknownOption(json)
    const id = `${key.orgSlug}/${key.slug}/${key.ticket}/${key.kind}`
    const writer = localRuntime.atom((get) => {
      const live = get(self)
      if (!AsyncResult.isSuccess(live) || live.waiting) return Effect.void
      const data = Option.getOrNull(encode(live.value))
      if (data === null || written.get(id) === data) return Effect.void
      written.set(id, data)
      return Effect.flatMap(LocalClient, (client) =>
        client.CacheTicketData({ ...requestOf(key), data })
      ).pipe(Effect.ignore)
    })
    return Atom.readable(
      (get) => {
        get.mount(writer)
        const live = get(self)
        if (!AsyncResult.isInitial(live)) return live
        const cached = get(cachedData(key))
        if (!AsyncResult.isSuccess(cached) || cached.value === null) return live
        return Option.match(decode(cached.value), {
          onNone: () => live,
          onSome: (value) => AsyncResult.success<A, E>(value, { waiting: true })
        })
      },
      (refresh) => refresh(self)
    )
  }
