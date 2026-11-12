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
import type { TemplatePrediction } from "@/features/tickets/lib/ticketRows"
import { failedOnUnknownTemplate } from "@/lib/mutationError"

export type TemplateChoice = Readonly<{
  templates: ReadonlyArray<TypeDefinition>
  template: TypeDefinition | null
  defaultKey: TypeKey | null
  sticky: boolean
  ready: boolean
  pick: (key: TypeKey | null) => void
  payload: Readonly<{ type: TypeKey | null }>
  prediction: TemplatePrediction | undefined
  recover: (exit: Exit.Exit<unknown, Readonly<{ _tag: string }>>) => void
}>

export const orderedTemplates = (
  library: Library,
  type: TypeKey | null
): ReadonlyArray<TypeDefinition> => {
  const active = library.types.filter((template) => !template.hidden)
  return [
    ...active.filter((template) => template.key === type),
    ...active.filter((template) => template.key !== type)
  ]
}

export const chosenTemplate = (
  library: Library,
  type: TypeKey | null,
  picked: TypeKey | null | undefined
): TypeDefinition | null =>
  picked === undefined
    ? type === null
      ? null
      : typeFor(library, type)
    : picked === null
      ? null
      : (library.types.find(
          (template) => template.key === picked && !template.hidden
        ) ?? null)

export function useTemplateChoice(
  orgSlug: string,
  slug: string,
  type: TypeKey | null
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
        library === null || type === null
          ? null
          : (typeFor(library, type)?.key ?? null),
      sticky: picked !== undefined,
      ready: library !== null,
      pick: setPicked,
      payload: {
        type: library === null ? type : (template?.key ?? null)
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
  type: TypeKey | null
  setType: (next: TypeKey | null) => void
  applyTemplateDefault: (next: TypeKey | null) => void
}>

export function useTicketTypeChoice(
  initial: TypeKey | null = null
): TicketTypeChoice {
  const [type, setTypeState] = useState<TypeKey | null>(initial)
  const [explicit, setExplicit] = useState(false)
  const setType = useCallback((next: TypeKey | null) => {
    setExplicit(true)
    setTypeState(next)
  }, [])
  const applyTemplateDefault = useCallback(
    (next: TypeKey | null) => {
      if (!explicit) setTypeState(next)
    },
    [explicit]
  )
  return { type, setType, applyTemplateDefault }
}
