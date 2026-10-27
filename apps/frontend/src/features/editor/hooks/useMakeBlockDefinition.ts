import { RegistryContext } from "@effect/atom-react"
import { restoreDefinitionHints, type BlockDefinition } from "@pp/shared"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import type * as Registry from "effect/reactivity/AtomRegistry"
import { useCallback, useContext } from "react"

import { fireMutation } from "@/api/viewMutation"
import type { EditorBlocks } from "@/features/editor/lexical/blocks/editorBlocks"
import {
  projectLibraryRequest,
  updateOrgBlockFromProject,
  updateProjectBlock
} from "@/features/library/atoms/library"
import { mutationErrorText } from "@/lib/mutationError"

const fire = <A, E extends Readonly<{ _tag: string }>, I>(
  registry: Registry.AtomRegistry,
  atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, I>,
  input: I,
  onError: (message: string) => void
) => {
  void fireMutation(registry, atom, input).then((result) => {
    const message = mutationErrorText(result)
    if (message !== null) onError(message)
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
