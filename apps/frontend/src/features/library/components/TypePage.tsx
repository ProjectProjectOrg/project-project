import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  TypeKey,
  type Library,
  type TypeDefinition,
  type UpdateTypeInput
} from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { useCallback, useState, type ReactNode } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { LibraryContext } from "@/features/editor/lib/blockChrome"
import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { deleteProjectTypeMovingTickets } from "../atoms/deleteType"
import {
  createTypeAtom,
  libraryView,
  removeTypeAtom,
  type LibraryScope
} from "../atoms/libraryScope"
import { useLibraryPermissions } from "../hooks/useLibraryPermissions"
import { saveTypeTask, useLibrarySave } from "../hooks/useLibrarySave"
import { entryView, type EntryView } from "../lib/entryStanding"
import { typeDraftOf } from "../lib/libraryModel"
import { BlockIconGlyph } from "./BlockIconGlyph"
import {
  AsideGroup,
  CommitInput,
  IconAndColorField,
  MUTED_VALUE_CLASS,
  NullablePriorityField,
  TemplateTagsField
} from "./DefinitionAside"
import { DeleteTypeDialog } from "./DeleteTypeDialog"
import {
  DeleteEntryConfirm,
  DeleteEntryTrigger,
  EntryActions
} from "./EntryActions"
import { EntryGone } from "./EntryGone"
import {
  LibraryEditorHeader,
  LibraryEditorLayout,
  LibraryEditorSkeleton,
  LibraryEntryFrame
} from "./LibraryEditorChrome"
import { useOpenList } from "./LibraryEntryLink"
import { ScopeBox } from "./ScopeBox"
import { StartingSections } from "./StartingSections"

const isTypeKey = Schema.is(TypeKey)

export function TypePage({
  scope,
  typeKey
}: Readonly<{ scope: LibraryScope; typeKey: string }>) {
  const result = useAtomValue(libraryView(scope))
  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => (
        <LibraryEntryFrame scope={scope} kind="type">
          <LibraryEditorSkeleton />
        </LibraryEntryFrame>
      )}
      onSuccess={({ value }) => (
        <LibraryContext value={value}>
          {isTypeKey(typeKey) ? (
            <TypeEntry scope={scope} library={value} typeKey={typeKey} />
          ) : (
            <LibraryEntryFrame scope={scope} kind="type">
              <EntryGone removal={[]} />
            </LibraryEntryFrame>
          )}
        </LibraryContext>
      )}
    />
  )
}

function TypeEntry({
  scope,
  library,
  typeKey
}: Readonly<{ scope: LibraryScope; library: Library; typeKey: TypeKey }>) {
  const permissions = useLibraryPermissions(scope, library)
  const forkAtom = createTypeAtom(scope)
  const restoreAtom = removeTypeAtom(scope, typeKey)
  const fork = useAtomSet(forkAtom, { mode: "promiseExit" })
  const restore = useAtomSet(restoreAtom, { mode: "promiseExit" })
  const forkState = useAtomValue(forkAtom)
  const restoreState = useAtomValue(restoreAtom)
  const deleteState = useAtomValue(
    scope.layer === "project"
      ? deleteProjectTypeMovingTickets({ req: scope.req, key: typeKey })
      : restoreAtom
  )
  const type = library.types.find((entry) => entry.key === typeKey)

  if (type === undefined)
    return (
      <LibraryEntryFrame scope={scope} kind="type">
        <EntryGone removal={[restoreState, deleteState]} />
      </LibraryEntryFrame>
    )

  const view = entryView(type, scope.layer, permissions)
  return (
    <TypeEditor
      scope={scope}
      library={library}
      type={type}
      view={view}
      notice={
        <ScopeBox
          scope={scope}
          kind="type"
          entry={type}
          view={view}
          actions={{
            fork: () => fork(typeDraftOf(type)),
            restore: () => restore(),
            waiting: forkState.waiting || restoreState.waiting,
            error:
              mutationErrorText(forkState) ?? mutationErrorText(restoreState)
          }}
        />
      }
    />
  )
}

