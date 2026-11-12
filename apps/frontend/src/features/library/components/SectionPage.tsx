import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  BlockKey,
  stripHints,
  type BlockDefinition,
  type Library,
  type UpdateBlockInput
} from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { useCallback, useId, useMemo, useState, type ReactNode } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { Switch } from "@/components/ui/switch"
import {
  LexicalEditor,
  type SaveStatus
} from "@/features/editor/components/LexicalEditor"
import { Markdown } from "@/features/editor/components/Markdown"
import type { EditorBlocks } from "@/features/editor/lexical/blocks/editorBlocks"
import { LibraryContext } from "@/features/editor/lib/blockChrome"
import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import {
  createBlockAtom,
  libraryView,
  removeBlockAtom,
  type LibraryScope
} from "../atoms/libraryScope"
import { useLibraryPermissions } from "../hooks/useLibraryPermissions"
import { saveBlockTask, useLibrarySave } from "../hooks/useLibrarySave"
import {
  entryView,
  type EntryView,
  type LibraryPermissions
} from "../lib/entryStanding"
import { blockDraftOf, containsBlockMarkup } from "../lib/libraryModel"
import { typesUsingSection } from "../lib/sectionUsage"
import { BlockIconGlyph } from "./BlockIconGlyph"
import {
  AsideGroup,
  CommitInput,
  IconAndColorField,
  MUTED_VALUE_CLASS
} from "./DefinitionAside"
import { DeleteEntryConfirm, EntryActions } from "./EntryActions"
import { SameOnEveryTicketBadge } from "./EntryBadges"
import { EntryGone } from "./EntryGone"
import {
  combinedStatus,
  LibraryEditorHeader,
  LibraryEditorLayout,
  LibraryEditorSkeleton,
  LibraryEntryFrame
} from "./LibraryEditorChrome"
import { LibraryEntryLink, useOpenList } from "./LibraryEntryLink"
import { ProjectVersions } from "./ProjectVersions"
import { ScopeBox } from "./ScopeBox"

const isBlockKey = Schema.is(BlockKey)

const ignoreEditDefinition: EditorBlocks["onEditDefinition"] = () => {}

export class NestedBlockError extends Error {}

export function SectionPage({
  scope,
  sectionKey
}: Readonly<{ scope: LibraryScope; sectionKey: string }>) {
  const result = useAtomValue(libraryView(scope))
  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => (
        <LibraryEntryFrame scope={scope} kind="section">
          <LibraryEditorSkeleton />
        </LibraryEntryFrame>
      )}
      onSuccess={({ value }) => (
        <LibraryContext value={value}>
          {isBlockKey(sectionKey) ? (
            <SectionEntry
              scope={scope}
              library={value}
              sectionKey={sectionKey}
            />
          ) : (
            <LibraryEntryFrame scope={scope} kind="section">
              <EntryGone removal={[]} />
            </LibraryEntryFrame>
          )}
        </LibraryContext>
      )}
    />
  )
}

