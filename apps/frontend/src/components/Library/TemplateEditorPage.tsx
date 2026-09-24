import { useAtomValue } from "@effect/atom-react"
import {
  blockLookupFor,
  expandTemplate,
  ticketTypeForTemplate,
  type Library,
  type TemplateDefinition,
  type UpdateTemplateInput
} from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useCallback, useMemo, useState } from "react"

import { LibraryContext } from "@/components/blocks/blockChrome"
import { ErrorPage } from "@/components/ErrorPage"
import type { EditorBlocks } from "@/components/Lexical/blocks/editorBlocks"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { Markdown } from "@/components/Markdown"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BlockIconGlyph } from "./BlockIconGlyph"
import {
  AsideField,
  CommitInput,
  DefaultForField,
  IconAndColorField,
  MutedValue,
  NullablePriorityField,
  TemplateTagsField,
  originLabel
} from "./DefinitionAside"
import {
  LibraryEditorHeader,
  LibraryEditorLayout,
  LibraryEditorSkeleton,
  LibraryEntryMissing,
  type EditorTab
} from "./LibraryEditorChrome"
import { useOpenEntry } from "./LibraryEntryLink"
import { libraryView, type LibraryScope } from "./libraryScope"
import { saveTemplateTask, useLibrarySave } from "./useLibrarySave"

export function useLayerPermissions(
  scope: LibraryScope,
  library: Library
): EditorBlocks["canEdit"] {
  const orgResult = useAtomValue(
    orgDetail(orgRequest(scope.req.params.orgSlug))
  )
  const orgAdmin =
    AsyncResult.isSuccess(orgResult) &&
    (orgResult.value.role === "owner" || orgResult.value.role === "admin")
  return useMemo(
    () =>
      scope.layer === "org"
        ? { org: library.canEdit, project: false }
        : { org: orgAdmin, project: library.canEdit },
    [library.canEdit, orgAdmin, scope.layer]
  )
}

export const combinedStatus = (
  editor: SaveStatus,
  save: SaveStatus
): SaveStatus => {
  if (save === "saving") return "saving"
  if (editor === "dirty") return "dirty"
  return save === "idle" ? editor : save
}

export function TemplateEditorPage({
  scope,
  templateKey
}: Readonly<{ scope: LibraryScope; templateKey: string }>) {
  const result = useAtomValue(libraryView(scope))
  return AsyncResult.matchWithError(result, {
    onInitial: () => (
      <div className="flex w-full flex-col gap-4">
        <LibraryEditorHeader scope={scope} kind="template" status="idle" />
        <LibraryEditorSkeleton />
      </div>
    ),
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value }) => {
      const template = value.templates.find(
        (entry) => entry.key === templateKey
      )
      return (
        <LibraryContext value={value}>
          {template === undefined ? (
            <div className="flex w-full flex-col gap-4">
              <LibraryEditorHeader
                scope={scope}
                kind="template"
                status="idle"
              />
              <LibraryEntryMissing />
            </div>
          ) : (
            <TemplateEditor scope={scope} library={value} template={template} />
          )}
        </LibraryContext>
      )
    }
  })
}

