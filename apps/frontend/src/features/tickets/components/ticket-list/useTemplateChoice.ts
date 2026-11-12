import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import {
  ticketTypeForKey,
  typeFor,
  type Library,
  type TypeDefinition,
  type TypeKey,
  type TicketType
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
  ticketTypeOf: (key: TypeKey) => TicketType | null
  payload: Readonly<{ template?: TypeKey }>
  prediction: TemplatePrediction | undefined
  recover: (exit: Exit.Exit<unknown, Readonly<{ _tag: string }>>) => void
}>

export const orderedTemplates = (
  library: Library,
  type: TicketType
): ReadonlyArray<TypeDefinition> => {
  const active = library.types.filter((template) => !template.hidden)
  return [
    ...active.filter((template) => template.key === type),
    ...active.filter((template) => template.key !== type)
  ]
}

export const chosenTemplate = (
  library: Library,
  type: TicketType,
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
  type: TicketType
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
      ticketTypeOf: ticketTypeForKey,
      payload: template === null ? {} : { template: template.key },
      prediction:
        template === null
          ? undefined
          : { priority: template.priority, tags: template.tags },
      recover
    }
  }, [library, type, picked, recover])
}

export type TicketTypeChoice = Readonly<{
  type: TicketType
  setType: (next: TicketType) => void
  applyTemplateDefault: (next: TicketType) => void
}>

export function useTicketTypeChoice(
  initial: TicketType = "other"
): TicketTypeChoice {
  const [type, setTypeState] = useState<TicketType>(initial)
  const [explicit, setExplicit] = useState(false)
  const setType = useCallback((next: TicketType) => {
    setExplicit(true)
    setTypeState(next)
  }, [])
  const applyTemplateDefault = useCallback(
    (next: TicketType) => {
      if (!explicit) setTypeState(next)
    },
    [explicit]
  )
  return { type, setType, applyTemplateDefault }
}
