import { RegistryContext } from "@effect/atom-react"
import type {
  BlockDefinition,
  BlockKey,
  Library,
  TypeDefinition,
  TypeKey,
  UpdateBlockInput,
  UpdateTypeInput
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import type * as Registry from "effect/reactivity/AtomRegistry"
import { useCallback, useContext, useRef, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import type { SaveStatus } from "@/features/editor/components/LexicalEditor"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import {
  createBlockAtom,
  createTypeAtom,
  libraryView,
  updateBlockAtom,
  updateTypeAtom,
  type LibraryScope
} from "../atoms/libraryScope"
import { blockDraftOf, typeDraftOf } from "../lib/libraryModel"

type Task = (registry: Registry.AtomRegistry) => Promise<string | null>

export const runLibraryMutation = <A, E extends Readonly<{ _tag: string }>, I>(
  registry: Registry.AtomRegistry,
  atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, I>,
  input: I
): Promise<string | null> =>
  fireMutation(registry, atom, input).then((result) =>
    mutationErrorText(result)
  )

const currentLibrary = (
  registry: Registry.AtomRegistry,
  scope: LibraryScope
): Library | null => {
  const result = registry.get(libraryView(scope))
  return AsyncResult.isSuccess(result) ? result.value : null
}

const withoutUndefined = <D extends object>(draft: D, patch: object): D => ({
  ...draft,
  ...Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  )
})

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

const missing = () => Promise.resolve(m.templates_settings_entry_missing())

export const saveTypeTask =
  (scope: LibraryScope, key: TypeKey, patch: UpdateTypeInput): Task =>
  (registry) => {
    const entry: TypeDefinition | undefined = currentLibrary(
      registry,
      scope
    )?.types.find((template) => template.key === key)
    if (entry === undefined) return missing()
    return entry.origin === scope.layer
      ? runLibraryMutation(registry, updateTypeAtom(scope, key), patch)
      : runLibraryMutation(
          registry,
          createTypeAtom(scope),
          withoutUndefined(typeDraftOf(entry), patch)
        )
  }

export const saveBlockTask =
  (scope: LibraryScope, key: BlockKey, patch: UpdateBlockInput): Task =>
  (registry) => {
    const entry: BlockDefinition | undefined = currentLibrary(
      registry,
      scope
    )?.blocks.find((block) => block.key === key)
    if (entry === undefined) return missing()
    return entry.origin === scope.layer
      ? runLibraryMutation(registry, updateBlockAtom(scope, key), patch)
      : runLibraryMutation(
          registry,
          createBlockAtom(scope),
          withoutUndefined(blockDraftOf(entry), patch)
        )
  }
