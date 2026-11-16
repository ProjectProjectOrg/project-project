import { it } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { afterEach, expect, vi } from "vitest"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const stubStorage = (initial: Record<string, string>) => {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key)
    }
  })
  return store
}

it.effect(
  "shows the saved value while the query loads, then the live one, and saves it",
  () =>
    Effect.gen(function* () {
      const store = stubStorage({
        "pp:boot": '{"greeting":"saved"}'
      })
      const { persisted, saveBoot } = yield* Effect.promise(
        () => import("./bootCache")
      )
      const answer = Deferred.makeUnsafe<string>()
      const query = Atom.make(Deferred.await(answer))
      const greeting = query.pipe(persisted("greeting", Schema.String))
      const registry = Registry.make()
      const unmount = registry.mount(greeting)

      expect(registry.get(greeting)).toMatchObject({
        _tag: "Success",
        value: "saved",
        waiting: true
      })
      yield* Deferred.succeed(answer, "live")
      yield* Effect.yieldNow
      const live = registry.get(greeting)
      expect(AsyncResult.isSuccess(live) && live.value).toBe("live")
      saveBoot(registry)
      expect(store.get("pp:boot")).toBe('{"greeting":"live"}')
      unmount()
    })
)

it.effect(
  "keeps the saved value when the page leaves before the query answers",
  () =>
    Effect.gen(function* () {
      const store = stubStorage({ "pp:boot": '{"greeting":"saved"}' })
      const { persisted, saveBoot } = yield* Effect.promise(
        () => import("./bootCache")
      )
      const greeting = Atom.make(Effect.never).pipe(
        persisted("greeting", Schema.String)
      )
      const registry = Registry.make()
      const unmount = registry.mount(greeting)

      saveBoot(registry)
      expect(store.get("pp:boot")).toBe('{"greeting":"saved"}')
      unmount()
    })
)

it.effect(
  "shows a value seen earlier in this session before the query answers again",
  () =>
    Effect.gen(function* () {
      stubStorage({})
      const { persisted } = yield* Effect.promise(() => import("./bootCache"))
      const first = Atom.make(Effect.succeed("seen"))
      const registry = Registry.make()
      const unmount = registry.mount(
        first.pipe(persisted("greeting", Schema.String))
      )
      unmount()
      const again = Atom.make(Effect.never).pipe(
        persisted("greeting", Schema.String)
      )
      expect(registry.get(again)).toMatchObject({
        _tag: "Success",
        value: "seen",
        waiting: true
      })
    })
)
