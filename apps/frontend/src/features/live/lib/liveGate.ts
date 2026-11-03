import type { ReactivityKey } from "@/api/keys"

import { uniqueKeys } from "./liveKeys"

export type LiveGateInput =
  | Readonly<{ kind: "interactions"; open: number }>
  | Readonly<{ kind: "keys"; keys: ReadonlyArray<ReactivityKey> }>

export type LiveGate = Readonly<{
  held: boolean
  pending: ReadonlyArray<ReactivityKey>
}>

export const initialLiveGate: LiveGate = { held: true, pending: [] }

export const stepLiveGate = (
  gate: LiveGate,
  input: LiveGateInput
): readonly [LiveGate, ReadonlyArray<ReadonlyArray<ReactivityKey>>] => {
  if (input.kind === "keys")
    return gate.held
      ? [{ held: true, pending: uniqueKeys([gate.pending, input.keys]) }, []]
      : [gate, [input.keys]]
  const held = input.open > 0
  return !held && gate.pending.length > 0
    ? [{ held, pending: [] }, [gate.pending]]
    : [{ held, pending: gate.pending }, []]
}
