import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { $convertToMarkdownString } from "@lexical/markdown"
import {
  expandTemplate,
  type Member,
  type TemplateDefinition,
  type TicketDetail,
  type TicketType,
  canCallOrg
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import {
  HISTORY_MERGE_TAG,
  type LexicalEditor as LexicalEditorType
} from "lexical"
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref
} from "react"

import { lookupFor } from "@/components/blocks/blockChrome"
import { AttachmentAvailabilityProvider } from "@/components/Lexical/attachmentAvailability"
import { $selectFirstHint } from "@/components/Lexical/blocks/blockCommands"
import {
  entersEditing,
  keepsEditing
} from "@/components/Lexical/blocks/editingFocus"
import { OPEN_SLASH_MENU_COMMAND } from "@/components/Lexical/blocks/SlashMenuPlugin"
import {
  attachmentsForDescription,
  LexicalEditor,
  transformersForAttachments,
  type SaveStatus
} from "@/components/LexicalEditor"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import {
  ticketBodyDraft,
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { useEditorBlocks } from "@/hooks/useEditorBlocks"
import { cn } from "@/lib/utils"
import { MentionScopeProvider } from "@/mentions/scope"
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

const COLLAPSE_THRESHOLD_VH = 0.5
const DESCRIPTION_REGION_ID = "ticket-description-region"

export function DescriptionField({
  orgSlug,
  slug,
  ticket,
  members,
  autoFocus,
  onStatusChange,
  ref
}: Readonly<{
  orgSlug: string
  slug: string
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  autoFocus: boolean
  onStatusChange: (status: SaveStatus) => void
  ref?: Ref<DescriptionHandle>
}>) {
  const req = useMemo(
    () => ticketRequest(orgSlug, slug, ticket.id),
    [orgSlug, slug, ticket.id]
  )
  const update = useAtomSet(updateTicketDetail(req), { mode: "promiseExit" })
  const updateState = useAtomValue(updateTicketDetail(req))
  const bodyDraft = useAtomValue(ticketBodyDraft(req))
  const [definitionError, setDefinitionError] = useState<string | null>(null)
  const blocks = useEditorBlocks(orgSlug, slug, ticket.type, setDefinitionError)
  const setBodyDraft = useAtomSet(ticketBodyDraft(req))
  const storageResult = useAtomValue(orgStorage(storageRequest(orgSlug)))
  const orgResult = useAtomValue(orgDetail(orgRequest(orgSlug)))
  const storageActive =
    Result.isSuccess(storageResult) && storageResult.value.status === "active"
  const canConnectStorage =
    Result.isSuccess(orgResult) &&
    canCallOrg(orgResult.value.role)("storage", "connect")
  const attachments = attachmentsForDescription({
    orgSlug,
    slug,
    ticketId: ticket.id,
    storageActive
  })
  const transformers = transformersForAttachments(attachments)
  const editorRef = useRef<LexicalEditorType | null>(null)
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

  // A ticket opened straight from a creator lands on its first hinted line
  // (`**Expected:** ▏`), not on the first heading. Runs once, when the
  // library that knows the hints has loaded.
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

  useEffect(() => {
    if (
      !updateState.waiting &&
      bodyDraft !== null &&
      ticket.body === bodyDraft
    ) {
      setBodyDraft(null)
    }
  }, [bodyDraft, setBodyDraft, ticket.body, updateState.waiting])

  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [collapsedPx, setCollapsedPx] = useState(0)
  const [overflows, setOverflows] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [focused, setFocused] = useState(false)

  useLayoutEffect(() => {
    const inner = contentRef.current
    if (!inner) return

    let frame = 0
    let lastVh = 0
    let lastH = 0
    const measure = () => {
      frame = 0
      const vh = window.innerHeight
      const h = inner.getBoundingClientRect().height
      if (vh === lastVh && Math.abs(h - lastH) < 0.5) return
      lastVh = vh
      lastH = h
      setCollapsedPx(Math.round(vh * COLLAPSE_THRESHOLD_VH))
      setOverflows(h > vh * COLLAPSE_THRESHOLD_VH)
    }
    const schedule = () => {
      if (frame !== 0) return
      frame = requestAnimationFrame(measure)
    }

    measure()
    const ro = new ResizeObserver(schedule)
    ro.observe(inner)
    window.addEventListener("resize", schedule)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener("resize", schedule)
    }
  }, [])

  const collapsed = overflows && !expanded && !focused
  const offersStarts =
    library !== null &&
    (bodyDraft ?? ticket.body).trim() === "" &&
    templateStarts(library, ticket.type).templates.length > 0

  return (
    <div>
      <div
        ref={wrapperRef}
        id={DESCRIPTION_REGION_ID}
        data-block-rail-host
        data-editing={focused ? "" : undefined}
        className={cn(
          "relative rounded-lg border border-transparent px-3 py-2 transition-colors duration-150 data-editing:border-border data-editing:bg-background",
          collapsed && "overflow-y-clip"
        )}
        style={{
          maxHeight:
            collapsed && collapsedPx > 0 ? `${collapsedPx}px` : undefined
        }}
        onFocus={(e) => {
          if (entersEditing(e.currentTarget, e.target)) setFocused(true)
        }}
        onBlur={(e) => {
          if (!keepsEditing(e.currentTarget, e.relatedTarget)) setFocused(false)
        }}
      >
        <div
          ref={contentRef}
          className={cn("relative", offersStarts && "min-h-56")}
        >
          <MentionScopeProvider scope={{ orgSlug, slug, members }}>
            <AttachmentAvailabilityProvider missing={ticket.missingAttachments}>
              <LexicalEditor
                key={`${slug}/${ticket.id}`}
                markdown={bodyDraft ?? ticket.body}
                onDraftChange={setBodyDraft}
                onChange={async (next) => {
                  const exit = await update({ body: next })
                  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
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
              orgSlug={orgSlug}
              slug={slug}
              library={library}
              ticketType={ticket.type}
              body={bodyDraft ?? ticket.body}
              onStart={startFrom}
              onMore={openTemplateMenu}
              className="absolute inset-x-0 top-7 bottom-0"
            />
          )}
        </div>
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-muted transition-opacity duration-200",
            collapsed ? "opacity-100" : "opacity-0"
          )}
        />
      </div>
      {definitionError !== null && (
        <p
          role="alert"
          className="mt-2 flex items-center gap-2 px-3 text-xs text-destructive"
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
            to="/orgs/$orgSlug/settings/storage"
            params={{ orgSlug }}
            className="text-xs text-muted-foreground underline-offset-2 transition-colors duration-100 hover:text-foreground hover:underline"
          >
            {m.editor_attachment_connect_prompt()}
          </Link>
        </div>
      )}
      {overflows && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(collapsed)}
            aria-expanded={!collapsed}
            aria-controls={DESCRIPTION_REGION_ID}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-all duration-100 hover:bg-accent/40 hover:text-foreground active:scale-[0.97]"
          >
            {collapsed
              ? m.tickets_page_read_more()
              : m.tickets_page_show_less()}
          </button>
        </div>
      )}
    </div>
  )
}
