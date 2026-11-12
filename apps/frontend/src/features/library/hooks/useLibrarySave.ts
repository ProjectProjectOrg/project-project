import { RegistryContext } from "@effect/atom-react"
import type {
  BlockKey,
  TypeKey,
  UpdateBlockInput,
  UpdateTypeInput
} from "@pp/shared"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import type * as Registry from "effect/reactivity/AtomRegistry"
import { useCallback, useContext, useRef, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import type { SaveStatus } from "@/features/editor/components/LexicalEditor"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import {
  updateBlockAtom,
  updateTypeAtom,
  type LibraryScope
} from "../atoms/libraryScope"

type Task = (registry: Registry.AtomRegistry) => Promise<string | null>

export const runLibraryMutation = <A, E extends Readonly<{ _tag: string }>, I>(
  registry: Registry.AtomRegistry,
  atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, I>,
  input: I
): Promise<string | null> =>
  fireMutation(registry, atom, input).then((result) =>
    mutationErrorText(result)
  )

export class LibrarySaveError extends Error {}

export type LibrarySave = Readonly<{
  status: SaveStatus
  error: string | null
  run: (task: Task) => Promise<void>
}>

export function useLibrarySave(): LibrarySave {
  const registry = useContext(RegistryContext)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const pendingRef = useRef(0)
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    (task: Task) => {
      pendingRef.current += 1
      setStatus("saving")
      const next = chainRef.current.then(async () => {
        const failure = await task(registry).catch(() => m.error_unknown())
        pendingRef.current -= 1
        setError(failure)
        if (failure !== null) {
          setStatus("dirty")
          throw new LibrarySaveError(failure)
        }
        if (pendingRef.current === 0) setStatus("saved")
      })
      chainRef.current = next.catch(() => {})
      return next
    },
    [registry]
  )

  return { status, error, run }
}

export const saveTypeTask =
  (scope: LibraryScope, key: TypeKey, patch: UpdateTypeInput): Task =>
  (registry) =>
    runLibraryMutation(registry, updateTypeAtom(scope, key), patch)

export const saveBlockTask =
  (scope: LibraryScope, key: BlockKey, patch: UpdateBlockInput): Task =>
  (registry) =>
    runLibraryMutation(registry, updateBlockAtom(scope, key), patch)
