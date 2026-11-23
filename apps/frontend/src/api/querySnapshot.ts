import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"

import { isQuerySource } from "./query"

export const SNAPSHOT_STORAGE_KEY = "pp:shown-queries"
export const SNAPSHOT_SIZE_LIMIT = 2_000_000

const EncodedResult = Schema.Record(Schema.String, Schema.Unknown)
const decodeEncodedResult = Schema.decodeUnknownSync(EncodedResult)

const Snapshot = Schema.Struct({
  user: Schema.String,
  build: Schema.String,
  queries: Schema.Array(Schema.Tuple([Schema.String, EncodedResult]))
})

export type Snapshot = typeof Snapshot.Type

const decodeSnapshot = Schema.decodeUnknownOption(
  Schema.fromJsonString(Snapshot)
)

const confirmedEntry = (node: AtomRegistry.Node<unknown>) => {
  const { atom } = node
  if (!isQuerySource(atom) || !Atom.isSerializable(atom)) return null
  const value = node.value()
  if (!AsyncResult.isAsyncResult(value) || !AsyncResult.isSuccess(value))
    return null
  const { key, encode, decode } = atom[Atom.SerializableTypeId]
  try {
    const encoded = decodeEncodedResult(
      encode(AsyncResult.success(value.value))
    )
    decode(encoded)
    return [key, encoded, JSON.stringify(encoded).length + key.length] as const
  } catch {
    return null
  }
}

export const shownQueries = (registry: AtomRegistry.AtomRegistry) => {
  const shown: Array<NonNullable<ReturnType<typeof confirmedEntry>>> = []
  registry.getNodes().forEach((node) => {
    if (node.canBeRemoved || node.currentState() !== "valid") return
    const entry = confirmedEntry(node)
    if (entry !== null) shown.push(entry)
  })
  const kept: Array<Snapshot["queries"][number]> = []
  let size = 0
  for (const [key, encoded, length] of shown.toSorted((a, b) => a[2] - b[2])) {
    size += length
    if (size > SNAPSHOT_SIZE_LIMIT) break
    kept.push([key, encoded])
  }
  return kept
}

export const restoreQueries = (
  registry: AtomRegistry.AtomRegistry,
  queries: Snapshot["queries"]
) => {
  const timestamp = DateTime.toEpochMillis(DateTime.nowUnsafe())
  for (const [key, encoded] of queries)
    registry.setSerializable(key, { ...encoded, timestamp })
}

export const clearSnapshot = () => {
  try {
    localStorage.removeItem(SNAPSHOT_STORAGE_KEY)
  } catch {
    return
  }
}

export const saveSnapshot = (snapshot: Snapshot) => {
  try {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    clearSnapshot()
  }
}

export const readSnapshot = (build: string, viewer: string | null) => {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(SNAPSHOT_STORAGE_KEY)
  } catch {
    return null
  }
  if (stored === null) return null
  const snapshot = Option.getOrNull(decodeSnapshot(stored))
  if (snapshot?.build === build && snapshot.user === viewer) return snapshot
  clearSnapshot()
  return null
}
