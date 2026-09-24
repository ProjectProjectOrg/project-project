import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import {
  templateFor,
  ticketTypeForTemplate,
  type Library,
  type TemplateDefinition,
  type TemplateKey,
  type TicketType
} from "@pp/shared"
import type * as Exit from "effect/Exit"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useCallback, useMemo, useState } from "react"

import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import type { QuickCreatePrediction } from "@/features/tickets/atoms/backlog"

import { failedOnUnknownTemplate } from "./creatorError"

export type TemplateChoice = Readonly<{
  templates: ReadonlyArray<TemplateDefinition>
  template: TemplateDefinition | null
  defaultKey: TemplateKey | null
  sticky: boolean
  ready: boolean
  pick: (key: TemplateKey | null) => void
  ticketTypeOf: (key: TemplateKey) => TicketType | null
  payload: Readonly<{ template?: TemplateKey }>
  prediction: QuickCreatePrediction | undefined
  recover: (exit: Exit.Exit<unknown, Readonly<{ _tag: string }>>) => void
}>

export const orderedTemplates = (
  library: Library,
  type: TicketType
): ReadonlyArray<TemplateDefinition> => {
  const defaultKey = library.defaults[type]
  const active = library.templates.filter((template) => !template.hidden)
  return [
    ...active.filter((template) => template.key === defaultKey),
    ...active.filter((template) => template.key !== defaultKey)
  ]
}

export const chosenTemplate = (
  library: Library,
  type: TicketType,
  picked: TemplateKey | null | undefined
): TemplateDefinition | null =>
  picked === undefined
    ? templateFor(library, type)
    : picked === null
      ? null
      : (library.templates.find(
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
  const [picked, setPicked] = useState<TemplateKey | null | undefined>(
    undefined
  )
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
      defaultKey: library === null ? null : library.defaults[type],
      sticky: picked !== undefined,
      ready: library !== null,
      pick: setPicked,
      ticketTypeOf: (key: TemplateKey) =>
        library === null ? null : ticketTypeForTemplate(library.defaults, key),
      payload: template === null ? {} : { template: template.key },
      prediction:
        template === null
          ? undefined
          : { priority: template.priority, tags: template.tags },
      recover
    }
  }, [library, type, picked, recover])
}