function TemplateEditor({
  scope,
  library,
  template
}: Readonly<{
  scope: LibraryScope
  library: Library
  template: TemplateDefinition
}>) {
  const save = useLibrarySave()
  const { run } = save
  const [tab, setTab] = useState<EditorTab>("edit")
  const [draft, setDraft] = useState(template.body)
  const [editorStatus, setEditorStatus] = useState<SaveStatus>("idle")
  const canEdit = useLayerPermissions(scope, library)
  const openEntry = useOpenEntry(scope)
  const key = template.key
  const editable = library.canEdit

  const patch = useCallback(
    (input: UpdateTemplateInput) =>
      void run(saveTemplateTask(scope, key, input)).catch(() => {}),
    [key, run, scope]
  )

  const onEditDefinition = useCallback<EditorBlocks["onEditDefinition"]>(
    (_kind, blockKey) => openEntry("block", blockKey),
    [openEntry]
  )

  const blocks = useMemo<EditorBlocks>(
    () => ({
      mode: "template",
      library,
      ticketType: ticketTypeForTemplate(library.defaults, key),
      canEdit,
      onEditDefinition
    }),
    [canEdit, key, library, onEditDefinition]
  )

  const preview = expandTemplate({ body: draft }, blockLookupFor(library))
  const showPreview = tab === "preview" || !editable

  return (
    <LibraryEditorLayout
      header={
        <LibraryEditorHeader
          scope={scope}
          kind="template"
          status={combinedStatus(editorStatus, save.status)}
          tab={editable ? tab : undefined}
          onTabChange={setTab}
        />
      }
      title={
        <div className="relative flex items-center pl-7">
          <BlockIconGlyph
            icon={template.icon}
            color={template.color}
            className="absolute left-1.5"
          />
          {editable ? (
            <CommitInput
              value={template.name}
              onCommit={(name) => patch({ name })}
              ariaLabel={m.templates_editor_name_aria()}
              maxLength={60}
              required
              className="text-xl font-semibold"
            />
          ) : (
            <h2 className="text-xl font-semibold">{template.name}</h2>
          )}
        </div>
      }
      error={save.error}
      main={
        <>
          {editable ? (
            <div
              data-template-editor
              data-block-rail-host
              className={cn(
                "ml-7 rounded-lg border border-border bg-background px-3 py-2",
                showPreview && "hidden"
              )}
            >
              <LexicalEditor
                key={`${scope.layer}:${key}`}
                markdown={template.body}
                onDraftChange={setDraft}
                onChange={(body) => run(saveTemplateTask(scope, key, { body }))}
                onStatusChange={setEditorStatus}
                placeholder={m.templates_editor_placeholder()}
                blocks={blocks}
              />
            </div>
          ) : null}
          {showPreview ? (
            <div
              data-template-preview
              className="ml-7 rounded-lg border border-border bg-background px-3 py-2"
            >
              {preview.trim() === "" ? (
                <p className="text-sm text-muted-foreground">
                  {m.templates_editor_preview_empty()}
                </p>
              ) : (
                <Markdown className="text-sm">{preview}</Markdown>
              )}
            </div>
          ) : null}
        </>
      }
      aside={
        <>
          <AsideField label={m.templates_editor_icon_label()}>
            <IconAndColorField
              icon={template.icon}
              color={template.color}
              onIcon={(icon) => patch({ icon })}
              onColor={(color) => patch({ color })}
              disabled={!editable}
            />
          </AsideField>
          <AsideField label={m.templates_editor_description_label()}>
            {editable ? (
              <CommitInput
                value={template.description}
                onCommit={(description) => patch({ description })}
                ariaLabel={m.templates_editor_description_label()}
                placeholder={m.templates_editor_description_placeholder()}
                maxLength={200}
              />
            ) : (
              <MutedValue>{template.description}</MutedValue>
            )}
          </AsideField>
          <AsideField label={m.templates_editor_default_for_label()}>
            <DefaultForField
              scope={scope}
              library={library}
              templateKey={key}
            />
          </AsideField>
          <AsideField label={m.templates_editor_priority_label()}>
            <NullablePriorityField
              value={template.priority}
              onChange={(priority) => patch({ priority })}
              disabled={!editable}
            />
          </AsideField>
          <AsideField label={m.templates_editor_tags_label()}>
            <TemplateTagsField
              scope={scope}
              value={template.tags}
              onChange={(tags) => patch({ tags })}
              disabled={!editable}
            />
          </AsideField>
          <AsideField label={m.templates_editor_scope_label()}>
            <MutedValue>
              {template.origin === scope.layer
                ? originLabel(scope.layer)
                : m.templates_editor_scope_inherited({
                    layer: originLabel(scope.layer),
                    origin: originLabel(template.origin)
                  })}
            </MutedValue>
          </AsideField>
        </>
      }
    />
  )
}
