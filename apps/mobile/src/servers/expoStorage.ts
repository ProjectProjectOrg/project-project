import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as SecureStore from "expo-secure-store"
import Storage from "expo-sqlite/kv-store"

import {
  KeyValueStorage,
  SecureStorage,
  StorageFailure,
  type StringStorage
} from "./storage"

const attempt = <A>(operation: "read" | "write", run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new StorageFailure({ operation, cause })
  })

const keyValueStorage: StringStorage = {
  get: (key) =>
    attempt("read", () => Storage.getItem(key)).pipe(
      Effect.map(Option.fromNullishOr)
    ),
  set: (key, value) => attempt("write", () => Storage.setItem(key, value)),
  remove: (key) => attempt("write", () => Storage.removeItem(key))
}

const keychainOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
}

const secureStorage: StringStorage = {
  get: (key) =>
    attempt("read", () => SecureStore.getItemAsync(key, keychainOptions)).pipe(
      Effect.map(Option.fromNullishOr)
    ),
  set: (key, value) =>
    attempt("write", () =>
      SecureStore.setItemAsync(key, value, keychainOptions)
    ),
  remove: (key) =>
    attempt("write", () => SecureStore.deleteItemAsync(key, keychainOptions))
}

export const ExpoStorageLive = Layer.mergeAll(
  Layer.succeed(KeyValueStorage, keyValueStorage),
  Layer.succeed(SecureStorage, secureStorage)
)
