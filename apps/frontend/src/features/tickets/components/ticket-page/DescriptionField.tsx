import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { $convertToMarkdownString } from "@lexical/markdown"
import {
  expandType,
  typeFor,
  type Member,
  type TicketDetail,
  type TypeKey
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import {
  HISTORY_MERGE_TAG,
  type LexicalEditor as LexicalEditorType
} from "lexical"
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref
} from "react"

import {
  attachmentsForDescription,
  LexicalEditor,
  transformersForAttachments,
  type SaveStatus
} from "@/features/editor/components/LexicalEditor"
import { useEditMode } from "@/features/editor/hooks/useEditMode"
import { useEditorBlocks } from "@/features/editor/hooks/useEditorBlocks"
import { AttachmentAvailabilityProvider } from "@/features/editor/lexical/attachmentAvailability"
import { $selectFirstHint } from "@/features/editor/lexical/blocks/blockCommands"
import { lookupFor } from "@/features/editor/lib/blockChrome"
import { MentionScopeProvider } from "@/features/editor/mentions/scope"
import { localDescription } from "@/features/local/atoms/localTicket"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketBodyDraft,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { useTicketParticipants } from "@/features/tickets/hooks/useTicketParticipants"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import { startingTypes } from "@/features/tickets/lib/creatorType"
import { useOrgActor } from "@/hooks/useActor"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { DescriptionActions } from "./DescriptionActions"
import { DescriptionConflict } from "./DescriptionConflict"
import {
  replaceWithTemplate,
  restoreBody,
  startFromTemplate,
  templateSwap
} from "./descriptionTemplates"
import { DescriptionTypeStarts } from "./DescriptionTypeStarts"
import { useDescriptionSync } from "./useDescriptionSync"

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
  ) => TemplateSwapNote | null
  restore: (markdown: string) => void
  matches: (markdown: string) => boolean
  onEdit: (markdown: string, callback: () => void) => () => void
  focus: () => void
}>

