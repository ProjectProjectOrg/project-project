import { useAtomValue } from "@effect/atom-react"
import {
  stripHints,
  type BlockDefinition,
  type Library,
  type UpdateBlockInput
} from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useCallback, useId, useMemo, useState } from "react"

import { LibraryContext } from "@/components/blocks/blockChrome"
import { ErrorPage } from "@/components/ErrorPage"
import type { EditorBlocks } from "@/components/Lexical/blocks/editorBlocks"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { Markdown } from "@/components/Markdown"
import { Switch } from "@/components/ui/switch"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { m } from "@/paraglide/messages"

import { BlockIconGlyph } from "./BlockIconGlyph"
import {
  AsideField,
  CommitInput,
  IconAndColorField,
  MutedValue,
  originLabel
} from "./DefinitionAside"
import {
  LibraryEditorHeader,
  LibraryEditorLayout,
  LibraryEditorSkeleton,
  LibraryEntryMissing
} from "./LibraryEditorChrome"
import { libraryView, type LibraryScope } from "./libraryScope"
import { saveBlockTask, useLibrarySave } from "./useLibrarySave"

const BLOCK_MARKUP_LINE = /^ {0,3}<\/?block\b/m

export const containsBlockMarkup = (content: string): boolean =>
  BLOCK_MARKUP_LINE.test(content)

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

const ignoreEditDefinition: EditorBlocks["onEditDefinition"] = () => {}

export class NestedBlockError extends Error {}

export function BlockEditorPage({
  scope,
  blockKey
}: Readonly<{ scope: LibraryScope; blockKey: string }>) {
  const result = useAtomValue(libraryView(scope))
  return AsyncResult.matchWithError(result, {
    onInitial: () => (
      <div className="flex w-full flex-col gap-4">
        <LibraryEditorHeader scope={scope} kind="block" status="idle" />
        <LibraryEditorSkeleton />
      </div>
    ),
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value }) => {
      const block = value.blocks.find((entry) => entry.key === blockKey)
      return (
        <LibraryContext value={value}>
          {block === undefined ? (
            <div className="flex w-full flex-col gap-4">
              <LibraryEditorHeader scope={scope} kind="block" status="idle" />
              <LibraryEntryMissing />
            </div>
          ) : (
            <BlockEditor scope={scope} library={value} block={block} />
          )}
        </LibraryContext>
      )
    }
  })
}

function BlockEditor({
  scope,
  library,
  block
}: Readonly<{
  scope: LibraryScope
  library: Library
  block: BlockDefinition
}>) {
  const save = useLibrarySave()
  const { run } = save
  const [editorStatus, setEditorStatus] = useState<SaveStatus>("idle")
  const [markupError, setMarkupError] = useState<string | null>(null)
  const canEdit = useLayerPermissions(scope, library)
  const syncId = useId()
  const key = block.key
  const editable = library.canEdit

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
      canEdit,
      onEditDefinition: ignoreEditDefinition
    }),
    [canEdit, library]
  )

  return (
    <LibraryEditorLayout
      header={
        <LibraryEditorHeader
          scope={scope}
          kind="block"
          status={combinedStatus(editorStatus, save.status)}
        />
      }
      title={
        <div className="flex items-center gap-2">
          <BlockIconGlyph icon={block.icon} color={block.color} />
          {editable ? (
            <CommitInput
              value={block.name}
              onCommit={(name) => patch({ name })}
              ariaLabel={m.templates_editor_name_aria()}
              maxLength={60}
              required
              className="text-xl font-semibold"
            />
          ) : (
            <h2 className="text-xl font-semibold">{block.name}</h2>
          )}
        </div>
      }
      error={markupError ?? save.error}
      main={
        <>
          {editable ? (
            <div
              data-block-editor
              className="rounded-lg border border-border bg-background px-3 py-2"
            >
              <LexicalEditor
                key={`${scope.layer}:${key}`}
                markdown={block.content}
                onChange={saveContent}
                onStatusChange={setEditorStatus}
                placeholder={m.templates_editor_block_placeholder()}
                blocks={blocks}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-background px-5 py-4">
              <Markdown className="text-sm">
                {stripHints(block.content)}
              </Markdown>
            </div>
          )}
          {editable ? (
            <p className="text-xs text-muted-foreground">
              {m.templates_editor_block_help()}
            </p>
          ) : null}
        </>
      }
      aside={
        <>
          <AsideField label={m.templates_editor_icon_label()}>
            <IconAndColorField
              icon={block.icon}
              color={block.color}
              onIcon={(icon) => patch({ icon })}
              onColor={(color) => patch({ color })}
              disabled={!editable}
            />
          </AsideField>
          <AsideField label={m.templates_editor_description_label()}>
            {editable ? (
              <CommitInput
                value={block.description}
                onCommit={(description) => patch({ description })}
                ariaLabel={m.templates_editor_description_label()}
                placeholder={m.templates_editor_description_placeholder()}
                maxLength={200}
              />
            ) : (
              <MutedValue>{block.description}</MutedValue>
            )}
          </AsideField>
          <AsideField label={m.templates_editor_synced_label()}>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Switch
                  id={syncId}
                  checked={block.sync}
                  disabled={!editable}
                  onCheckedChange={(sync) => patch({ sync })}
                />
                <label htmlFor={syncId} className="text-[13px]">
                  {block.sync
                    ? m.templates_editor_synced_on()
                    : m.templates_editor_synced_off()}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {m.templates_editor_synced_help()}
              </p>
            </div>
          </AsideField>
          <AsideField label={m.templates_editor_origin_label()}>
            <MutedValue>
              {block.origin === scope.layer
                ? originLabel(block.origin)
                : m.templates_editor_scope_inherited({
                    layer: originLabel(scope.layer),
                    origin: originLabel(block.origin)
                  })}
            </MutedValue>
          </AsideField>
        </>
      }
    />
  )
}