function TypeEditor({
  scope,
  library,
  type,
  view,
  notice
}: Readonly<{
  scope: LibraryScope
  library: Library
  type: TypeDefinition
  view: EntryView
  notice: ReactNode
}>) {
  const save = useLibrarySave()
  const { run } = save
  const key = type.key
  const editable = view.editable

  const patch = useCallback(
    (input: UpdateTypeInput) =>
      void run(saveTypeTask(scope, key, input)).catch(() => {}),
    [key, run, scope]
  )

  return (
    <LibraryEditorLayout
      header={
        <LibraryEditorHeader scope={scope} kind="type" status={save.status} />
      }
      notice={notice}
      title={
        <div className="flex min-w-0 items-center gap-2">
          <BlockIconGlyph
            icon={type.icon}
            color={type.color}
            className="size-5"
          />
          {editable ? (
            <CommitInput
              value={type.name}
              onCommit={(name) => patch({ name })}
              ariaLabel={m.templates_editor_name_aria()}
              maxLength={60}
              required
              className="mx-0 text-display font-bold"
            />
          ) : (
            <h2 className="min-w-0 truncate px-2 text-display font-bold">
              {type.name}
            </h2>
          )}
        </div>
      }
      error={save.error}
      main={
        <>
          <h3 className="text-body font-semibold">
            {m.templates_types_starts_with({ name: type.name })}
          </h3>
          <StartingSections
            scope={scope}
            library={library}
            typeName={type.name}
            body={type.body}
            editable={editable}
            onChange={(body) => patch({ body })}
          />
          <p className="text-caption text-muted-foreground">
            {m.templates_types_starts_note()}
          </p>
        </>
      }
      aside={
        <>
          <AsideGroup>
            <MetaRow label={m.templates_editor_icon_label()}>
              <IconAndColorField
                icon={type.icon}
                color={type.color}
                onIcon={(icon) => patch({ icon })}
                onColor={(color) => patch({ color })}
                disabled={!editable}
              />
            </MetaRow>
            <MetaRow label={m.templates_editor_description_label()}>
              {editable ? (
                <CommitInput
                  value={type.description}
                  onCommit={(description) => patch({ description })}
                  ariaLabel={m.templates_editor_description_label()}
                  placeholder={m.templates_editor_description_placeholder()}
                  maxLength={200}
                />
              ) : (
                <span className={MUTED_VALUE_CLASS}>
                  {type.description === ""
                    ? m.templates_editor_none()
                    : type.description}
                </span>
              )}
            </MetaRow>
          </AsideGroup>
          <AsideGroup
            heading={m.templates_types_defaults_heading({ name: type.name })}
          >
            <MetaRow label={m.templates_editor_priority_label()}>
              <NullablePriorityField
                value={type.priority}
                onChange={(priority) => patch({ priority })}
                disabled={!editable}
              />
            </MetaRow>
            <MetaRow label={m.templates_editor_tags_label()}>
              <TemplateTagsField
                scope={scope}
                value={type.tags}
                onChange={(tags) => patch({ tags })}
                disabled={!editable}
              />
            </MetaRow>
          </AsideGroup>
          <TypeActions
            scope={scope}
            library={library}
            type={type}
            view={view}
          />
        </>
      }
    />
  )
}

function TypeActions({
  scope,
  library,
  type,
  view
}: Readonly<{
  scope: LibraryScope
  library: Library
  type: TypeDefinition
  view: EntryView
}>) {
  return (
    <EntryActions>
      {view.canDelete ? (
        scope.layer === "project" ? (
          <DeleteProjectType scope={scope} library={library} type={type} />
        ) : (
          <DeleteOrgType scope={scope} type={type} />
        )
      ) : null}
    </EntryActions>
  )
}

type ProjectScope = Extract<LibraryScope, { layer: "project" }>

function DeleteProjectType({
  scope,
  library,
  type
}: Readonly<{ scope: ProjectScope; library: Library; type: TypeDefinition }>) {
  const [open, setOpen] = useState(false)
  const openList = useOpenList()
  return (
    <>
      <DeleteEntryTrigger
        label={m.templates_types_delete()}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <DeleteTypeDialog
          req={scope.req}
          library={library}
          type={type}
          open={open}
          onOpenChange={setOpen}
          onDeleted={() => openList(scope, "type")}
        />
      ) : null}
    </>
  )
}

function DeleteOrgType({
  scope,
  type
}: Readonly<{ scope: LibraryScope; type: TypeDefinition }>) {
  const remove = useAtomSet(removeTypeAtom(scope, type.key), {
    mode: "promiseExit"
  })
  const openList = useOpenList()
  return (
    <DeleteEntryConfirm
      label={m.templates_types_delete()}
      name={type.name}
      onDelete={async () => {
        const exit = await remove()
        if (Exit.isSuccess(exit)) openList(scope, "type")
        return exit
      }}
    />
  )
}
