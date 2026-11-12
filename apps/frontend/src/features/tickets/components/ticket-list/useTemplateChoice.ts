import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import {
  typeFor,
  type Library,
  type TypeDefinition,
  type TypeKey
} from "@pp/shared"
import type * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useCallback, useMemo, useState } from "react"

import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import {
  pickableTypeFor,
  typeKeyOf,
  type PickableType
} from "@/features/tickets/lib/ticketMeta"
import type { TemplatePrediction } from "@/features/tickets/lib/ticketRows"
import { failedOnUnknownTemplate } from "@/lib/mutationError"

export type TemplateChoice = Readonly<{
  templates: ReadonlyArray<TypeDefinition>
  template: TypeDefinition | null
  defaultKey: TypeKey | null
  sticky: boolean
  ready: boolean
  pick: (key: TypeKey | null) => void
  ticketTypeOf: (key: TypeKey) => PickableType | null
  payload: Readonly<{ type: TypeKey | null }>
  prediction: TemplatePrediction | undefined
  recover: (exit: Exit.Exit<unknown, Readonly<{ _tag: string }>>) => void
}>

export const orderedTemplates = (
  library: Library,
  type: PickableType
): ReadonlyArray<TypeDefinition> => {
  const active = library.types.filter((template) => !template.hidden)
  return [
    ...active.filter((template) => template.key === type),
    ...active.filter((template) => template.key !== type)
  ]
}

export const chosenTemplate = (
  library: Library,
  type: PickableType,
  picked: TypeKey | null | undefined
): TypeDefinition | null =>
  picked === undefined
    ? typeFor(library, type)
    : picked === null
      ? null
      : (library.types.find(
          (template) => template.key === picked && !template.hidden
        ) ?? null)

export function useTemplateChoice(
  orgSlug: string,
  slug: string,
  type: PickableType
): TemplateChoice {
  const libraryAtom = projectLibraryFor(projectLibraryRequest(orgSlug, slug))
  const result = useAtomValue(libraryAtom)
  const refreshLibrary = useAtomRefresh(libraryAtom)
  const library = AsyncResult.isSuccess(result) ? result.value : null
  const [picked, setPicked] = useState<TypeKey | null | undefined>(undefined)
  const recover = useCallback(
    (exit: Exit.Exit<unknown, Readonly<{ _tag: string }>>) => {
      if (failedOnUnknownTemplate(exit)) refreshLibrary()
    },
    [refreshLibrary]
  )
  return useMemo(() => {
    const template =
      library === null ? null : chosenTemplate(library, type, picked)
    return {
      templates: library === null ? [] : orderedTemplates(library, type),
      template,
      defaultKey:
        library === null ? null : (typeFor(library, type)?.key ?? null),
      sticky: picked !== undefined,
      ready: library !== null,
      pick: setPicked,
      ticketTypeOf: pickableTypeFor,
      payload: {
        type: library === null ? typeKeyOf(type) : (template?.key ?? null)
      },
      prediction:
        template === null
          ? undefined
          : { priority: template.priority, tags: template.tags },
      recover
    }
  }, [library, type, picked, recover])
}

export type TicketTypeChoice = Readonly<{
  type: PickableType
  setType: (next: PickableType) => void
  applyTemplateDefault: (next: PickableType) => void
}>

export function useTicketTypeChoice(
  initial: PickableType = "other"
): TicketTypeChoice {
  const [type, setTypeState] = useState<PickableType>(initial)
  const [explicit, setExplicit] = useState(false)
  const setType = useCallback((next: PickableType) => {
    setExplicit(true)
    setTypeState(next)
  }, [])
  const applyTemplateDefault = useCallback(
    (next: PickableType) => {
      if (!explicit) setTypeState(next)
    },
    [explicit]
  )
  return { type, setType, applyTemplateDefault }
}
