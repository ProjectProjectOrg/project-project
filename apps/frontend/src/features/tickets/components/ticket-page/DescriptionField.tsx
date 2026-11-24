import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  expandType,
  typeFor,
  type Member,
  type TicketDetail,
  type TypeKey
} from "@pp/shared"
import { AttachmentAvailabilityProvider } from "@pp/ui/editor/attachments/availability"
import { LibraryContext, lookupFor } from "@pp/ui/editor/blocks/block-chrome"
import { Markdown } from "@pp/ui/editor/markdown"
import { MentionScopeProvider } from "@pp/ui/editor/mentions/scope"
import { type SaveStatus } from "@pp/ui/editor/save-queue"
import { cn } from "@pp/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref
} from "react"

import { useEditorBlocks } from "@/features/editor/hooks/useEditorBlocks"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketBodyDraft,
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { useTicketParticipants } from "@/features/tickets/hooks/useTicketParticipants"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import { startingTypes } from "@/features/tickets/lib/creatorType"
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

import { DescriptionActions } from "./DescriptionActions"
import { DescriptionTypeStarts } from "./DescriptionTypeStarts"
import { useDescriptionEditor } from "./useDescriptionEditor"

const SLASH_COMMAND_ONLY = /^(\/\S*)?$/
const INTERACTIVE = "a, button, input, label"

export type TemplateSwapNote = Readonly<{
  name: string
  previous: string
  swapped: string
}>

export type DescriptionHandle = Readonly<{
  swapTemplate: (
    from: TypeKey | null,
    to: TypeKey | null
  ) => Promise<TemplateSwapNote | null>
  restore: (markdown: string) => void
  matches: (markdown: string) => boolean
  onEdit: (markdown: string, callback: () => void) => () => void
  focus: () => void
}>

const sameBody = (a: string, b: string) => a.trim() === b.trim()

