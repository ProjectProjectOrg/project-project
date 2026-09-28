import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import { KeyValueStorage, SecureStorage, type StringStorage } from "./storage"

export const memoryStorage = (): StringStorage => {
  const values = new Map<string, string>()
  return {
    get: (key) => Effect.sync(() => Option.fromNullishOr(values.get(key))),
    set: (key, value) => Effect.sync(() => void values.set(key, value)),
    remove: (key) => Effect.sync(() => void values.delete(key))
  }
}

export const MemoryStorageLive = Layer.mergeAll(
  Layer.sync(KeyValueStorage, memoryStorage),
  Layer.sync(SecureStorage, memoryStorage)
)