function SectionEntry({
  scope,
  library,
  sectionKey
}: Readonly<{ scope: LibraryScope; library: Library; sectionKey: BlockKey }>) {
  const permissions = useLibraryPermissions(scope, library)
  const forkAtom = createBlockAtom(scope)
  const restoreAtom = removeBlockAtom(scope, sectionKey)
  const fork = useAtomSet(forkAtom, { mode: "promiseExit" })
  const restore = useAtomSet(restoreAtom, { mode: "promiseExit" })
  const forkState = useAtomValue(forkAtom)
  const restoreState = useAtomValue(restoreAtom)
  const section = library.blocks.find((entry) => entry.key === sectionKey)

  if (section === undefined)
    return (
      <LibraryEntryFrame scope={scope} kind="section">
        <EntryGone removal={[restoreState]} />
      </LibraryEntryFrame>
    )

  const view = entryView(section, scope.layer, permissions)
  return (
    <SectionEditor
      scope={scope}
      library={library}
      section={section}
      view={view}
      permissions={permissions}
      notice={
        <ScopeBox
          scope={scope}
          kind="section"
          entry={section}
          view={view}
          actions={{
            fork: () => fork(blockDraftOf(section)),
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

function SectionEditor({
  scope,
  library,
  section,
  view,
  permissions,
  notice
}: Readonly<{
  scope: LibraryScope
  library: Library
  section: BlockDefinition
  view: EntryView
  permissions: LibraryPermissions
  notice: ReactNode
}>) {
  const save = useLibrarySave()
  const { run } = save
  const [editorStatus, setEditorStatus] = useState<SaveStatus>("idle")
  const [markupError, setMarkupError] = useState<string | null>(null)
  const syncId = useId()
  const key = section.key
  const editable = view.editable
  const usedBy = typesUsingSection(library, key)

  const patch = useCallback(
    (input: UpdateBlockInput) =>
      void run(saveBlockTask(scope, key, input)).catch(() => {}),
    [key, run, scope]
  )

  const saveContent = (content: string) => {
    if (containsBlockMarkup(content)) {
      const message = m.templates_error_blocks_not_allowed()
      setMarkupError(message)
      return Promise.reject(new NestedBlockError(message))
    }
    setMarkupError(null)
    return run(saveBlockTask(scope, key, { content }))
  }

  const blocks = useMemo<EditorBlocks>(
    () => ({
      mode: "definition",
      library,
      ticketType: null,
      canEdit: permissions,
      onEditDefinition: ignoreEditDefinition
    }),
    [permissions, library]
  )

  return (
    <LibraryEditorLayout
      header={
        <LibraryEditorHeader
          scope={scope}
          kind="section"
          status={combinedStatus(editorStatus, save.status)}
        />
      }
      notice={notice}
      title={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <BlockIconGlyph
            icon={section.icon}
            color={section.color}
            className="size-5"
          />
          {editable ? (
            <CommitInput
              value={section.name}
              onCommit={(name) => patch({ name })}
              ariaLabel={m.templates_editor_name_aria()}
              maxLength={60}
              required
              className="mx-0 min-w-0 flex-1 text-display font-bold"
            />
          ) : (
            <h2 className="min-w-0 truncate px-2 text-display font-bold">
              {section.name}
            </h2>
          )}
          {section.sync ? <SameOnEveryTicketBadge /> : null}
        </div>
      }
      error={markupError ?? save.error}
      main={
        <>
          <h3 className="text-body font-semibold">
            {m.templates_sections_content_heading()}
          </h3>
          {editable ? (
            <div
              data-section-editor
              className="rounded-lg border border-border bg-background px-3 py-2"
            >
              <LexicalEditor
                key={`${section.origin}:${key}`}
                markdown={section.content}
                onChange={saveContent}
                onStatusChange={setEditorStatus}
                placeholder={m.templates_editor_block_placeholder()}
                blocks={blocks}
              />
            </div>
          ) : (
            <div
              data-section-preview
              className="rounded-lg border border-border px-3 py-2"
            >
              <Markdown className="text-body">
                {stripHints(section.content)}
              </Markdown>
            </div>
          )}
          {editable ? (
            <p className="text-caption text-muted-foreground">
              {m.templates_sections_hint_help()}
            </p>
          ) : null}
        </>
      }
      aside={
        <>
          <AsideGroup>
            <MetaRow label={m.templates_editor_icon_label()}>
              <IconAndColorField
                icon={section.icon}
                color={section.color}
                onIcon={(icon) => patch({ icon })}
                onColor={(color) => patch({ color })}
                disabled={!editable}
              />
            </MetaRow>
            <MetaRow label={m.templates_editor_description_label()}>
              {editable ? (
                <CommitInput
                  value={section.description}
                  onCommit={(description) => patch({ description })}
                  ariaLabel={m.templates_editor_description_label()}
                  placeholder={m.templates_editor_description_placeholder()}
                  maxLength={200}
                />
              ) : (
                <span className={MUTED_VALUE_CLASS}>
                  {section.description === ""
                    ? m.templates_editor_none()
                    : section.description}
                </span>
              )}
            </MetaRow>
          </AsideGroup>
          <AsideGroup>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={syncId} className="text-body">
                  {m.templates_sections_same_label()}
                </label>
                <Switch
                  id={syncId}
                  checked={section.sync}
                  disabled={!editable}
                  aria-describedby={`${syncId}-help`}
                  onCheckedChange={(sync) => patch({ sync })}
                />
              </div>
              <p
                id={`${syncId}-help`}
                className="text-caption text-muted-foreground"
              >
                {section.sync
                  ? m.templates_sections_same_on()
                  : m.templates_sections_same_off()}
              </p>
            </div>
          </AsideGroup>
          <AsideGroup>
            <MetaRow label={m.templates_sections_used_by()}>
              {usedBy.length === 0 ? (
                <span className={MUTED_VALUE_CLASS}>
                  {m.templates_sections_used_by_none()}
                </span>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {usedBy.map((type) => (
                    <li key={type.key}>
                      <LibraryEntryLink
                        scope={scope}
                        kind="type"
                        entryKey={type.key}
                        className="-mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-body transition-colors hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <BlockIconGlyph
                          icon={type.icon}
                          color={type.color}
                          className="size-3.5"
                        />
                        {type.name}
                      </LibraryEntryLink>
                    </li>
                  ))}
                </ul>
              )}
            </MetaRow>
          </AsideGroup>
          {scope.layer === "org" ? (
            <ProjectVersions
              orgSlug={scope.req.params.orgSlug}
              kind="section"
              entryKey={section.key}
            />
          ) : null}
          <SectionActions scope={scope} section={section} view={view} />
        </>
      }
    />
  )
}

function SectionActions({
  scope,
  section,
  view
}: Readonly<{
  scope: LibraryScope
  section: BlockDefinition
  view: EntryView
}>) {
  return (
    <EntryActions>
      {view.canDelete ? (
        <DeleteSection scope={scope} section={section} />
      ) : null}
    </EntryActions>
  )
}

function DeleteSection({
  scope,
  section
}: Readonly<{ scope: LibraryScope; section: BlockDefinition }>) {
  const remove = useAtomSet(removeBlockAtom(scope, section.key), {
    mode: "promiseExit"
  })
  const openList = useOpenList()
  return (
    <DeleteEntryConfirm
      label={m.templates_sections_delete()}
      name={section.name}
      onDelete={async () => {
        const exit = await remove()
        if (Exit.isSuccess(exit)) openList(scope, "section")
        return exit
      }}
    />
  )
}
