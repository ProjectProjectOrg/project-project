import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  blockLookupFor,
  type BlockLookup,
  type Library,
  type TemplateDefinition,
  type TemplateKey
} from "@pp/shared"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useMemo, useState } from "react"

import { m } from "@/paraglide/messages"

import { BlockStrip } from "./BlockSketch"
import { templateSketch } from "./blockSketchModel"
import { LibraryCreateHeader } from "./LibraryCreateHeader"
import { LibraryEmpty } from "./LibraryEmpty"
import {
  canUnhide,
  copyKey,
  rowActions,
  splitHidden,
  templateDraftOf,
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
  createTemplateAtom,
  dropTemplateAtom,
  removeTemplateAtom,
  type LibraryScope
} from "./libraryScope"
import { LIBRARY_GRID_CLASS, LibrarySectionHeader } from "./LibrarySection"

type TemplateListProps = Readonly<{ scope: LibraryScope; library: Library }>

export function TemplateList({ scope, library }: TemplateListProps) {
  const lookup = useMemo(() => blockLookupFor(library), [library])
  const { visible, hidden } = splitHidden(library.templates)
  const isFresh = useFreshKeys(visible.map((entry) => entry.key))
  const taken = useMemo(
    () => new Set(library.templates.map((template) => template.key)),
    [library.templates]
  )
  const heading = {
    id: "library-list-heading-template",
    title: m.templates_settings_list_heading(),
    description:
      scope.layer === "org"
        ? m.templates_settings_list_description_org()
        : m.templates_settings_list_description()
  }
  return (
    <section aria-labelledby={heading.id} className="flex flex-col gap-3">
      {library.canEdit ? (
        <LibraryCreateHeader
          kind="template"
          scope={scope}
          taken={taken}
          heading={heading}
        />
      ) : (
        <LibrarySectionHeader {...heading} />
      )}
      {visible.length === 0 ? (
        <LibraryEmpty
          caption={m.templates_settings_empty()}
          hint={m.templates_settings_empty_hint()}
        />
      ) : (
        <ul className={LIBRARY_GRID_CLASS}>
          {visible.map((template) => (
            <TemplateCard
              key={template.key}
              scope={scope}
              library={library}
              template={template}
              lookup={lookup}
              taken={taken}
              fresh={isFresh(template.key)}
            />
          ))}
        </ul>
      )}
      <HiddenEntries
        entries={hidden.map((template) => ({
          ...template,
          unhide: canUnhide(template, scope.layer, library.canEdit)
        }))}
        renderUnhide={(key) => (
          <TemplateUnhide scope={scope} templateKey={key as TemplateKey} />
        )}
      />
    </section>
  )
}

function TemplateCard({
  scope,
  library,
  template,
  lookup,
  taken,
  fresh
}: Readonly<{
  scope: LibraryScope
  library: Library
  template: TemplateDefinition
  lookup: BlockLookup
  taken: ReadonlySet<string>
  fresh: boolean
}>) {
  const dropAtom = dropTemplateAtom(scope, template)
  const drop = useAtomSet(dropAtom, { mode: "promiseExit" })
  const create = useAtomSet(createTemplateAtom(scope), { mode: "promiseExit" })
  const dropState = useAtomValue(dropAtom)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const onAction = async (action: RowAction) => {
    setCreateError(null)
    if (action === "hide" || action === "reset" || action === "delete")
      return Exit.isSuccess(await drop())
    const draft = templateDraftOf(template)
    setCreating(true)
    const exit = await create(
      action === "customize"
        ? draft
        : {
            ...draft,
            key: copyKey(template.key, taken) as TemplateKey,
            name: m
              .templates_settings_copy_name({ name: template.name })
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
      kind="template"
      scope={scope}
      entry={template}
      strip={<BlockStrip blocks={templateSketch(template.body, lookup, 0)} />}
      actions={rowActions(template, scope.layer, library.canEdit)}
      onAction={onAction}
      waiting={dropState.waiting || creating}
      error={createError ?? failureText(dropState)}
      fresh={fresh}
    />
  )
}

function TemplateUnhide({
  scope,
  templateKey
}: Readonly<{ scope: LibraryScope; templateKey: TemplateKey }>) {
  const mutation = removeTemplateAtom(scope, templateKey)
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
