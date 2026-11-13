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
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import {
  $createRangeSelection,
  $getRoot,
  $setSelection,
  HISTORY_MERGE_TAG,
  type LexicalEditor as LexicalEditorType
} from "lexical"
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref
} from "react"
import { flushSync } from "react-dom"

import {
  attachmentsForDescription,
  LexicalEditor,
  transformersForAttachments,
  type SaveStatus
} from "@/features/editor/components/LexicalEditor"
import { useEditorBlocks } from "@/features/editor/hooks/useEditorBlocks"
import { AttachmentAvailabilityProvider } from "@/features/editor/lexical/attachmentAvailability"
import { $selectFirstHint } from "@/features/editor/lexical/blocks/blockCommands"
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
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import { startingTypes } from "@/features/tickets/lib/creatorType"
import { useOrgActor } from "@/hooks/useActor"
import { hasModifier, ownsKeystrokes } from "@/lib/keyboard"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { DescriptionActions } from "./DescriptionActions"
import {
  replaceWithTemplate,
  restoreBody,
  startFromTemplate,
  templateSwap
} from "./descriptionTemplates"
import { DescriptionTypeStarts } from "./DescriptionTypeStarts"

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

  const types = useTicketTypes(orgSlug, slug)
  const body = bodyDraft ?? ticket.body

  const [editing, setEditing] = useState(autoFocus)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const rootRef = useRef<HTMLDivElement>(null)
  const wasEditingRef = useRef(editing)

  useEffect(() => {
    const wasEditing = wasEditingRef.current
    wasEditingRef.current = editing
    if (editing || !wasEditing) return
    const active = document.activeElement
    const lost =
      active === null ||
      active === document.body ||
      (rootRef.current?.contains(active) ?? false)
    if (lost) rootRef.current?.focus({ preventScroll: true })
  }, [editing])

  const startEditing = () => {
    const editor = editorRef.current
    if (editor === null) return
    const root = editor.getRootElement()
    const range = selectedRangeIn(root)
    flushSync(() => {
      editor.setEditable(true)
      setEditing(true)
    })
    editor.update(
      () => {
        if (range === null) {
          $getRoot().selectEnd()
          return
        }
        const selection = $createRangeSelection()
        selection.applyDOMRange(range)
        $setSelection(selection)
      },
      { discrete: true }
    )
    editor.focus()
  }

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

  const startFromShortcut = useEffectEvent(() => startEditing())

  useEffect(() => {
    if (editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "e" && event.key !== "E") return
      if (event.repeat || event.defaultPrevented || hasModifier(event)) return
      if (ownsKeystrokes(event.target)) return
      event.preventDefault()
      startFromShortcut()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [editing])

  const stopEditing = () => {
    editorRef.current?.blur()
    setEditing(false)
  }
  const stopFromEvent = useEffectEvent(stopEditing)

  useEffect(() => {
    if (!editing) return
    const app = document.getElementById("root")
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || !(app?.contains(target) ?? false)) return
      if (rootRef.current?.contains(target) ?? false) return
      stopFromEvent()
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [editing])

  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      if (!(event.target instanceof Node)) return
      if (!(rootRef.current?.contains(event.target) ?? false)) return
      stopFromEvent()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [editing])

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
          <DescriptionActions
            editing={editing}
            status={saveStatus}
            onEdit={() => startEditing()}
            onDone={stopEditing}
          />
          <MentionScopeProvider scope={{ orgSlug, slug, members, involved }}>
            <AttachmentAvailabilityProvider missing={ticket.missingAttachments}>
              <LexicalEditor
                key={`${slug}/${ticket.id}`}
                markdown={body}
                onDraftChange={setBodyDraft}
                onChange={async (next) => {
                  const exit = await update({ body: next })
                  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
                  setBodyDraft((draft) => (draft === next ? null : draft))
                }}
                onStatusChange={setSaveStatus}
                autoFocus={autoFocus ? "start" : false}
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

const selectedRangeIn = (root: HTMLElement | null): Range | null => {
  const selection = window.getSelection()
  if (root === null || selection === null || selection.isCollapsed) return null
  const range = selection.getRangeAt(0).cloneRange()
  if (!range.intersectsNode(root)) return null
  const bounds = document.createRange()
  bounds.selectNodeContents(root)
  if (range.compareBoundaryPoints(Range.START_TO_START, bounds) < 0)
    range.setStart(bounds.startContainer, bounds.startOffset)
  if (range.compareBoundaryPoints(Range.END_TO_END, bounds) > 0)
    range.setEnd(bounds.endContainer, bounds.endOffset)
  return range.collapsed ? null : range
}
