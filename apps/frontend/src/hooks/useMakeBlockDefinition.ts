import { RegistryContext } from "@effect/atom-react"
import { restoreDefinitionHints, type BlockDefinition } from "@pp/shared"
import * as Effect from "effect/Effect"
import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type * as Atom from "effect/unstable/reactivity/Atom"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { useCallback, useContext } from "react"

import type { EditorBlocks } from "@/components/Lexical/blocks/editorBlocks"
import { failureText } from "@/components/Library/LibraryRow"
import {
  projectLibraryRequest,
  updateOrgBlockFromProject,
  updateProjectBlock
} from "@/features/library/atoms/library"

const fire = <A, E extends Readonly<{ _tag: string }>, I>(
  registry: Registry.AtomRegistry,
  atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, I>,
  input: I,
  onError: (message: string) => void
) => {
  const unmount = registry.mount(atom)
  registry.set(atom, input)
  void Effect.runPromiseExit(
    Registry.getResult(registry, atom, { suspendOnWaiting: true })
  ).finally(() => {
    const message = failureText(registry.get(atom))
    if (message !== null) onError(message)
    unmount()
  })
}

export function useMakeBlockDefinition(
  orgSlug: string,
  slug: string,
  onError: (message: string) => void
): NonNullable<EditorBlocks["onMakeDefinition"]> {
  const registry = useContext(RegistryContext)
  return useCallback(
    (definition: BlockDefinition, content: string) => {
      const target = {
        req: projectLibraryRequest(orgSlug, slug),
        key: definition.key
      }
      fire(
        registry,
        definition.origin === "project"
          ? updateProjectBlock(target)
          : updateOrgBlockFromProject(target),
        { content: restoreDefinitionHints(content, definition.content) },
        onError
      )
    },
    [onError, orgSlug, registry, slug]
  )
}
