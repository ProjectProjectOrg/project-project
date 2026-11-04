import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { $convertToMarkdownString, type Transformer } from "@lexical/markdown"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import type { LexicalEditor } from "lexical"
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject
} from "react"

import {
  ticketBodyDraft,
  ticketDetail,
  type TicketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import {
  type MergeConflict,
  mergeDescriptions
} from "@/features/tickets/lib/descriptionMerge"
import {
  isDescriptionConflict,
  remoteBodyAction
} from "@/features/tickets/lib/descriptionSync"

import { hasUnsavedAttachments, mergeIntoEditor } from "./mergeIntoEditor"

export type DescriptionSync = Readonly<{
  revision: number
  stale: string | null
  conflicts: ReadonlyArray<MergeConflict>
  onDraftChange: (next: string) => void
  save: (next: string, editorRevision: number) => Promise<void>
  takeTheirs: () => void
  keepMine: () => void
}>

export function useDescriptionSync({
  req,
  body,
  editorRef,
  transformers,
  focused
}: Readonly<{
  req: TicketRequest
  body: string
  editorRef: RefObject<LexicalEditor | null>
  transformers: ReadonlyArray<Transformer>
  focused: boolean
}>): DescriptionSync {
  const update = useAtomSet(updateTicketDetail(req), { mode: "promiseExit" })
  const refreshTicket = useAtomRefresh(ticketDetail(req))
  const draft = useAtomValue(ticketBodyDraft(req))
  const setDraft = useAtomSet(ticketBodyDraft(req))
  const [revision, setRevision] = useState(0)
  const revisionRef = useRef(0)
  const baseRef = useRef(draft?.base ?? body)
  const sentRef = useRef<string | null>(null)
  const [stale, setStale] = useState<string | null>(() =>
    draft !== null && draft.base !== body ? body : null
  )
  const [conflicts, setConflicts] = useState<ReadonlyArray<MergeConflict>>([])
  const idle = !focused && draft === null

  const currentMarkdown = (editor: LexicalEditor): string =>
    editor
      .getEditorState()
      .read(() => $convertToMarkdownString([...transformers]))

  const reloadWith = (next: string) => {
    baseRef.current = next
    revisionRef.current += 1
    setRevision(revisionRef.current)
    setStale(null)
    setConflicts([])
    setDraft(null)
  }

  const send = async (next: string) => {
    sentRef.current = next
    const exit = await update({ body: next, expectedBody: baseRef.current })
    sentRef.current = null
    if (Exit.isSuccess(exit)) {
      const confirmed = exit.value.ticket.body
      baseRef.current = confirmed
      setDraft((current) =>
        current === null || current.body === next
          ? null
          : { body: current.body, base: confirmed }
      )
    } else if (isDescriptionConflict(exit)) {
      refreshTicket()
    }
    return exit
  }

  const onRemoteBody = useEffectEvent((incoming: string) => {
    const editor = editorRef.current
    const current = editor === null ? null : currentMarkdown(editor)
    const action = remoteBodyAction({
      incoming,
      base: baseRef.current,
      sent: sentRef.current,
      current,
      idle
    })
    if (action === "adopt") baseRef.current = incoming
    else if (action === "reload") reloadWith(incoming)
    else if (action === "notify") {
      const merge =
        editor === null || current === null || hasUnsavedAttachments(editor)
          ? null
          : mergeDescriptions(baseRef.current, current, incoming)
      if (editor !== null && current !== null && merge?._tag === "Merged") {
        baseRef.current = incoming
        setStale(null)
        setConflicts([])
        if (merge.body !== current)
          mergeIntoEditor(editor, merge.body, transformers)
        const merged = currentMarkdown(editor)
        setDraft({ body: merged, base: incoming })
        // An unchanged editor fires no autosave, so save the merge here.
        if (merged === current) void send(merged)
      } else {
        setStale(incoming)
        setConflicts(merge?._tag === "Conflict" ? merge.conflicts : [])
      }
    }
  })
  useEffect(() => onRemoteBody(body), [body])

  const reloadSettled = useEffectEvent(reloadWith)
  useEffect(() => {
    if (stale !== null && idle) reloadSettled(stale)
  }, [stale, idle])

  return {
    revision,
    stale,
    conflicts,
    onDraftChange: (next) =>
      setDraft((current) => ({
        body: next,
        base: current?.base ?? baseRef.current
      })),
    save: async (next, editorRevision) => {
      if (editorRevision !== revisionRef.current) return
      const exit = await send(next)
      if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
    },
    takeTheirs: () => {
      if (stale !== null) reloadWith(stale)
    },
    keepMine: () => {
      const editor = editorRef.current
      if (stale === null || editor === null) return
      baseRef.current = stale
      setStale(null)
      setConflicts([])
      void send(currentMarkdown(editor))
    }
  }
}