export function DescriptionField({
  ticket,
  members,
  autoFocus,
  onStartType,
  ref
}: Readonly<{
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  autoFocus: boolean
  onStartType: (type: TypeKey) => void
  ref?: Ref<DescriptionHandle>
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketRequest(orgSlug, slug, ticket.id)
  const update = useAtomSet(updateTicketDetail(req), { mode: "promiseExit" })
  const bodyDraft = useAtomValue(ticketBodyDraft(req))
  const [definitionError, setDefinitionError] = useState<string | null>(null)
  const blocks = useEditorBlocks(orgSlug, slug, ticket.type, setDefinitionError)
  const setBodyDraft = useAtomSet(ticketBodyDraft(req))
  const storageResult = useAtomValue(orgStorage(storageRequest(orgSlug)))
  const storageActive =
    Result.isSuccess(storageResult) && storageResult.value.status === "active"
  const canConnectStorage = useOrgActor(orgSlug).call("storage", "connect")
  const target = { orgSlug, slug, ticketId: ticket.id }
  const involved = useTicketParticipants(ticket.id)
  const library = blocks?.library ?? null
  const lookup = useMemo(() => lookupFor(library), [library])

  const types = useTicketTypes(orgSlug, slug)
  const body = bodyDraft ?? ticket.body

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const rootRef = useRef<HTMLDivElement>(null)
  const {
    editor,
    editorRef,
    loadState,
    ensureEditor,
    editing,
    startEditing,
    stopEditing,
    edit
  } = useDescriptionEditor(rootRef, autoFocus)

  const startAs = async (key: TypeKey) => {
    const loaded = await ensureEditor()
    const instance = editorRef.current
    if (loaded === null || instance === null || rootRef.current === null) return
    const definition = library === null ? null : typeFor(library, key)
    startEditing()
    if (key !== ticket.type) onStartType(key)
    else if (definition !== null)
      loaded.templates.startFromTemplate(
        instance,
        expandType(definition, lookup),
        { lookup }
      )
  }

  useImperativeHandle(ref, () => ({
    swapTemplate: async (from, to) => {
      if (library === null || to === null || typeFor(library, to) === null)
        return null
      const loaded = await ensureEditor()
      const instance = editorRef.current
      if (loaded === null || instance === null || rootRef.current === null)
        return null
      const { readDescription, replaceWithTemplate, templateSwap } =
        loaded.templates
      const previous = readDescription(instance)
      const template = templateSwap({ library, body: previous, from, to })
      if (template === null) return null
      replaceWithTemplate(instance, expandType(template, lookup), { lookup })
      return {
        name: template.name,
        previous,
        swapped: readDescription(instance)
      }
    },
    restore: (markdown) => {
      const instance = editorRef.current
      if (instance !== null) editor?.templates.restoreBody(instance, markdown)
    },
    matches: (markdown) => {
      const instance = editorRef.current
      return (
        instance !== null &&
        editor !== null &&
        sameBody(editor.templates.readDescription(instance), markdown)
      )
    },
    focus: edit,
    onEdit: (markdown, callback) => {
      const instance = editorRef.current
      if (instance === null || editor === null) return () => {}
      return instance.registerUpdateListener(
        ({ dirtyElements, dirtyLeaves }) => {
          if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
          if (!sameBody(editor.templates.readDescription(instance), markdown))
            callback()
        }
      )
    }
  }))

  const landedRef = useRef(false)
  useEffect(() => {
    const instance = editorRef.current
    if (
      !autoFocus ||
      library === null ||
      editor === null ||
      instance === null ||
      landedRef.current
    )
      return
    landedRef.current = true
    editor.templates.selectFirstDescriptionHint(instance, lookup)
  }, [autoFocus, editor, editorRef, library, lookup])

  const saveBody = async (next: string) => {
    const exit = await update({ body: next })
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
    setBodyDraft((draft) => (draft === next ? null : draft))
  }

  const taskSave = useRef(0)
  const saveTask = (next: string) => {
    const save = ++taskSave.current
    setBodyDraft(next)
    setSaveStatus("saving")
    const finish = (status: SaveStatus) => {
      if (save === taskSave.current) setSaveStatus(status)
    }
    void saveBody(next).then(
      () => finish("saved"),
      () => finish("failed")
    )
  }

  const empty = SLASH_COMMAND_ONLY.test(body.trim())
  const canStart =
    library !== null && startingTypes(types, ticket.type).length > 0
  const offersStarts = canStart && empty
  const Editor = editor?.Editor

  return (
    <div
      ref={rootRef}
      role="presentation"
      tabIndex={-1}
      aria-busy={loadState === "loading" || undefined}
      className={cn(
        // States like a bare field: an empty description's placeholder steps
        // up on hover, and further while editing.
        "relative py-2 outline-none [&_[data-slot=editor-placeholder]]:transition-colors [&_[data-slot=editor-placeholder]]:duration-150",
        editing &&
          "[&_[data-slot=editor-placeholder]]:text-(--placeholder-focus)",
        !editing &&
          empty &&
          "hover:[&_[data-slot=editor-placeholder]]:text-(--placeholder-hover) hover:[&_[data-slot=editor-placeholder]]:duration-0"
      )}
    >
      <div
        data-block-rail-host
        data-block-rail-inset
        role="presentation"
        className={cn(
          "relative px-3 [&_.lexical-content]:min-h-0",
          (editing || empty) && "cursor-text"
        )}
        onClick={(event) => {
          if (editing || !empty) return
          if (
            event.target instanceof Element &&
            event.target.closest(INTERACTIVE)
          )
            return
          edit()
        }}
      >
        <div className={cn("relative flow-root", canStart && "min-h-15")}>
          <DescriptionActions
            editing={editing}
            loading={loadState === "loading"}
            status={saveStatus}
            onEdit={edit}
            onDone={stopEditing}
          />
          <MentionScopeProvider scope={{ orgSlug, slug, members, involved }}>
            <AttachmentAvailabilityProvider missing={ticket.missingAttachments}>
              {Editor !== undefined ? (
                <Editor
                  key={`${slug}/${ticket.id}`}
                  markdown={body}
                  onDraftChange={setBodyDraft}
                  onChange={saveBody}
                  onStatusChange={setSaveStatus}
                  autoFocus={autoFocus ? "start" : false}
                  placeholder={m.tickets_description_placeholder()}
                  attachments={{ ...target, uploadsEnabled: storageActive }}
                  blocks={blocks}
                  editorRef={editorRef}
                  editable={editing}
                />
              ) : empty ? (
                <p
                  data-slot="editor-placeholder"
                  className="text-body text-muted-foreground"
                >
                  {m.tickets_description_placeholder()}
                </p>
              ) : (
                <LibraryContext value={library}>
                  <Markdown
                    figmaTarget={target}
                    hideHints
                    onToggleTask={saveTask}
                  >
                    {body}
                  </Markdown>
                </LibraryContext>
              )}
            </AttachmentAvailabilityProvider>
          </MentionScopeProvider>
          {offersStarts && (
            <DescriptionTypeStarts
              types={types}
              ticketType={ticket.type}
              onStart={(key) => void startAs(key)}
              className="mt-2"
            />
          )}
        </div>
      </div>
      {loadState === "failed" && (
        <p role="alert" className="mt-2 px-3 text-caption text-destructive">
          {m.tickets_description_editor_load_failed()}
        </p>
      )}
      {Editor === undefined && saveStatus === "failed" && (
        <p role="alert" className="mt-2 px-3 text-caption text-destructive">
          {m.editor_save_failed()}
        </p>
      )}
      {definitionError !== null && (
        <p
          role="alert"
          className="mt-2 flex items-center gap-2 px-3 text-caption text-destructive"
        >
          {m.editor_block_make_definition_failed({ reason: definitionError })}
          <button
            type="button"
            onClick={() => setDefinitionError(null)}
            className="rounded px-1 text-muted-foreground transition-all duration-100 hover:text-foreground active:scale-97"
          >
            {m.editor_block_make_definition_dismiss()}
          </button>
        </p>
      )}
      {!storageActive && canConnectStorage && (
        <div className="mt-2 px-3">
          <Link
            to="/settings/orgs/$orgSlug/integrations/storage"
            params={{ orgSlug }}
            className="text-caption text-muted-foreground underline-offset-2 transition-colors duration-100 hover:text-foreground hover:underline"
          >
            {m.editor_attachment_connect_prompt()}
          </Link>
        </div>
      )}
    </div>
  )
}
