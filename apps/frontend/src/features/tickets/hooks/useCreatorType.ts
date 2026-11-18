import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { typeFor, type Library, type TypeKey } from "@pp/shared"
import { lookupFor } from "@pp/ui/editor/blocks/block-chrome"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useCallback, useMemo, useState } from "react"

import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import {
  startingType,
  typePrediction,
  typeStart,
  type TypeStart
} from "@/features/tickets/lib/creatorType"
import type { TypePrediction } from "@/features/tickets/lib/ticketRows"
import { failedOnUnknownTemplate } from "@/lib/mutationError"

import { useLastUsedType } from "./useLastUsedType"

export type CreatorType = Readonly<{
  type: TypeKey | null
  epics: boolean
  lastUsed: TypeKey | null | undefined
  start: TypeStart
  pick: (type: TypeKey | null) => void
  reset: () => void
  payload: Readonly<{ type: TypeKey | null }>
  prediction: TypePrediction | undefined
  settle: (exit: Exit.Exit<unknown, Readonly<{ _tag: string }>>) => void
}>

export function useCreatorType({
  orgSlug,
  slug,
  epics,
  initial
}: Readonly<{
  orgSlug: string
  slug: string
  epics: boolean
  initial?: TypeKey
}>) {
  const libraryAtom = projectLibraryFor(projectLibraryRequest(orgSlug, slug))
  const result = useAtomValue(libraryAtom)
  const refreshLibrary = useAtomRefresh(libraryAtom)
  const library: Library | null = AsyncResult.isSuccess(result)
    ? result.value
    : null
  const [lastUsed, setLastUsed] = useLastUsedType(orgSlug, slug)
  const [picked, setPicked] = useState<TypeKey | null | undefined>(initial)
  const type =
    picked === undefined
      ? startingType(library, lastUsed ?? null, epics)
      : picked

  const settle = useCallback(
    (exit: Exit.Exit<unknown, Readonly<{ _tag: string }>>) => {
      if (Exit.isSuccess(exit)) {
        if (type !== initial) setLastUsed(type)
      } else if (failedOnUnknownTemplate(exit)) refreshLibrary()
    },
    [refreshLibrary, setLastUsed, type, initial]
  )
  const reset = useCallback(() => setPicked(initial), [initial])

  return useMemo(() => {
    const definition =
      library === null || type === null ? null : typeFor(library, type)
    return {
      type,
      epics,
      lastUsed,
      start: typeStart(definition, lookupFor(library)),
      pick: setPicked,
      reset,
      payload: { type },
      prediction: typePrediction(library, type),
      settle
    } satisfies CreatorType
  }, [library, epics, lastUsed, type, reset, settle])
}