const sameBody = (a: string, b: string): boolean => a.trim() === b.trim()

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
  const bodyDraft = useAtomValue(ticketBodyDraft(req))
  const description = useAtomValue(localDescription(req))
  const local = Result.isSuccess(description) ? description.value : null
  const [definitionError, setDefinitionError] = useState<string | null>(null)
  const blocks = useEditorBlocks(orgSlug, slug, ticket.type, setDefinitionError)
  const setBodyDraft = useAtomSet(ticketBodyDraft(req))
  const storageResult = useAtomValue(orgStorage(storageRequest(orgSlug)))
  const storageActive =
    Result.isSuccess(storageResult) && storageResult.value.status === "active"
  const canConnectStorage = useOrgActor(orgSlug).call("storage", "connect")
  const attachments = attachmentsForDescription({
    orgSlug,
    slug,
    ticketId: ticket.id,
    storageActive
  })
  const transformers = transformersForAttachments(attachments)
  const editorRef = useRef<LexicalEditorType | null>(null)
  const involved = useTicketParticipants(ticket.id)
  const library = blocks?.library ?? null
  const lookup = useMemo(() => lookupFor(library), [library])

  const types = useTicketTypes(orgSlug, slug)
  const body = bodyDraft ?? ticket.body

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const rootRef = useRef<HTMLDivElement>(null)
  const { editing, startEditing, stopEditing } = useEditMode({
    editorRef,
    rootRef,
    initial: autoFocus
  })
  const sync = useDescriptionSync({
    req,
    body: ticket.body,
    local,
    editorRef,
    transformers,
    idle: !editing && bodyDraft === null
  })

  const startAs = (key: TypeKey) => {
    const editor = editorRef.current
    const definition = library === null ? null : typeFor(library, key)
    startEditing()
    if (key !== ticket.type) onStartType(key)
    else if (editor !== null && definition !== null)
      startFromTemplate(editor, expandType(definition, lookup), {
        transformers,
        lookup
      })
  }

  useImperativeHandle(ref, () => {
    const markdownOf = (editor: LexicalEditorType): string =>
      editor.getEditorState().read(() => $convertToMarkdownString(transformers))
    return {
      swapTemplate: (from, to) => {
        const editor = editorRef.current
        if (editor === null || library === null) return null
        const body = markdownOf(editor)
        const template = templateSwap({ library, body, from, to })
        if (template === null) return null
        replaceWithTemplate(editor, expandType(template, lookup), {
          transformers,
          lookup
        })
        return {
          name: template.name,
          previous: body,
          swapped: markdownOf(editor)
        }
      },
      restore: (markdown) => {
        const editor = editorRef.current
        if (editor !== null) restoreBody(editor, markdown, transformers)
      },
      matches: (markdown) => {
        const editor = editorRef.current
        return editor !== null && sameBody(markdownOf(editor), markdown)
      },
      focus: () => startEditing(),
      onEdit: (markdown, callback) => {
        const editor = editorRef.current
        if (editor === null) return () => {}
        return editor.registerUpdateListener(
          ({ dirtyElements, dirtyLeaves }) => {
            if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return
            if (!sameBody(markdownOf(editor), markdown)) callback()
          }
        )
      }
    }
  }, [library, lookup, transformers, startEditing])

  const landedRef = useRef(false)
  useEffect(() => {
    const editor = editorRef.current
    if (!autoFocus || library === null || editor === null || landedRef.current)
      return
    landedRef.current = true
    editor.update(() => void $selectFirstHint(lookup), {
      tag: HISTORY_MERGE_TAG
    })
  }, [autoFocus, library, lookup])

  const empty = SLASH_COMMAND_ONLY.test(body.trim())
  const canStart =
    library !== null && startingTypes(types, ticket.type).length > 0
  const offersStarts = canStart && empty

  return (
    <div
      ref={rootRef}
      role="presentation"
      tabIndex={-1}
      className={cn(
        "relative rounded-xl py-2 transition-[background-color,box-shadow] duration-150 ease-out outline-none motion-reduce:transition-none",
        editing &&
          "bg-surface-2 shadow-surface-1 [--muted-foreground:color-mix(in_oklch,var(--color-muted-foreground)_88%,var(--color-foreground))]"
      )}
    >
      <div
        data-block-rail-host
        data-block-rail-inset
        data-description
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
          startEditing()
        }}
      >
        <div className={cn("relative flow-root", canStart && "min-h-15")}>
          {sync.conflicts !== null && (
            <DescriptionConflict {...sync} conflicts={sync.conflicts} />
          )}
          <DescriptionActions
            editing={editing}
            status={local?.edit?.failed == null ? saveStatus : "failed"}
            onEdit={() => startEditing()}
            onDone={stopEditing}
          />
          <MentionScopeProvider scope={{ orgSlug, slug, members, involved }}>
            <AttachmentAvailabilityProvider missing={ticket.missingAttachments}>
              <LexicalEditor
                key={`${slug}/${ticket.id}/${sync.revision}`}
                markdown={body}
                onDraftChange={setBodyDraft}
                onChange={sync.save}
                onStatusChange={setSaveStatus}
                autoFocus={autoFocus && sync.revision === 0 ? "start" : false}
                placeholder={m.tickets_description_placeholder()}
                attachments={attachments}
                blocks={blocks}
                editorRef={editorRef}
                editable={editing}
              />
            </AttachmentAvailabilityProvider>
          </MentionScopeProvider>
          {offersStarts && (
            <DescriptionTypeStarts
              types={types}
              ticketType={ticket.type}
              onStart={startAs}
              className="mt-2"
            />
          )}
        </div>
      </div>
      {definitionError !== null && (
        <DefinitionError
          reason={definitionError}
          onDismiss={() => setDefinitionError(null)}
        />
      )}
      {!storageActive && canConnectStorage && (
        <StoragePrompt orgSlug={orgSlug} />
      )}
    </div>
  )
}

function DefinitionError({
  reason,
  onDismiss
}: Readonly<{ reason: string; onDismiss: () => void }>) {
  return (
    <p
      role="alert"
      className="mt-2 flex items-center gap-2 px-3 text-caption text-destructive"
    >
      {m.editor_block_make_definition_failed({ reason })}
      <button
        type="button"
        onClick={onDismiss}
        className="rounded px-1 text-muted-foreground transition-all duration-100 hover:text-foreground"
      >
        {m.editor_block_make_definition_dismiss()}
      </button>
    </p>
  )
}

function StoragePrompt({ orgSlug }: Readonly<{ orgSlug: string }>) {
  return (
    <div className="mt-2 px-3">
      <Link
        to="/orgs/$orgSlug/settings/integrations/storage"
        params={{ orgSlug }}
        className="text-caption text-muted-foreground underline-offset-2 transition-colors duration-100 hover:text-foreground hover:underline"
      >
        {m.editor_attachment_connect_prompt()}
      </Link>
    </div>
  )
}
