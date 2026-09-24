import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { BlockDefinition, BlockKey, Library } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useMemo, useState } from "react"

import { m } from "@/paraglide/messages"

import { LibraryCreateHeader } from "./LibraryCreateHeader"
import { LibraryEmpty } from "./LibraryEmpty"
import {
  blockDraftOf,
  canUnhide,
  copyKey,
  rowActions,
  splitHidden,
  type RowAction
} from "./libraryModel"
import {
  failureText,
  HiddenEntries,
  LibraryCard,
  useFreshKeys,
  UnhideButton
} from "./LibraryRow"
import {
  createBlockAtom,
  dropBlockAtom,
  removeBlockAtom,
  type LibraryScope
} from "./libraryScope"
import { LIBRARY_GRID_CLASS, LibrarySectionHeader } from "./LibrarySection"
import { LibrarySyncedLabel } from "./LibrarySyncedLabel"

type BlockListProps = Readonly<{ scope: LibraryScope; library: Library }>

export function BlockList({ scope, library }: BlockListProps) {
  const { visible, hidden } = splitHidden(library.blocks)
  const isFresh = useFreshKeys(visible.map((entry) => entry.key))
  const taken = useMemo(
    () => new Set(library.blocks.map((block) => block.key)),
    [library.blocks]
  )
  const heading = {
    id: "library-list-heading-block",
    title: m.templates_settings_list_heading_blocks(),
    description:
      scope.layer === "org"
        ? m.templates_settings_list_description_blocks_org()
        : m.templates_settings_list_description_blocks()
  }
  return (
    <section aria-labelledby={heading.id} className="flex flex-col gap-3">
      {library.canEdit ? (
        <LibraryCreateHeader
          kind="block"
          scope={scope}
          taken={taken}
          heading={heading}
        />
      ) : (
        <LibrarySectionHeader {...heading} />
      )}
      {visible.length === 0 ? (
        <LibraryEmpty
          caption={m.templates_settings_empty_blocks()}
          hint={m.templates_settings_empty_blocks_hint()}
        />
      ) : (
        <ul className={LIBRARY_GRID_CLASS}>
          {visible.map((block) => (
            <BlockCard
              key={block.key}
              scope={scope}
              canEdit={library.canEdit}
              block={block}
              taken={taken}
              fresh={isFresh(block.key)}
            />
          ))}
        </ul>
      )}
      <HiddenEntries
        entries={hidden.map((block) => ({
          ...block,
          unhide: canUnhide(block, scope.layer, library.canEdit)
        }))}
        renderUnhide={(key) => (
          <BlockUnhide scope={scope} blockKey={key as BlockKey} />
        )}
      />
    </section>
  )
}

function BlockCard({
  scope,
  canEdit,
  block,
  taken,
  fresh
}: Readonly<{
  scope: LibraryScope
  canEdit: boolean
  block: BlockDefinition
  taken: ReadonlySet<string>
  fresh: boolean
}>) {
  const dropAtom = dropBlockAtom(scope, block)
  const drop = useAtomSet(dropAtom, { mode: "promiseExit" })
  const create = useAtomSet(createBlockAtom(scope), { mode: "promiseExit" })
  const dropState = useAtomValue(dropAtom)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const onAction = async (action: RowAction) => {
    setCreateError(null)
    if (action === "hide" || action === "reset" || action === "delete")
      return Exit.isSuccess(await drop())
    const draft = blockDraftOf(block)
    setCreating(true)
    const exit = await create(
      action === "customize"
        ? draft
        : {
            ...draft,
            key: copyKey(block.key, taken) as BlockKey,
            name: m
              .templates_settings_copy_name({ name: block.name })
              .slice(0, 60)
          }
    )
    setCreating(false)
    if (Exit.isFailure(exit))
      setCreateError(failureText(AsyncResult.fromExit(exit)))
    return Exit.isSuccess(exit)
  }

  return (
    <LibraryCard
      kind="block"
      scope={scope}
      entry={block}
      badge={block.sync ? <LibrarySyncedLabel /> : null}
      actions={rowActions(block, scope.layer, canEdit)}
      onAction={onAction}
      waiting={dropState.waiting || creating}
      error={createError ?? failureText(dropState)}
      fresh={fresh}
    />
  )
}

function BlockUnhide({
  scope,
  blockKey
}: Readonly<{ scope: LibraryScope; blockKey: BlockKey }>) {
  const mutation = removeBlockAtom(scope, blockKey)
  // Promise mode keeps the mutation mounted after the optimistic unhide
  // unmounts this row, so the confirm and the refetch still run.
  const unhide = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  return (
    <UnhideButton
      waiting={state.waiting}
      error={failureText(state)}
      onUnhide={() => void unhide()}
    />
  )
}
