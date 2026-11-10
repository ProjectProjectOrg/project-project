import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { $convertToMarkdownString } from "@lexical/markdown"
import {
  expandTemplate,
  type Member,
  type TemplateDefinition,
  type TicketDetail,
  type TicketType
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
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
import { useEditorBlocks } from "@/features/editor/hooks/useEditorBlocks"
import { AttachmentAvailabilityProvider } from "@/features/editor/lexical/attachmentAvailability"
import { $selectFirstHint } from "@/features/editor/lexical/blocks/blockCommands"
import { OPEN_SLASH_MENU_COMMAND } from "@/features/editor/lexical/blocks/SlashMenuPlugin"
import { lookupFor } from "@/features/editor/lib/blockChrome"
import { MentionScopeProvider } from "@/features/editor/mentions/scope"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketBodyDraft,
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { useTicketParticipants } from "@/features/tickets/hooks/useTicketParticipants"
import { useOrgActor } from "@/hooks/useActor"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  replaceWithTemplate,
  restoreBody,
  startFromTemplate,
  templateStarts,
  templateSwap
} from "./descriptionTemplates"
import { DescriptionTemplateStarts } from "./DescriptionTemplateStarts"

export type TemplateSwapNote = Readonly<{
  name: string
  previous: string
  swapped: string
}>

export type DescriptionHandle = Readonly<{
  swapTemplate: (from: TicketType, to: TicketType) => TemplateSwapNote | null
  restore: (markdown: string) => void
  matches: (markdown: string) => boolean
  onEdit: (markdown: string, callback: () => void) => () => void
}>

const sameBody = (a: string, b: string): boolean => a.trim() === b.trim()

export function DescriptionField({
  ticket,
  members,
  autoFocus,
  onStatusChange,
  ref
}: Readonly<{
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  autoFocus: boolean
  onStatusChange: (status: SaveStatus) => void
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

  const startFrom = (template: TemplateDefinition) => {
    const editor = editorRef.current
    if (editor === null) return
    startFromTemplate(editor, expandTemplate(template, lookup), {
      transformers,
      lookup
    })
  }

  const openTemplateMenu = () =>
    editorRef.current?.dispatchCommand(OPEN_SLASH_MENU_COMMAND, "templates")

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
        replaceWithTemplate(editor, expandTemplate(template, lookup), {
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
  }, [library, lookup, transformers])

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

  const offersStarts =
    library !== null &&
    (bodyDraft ?? ticket.body).trim() === "" &&
    templateStarts(library, ticket.type).templates.length > 0

  return (
    <div>
      <div data-block-rail-host className="relative px-3 py-2">
        <div className={cn("relative", offersStarts && "min-h-56")}>
          <MentionScopeProvider scope={{ orgSlug, slug, members, involved }}>
            <AttachmentAvailabilityProvider missing={ticket.missingAttachments}>
              <LexicalEditor
                key={`${slug}/${ticket.id}`}
                markdown={bodyDraft ?? ticket.body}
                onDraftChange={setBodyDraft}
                onChange={async (next) => {
                  const exit = await update({ body: next })
                  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
                  setBodyDraft((draft) => (draft === next ? null : draft))
                }}
                onStatusChange={onStatusChange}
                autoFocus={autoFocus ? "start" : false}
                placeholder={m.tickets_description_placeholder()}
                attachments={attachments}
                blocks={blocks}
                editorRef={editorRef}
              />
            </AttachmentAvailabilityProvider>
          </MentionScopeProvider>
          {library !== null && (
            <DescriptionTemplateStarts
              library={library}
              ticketType={ticket.type}
              body={bodyDraft ?? ticket.body}
              onStart={startFrom}
              onMore={openTemplateMenu}
              className="absolute inset-x-0 top-7 bottom-0"
            />
          )}
        </div>
      </div>
      {definitionError !== null && (
        <p
          role="alert"
          className="mt-2 flex items-center gap-2 px-3 text-caption text-destructive"
        >
          {m.editor_block_make_definition_failed({ reason: definitionError })}
          <button
            type="button"
            onClick={() => setDefinitionError(null)}
            className="rounded px-1 text-muted-foreground transition-all duration-100 hover:text-foreground active:scale-[0.97]"
          >
            {m.editor_block_make_definition_dismiss()}
          </button>
        </p>
      )}
      {!storageActive && canConnectStorage && (
        <div className="mt-2 px-3">
          <Link
            to="/orgs/$orgSlug/settings/integrations/storage"
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
