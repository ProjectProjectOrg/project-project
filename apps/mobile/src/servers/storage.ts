import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"
import type * as Option from "effect/Option"

export class StorageFailure extends Data.TaggedError("StorageFailure")<
  Readonly<{ operation: "read" | "write"; cause: unknown }>
> {}

export type StringStorage = Readonly<{
  get: (key: string) => Effect.Effect<Option.Option<string>, StorageFailure>
  set: (key: string, value: string) => Effect.Effect<void, StorageFailure>
  remove: (key: string) => Effect.Effect<void, StorageFailure>
}>

export class KeyValueStorage extends Context.Service<
  KeyValueStorage,
  StringStorage
>()("@pp/mobile/servers/KeyValueStorage") {}

export class SecureStorage extends Context.Service<
  SecureStorage,
  StringStorage
>()("@pp/mobile/servers/SecureStorage") {}
