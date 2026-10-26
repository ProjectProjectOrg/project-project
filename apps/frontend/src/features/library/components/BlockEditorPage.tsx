import { useAtomValue } from "@effect/atom-react"
import {
  parseTicketBlocks,
  stripHints,
  type BlockDefinition,
  type Library,
  type TemplateDefinition,
  type UpdateBlockInput
} from "@pp/shared"
import { useCallback, useId, useMemo, useState } from "react"

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
import { m } from "@/paraglide/messages"

import { libraryView, type LibraryScope } from "../atoms/libraryScope"
import { saveBlockTask, useLibrarySave } from "../hooks/useLibrarySave"
import { BlockIconGlyph } from "./BlockIconGlyph"
import {
  CommitInput,
  IconAndColorField,
  MUTED_VALUE_CLASS,
  originLabel
} from "./DefinitionAside"
import {
  LibraryEditorHeader,
  LibraryEditorLayout,
  LibraryEditorSkeleton,
  LibraryEntryMissing
} from "./LibraryEditorChrome"
import { LibraryEntryLink } from "./LibraryEntryLink"
import { combinedStatus, useLayerPermissions } from "./TemplateEditorPage"

const BLOCK_MARKUP_LINE = /^ {0,3}<\/?block\b/m

export const containsBlockMarkup = (content: string): boolean =>
  BLOCK_MARKUP_LINE.test(content)

export const templatesUsingBlock = (
  library: Library,
  key: string
): ReadonlyArray<TemplateDefinition> =>
  library.templates.filter(
    (template) =>
      !template.hidden &&
      parseTicketBlocks(template.body).some(
        (segment) => segment.kind === "block" && segment.type === key
      )
  )

const ignoreEditDefinition: EditorBlocks["onEditDefinition"] = () => {}

export class NestedBlockError extends Error {}

export function BlockEditorPage({
  scope,
  blockKey
}: Readonly<{ scope: LibraryScope; blockKey: string }>) {
  const result = useAtomValue(libraryView(scope))
  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => (
        <div className="flex w-full flex-col gap-4">
          <LibraryEditorHeader scope={scope} kind="block" status="idle" />
          <LibraryEditorSkeleton />
        </div>
      )}
      onSuccess={({ value }) => {
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
      }}
    />
  )
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
  const usedIn = templatesUsingBlock(library, key)

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
            <div data-block-preview className="px-3 py-2">
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
          <MetaRow label={m.templates_editor_icon_label()}>
            <IconAndColorField
              icon={block.icon}
              color={block.color}
              onIcon={(icon) => patch({ icon })}
              onColor={(color) => patch({ color })}
              disabled={!editable}
            />
          </MetaRow>
          <MetaRow label={m.templates_editor_description_label()}>
            {editable ? (
              <CommitInput
                value={block.description}
                onCommit={(description) => patch({ description })}
                ariaLabel={m.templates_editor_description_label()}
                placeholder={m.templates_editor_description_placeholder()}
                maxLength={200}
              />
            ) : (
              <span className={MUTED_VALUE_CLASS}>{block.description}</span>
            )}
          </MetaRow>
          <MetaRow label={m.templates_editor_synced_label()}>
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
          </MetaRow>
          <MetaRow label={m.templates_editor_origin_label()}>
            <span className={MUTED_VALUE_CLASS}>
              {block.origin === scope.layer
                ? originLabel(block.origin)
                : m.templates_editor_scope_inherited({
                    layer: originLabel(scope.layer),
                    origin: originLabel(block.origin)
                  })}
            </span>
          </MetaRow>
          <MetaRow
            label={
              usedIn.length === 1
                ? m.templates_editor_used_in_one()
                : m.templates_editor_used_in({ count: usedIn.length })
            }
          >
            {usedIn.length === 0 ? (
              <span className={MUTED_VALUE_CLASS}>
                {m.templates_editor_used_in_none()}
              </span>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {usedIn.map((template) => (
                  <li key={template.key}>
                    <LibraryEntryLink
                      scope={scope}
                      kind="template"
                      entryKey={template.key}
                      className="-mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] transition-colors hover:bg-hover"
                    >
                      <BlockIconGlyph
                        icon={template.icon}
                        color={template.color}
                        className="size-3.5"
                      />
                      {template.name}
                    </LibraryEntryLink>
                  </li>
                ))}
              </ul>
            )}
          </MetaRow>
        </>
      }
    />
  )
}
