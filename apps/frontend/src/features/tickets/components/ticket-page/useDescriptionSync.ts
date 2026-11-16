import { useAtomSet } from "@effect/atom-react"
import { $convertToMarkdownString, type Transformer } from "@lexical/markdown"
import {
  type DescriptionVersion,
  type LocalDescription,
  type MergeConflict,
  mergeDescriptions
} from "@pp/local"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import type { LexicalEditor } from "lexical"
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject
} from "react"

import {
  resolveDescription,
  saveDescription
} from "@/features/local/atoms/localTicket"
import {
  ticketBodyDraft,
  type TicketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { incomingDescription } from "@/features/tickets/lib/descriptionSync"

import { hasUnsavedAttachments, mergeIntoEditor } from "./mergeIntoEditor"

type Held = Readonly<{
  theirs: string
  server: DescriptionVersion | null
  conflicts: ReadonlyArray<MergeConflict>
}>

export type DescriptionSync = Readonly<{
  revision: number
  conflicts: ReadonlyArray<MergeConflict> | null
  save: (next: string) => Promise<void>
  takeTheirs: () => void
  keepMine: () => void
}>

const workerConflicts = (
  local: LocalDescription | null
): ReadonlyArray<MergeConflict> | null => {
  const edit = local?.edit
  if (edit == null || edit.conflict === null) return null
  return Match.valueTags(
    mergeDescriptions(edit.base.body, edit.body, edit.conflict.body),
    { Merged: () => [], Conflict: ({ conflicts }) => conflicts }
  )
}

export function useDescriptionSync({
  req,
  body,
  local,
  editorRef,
  transformers,
  idle: editorIdle
}: Readonly<{
  req: TicketRequest
  body: string
  local: LocalDescription | null
  editorRef: RefObject<LexicalEditor | null>
  transformers: ReadonlyArray<Transformer>
  idle: boolean
}>): DescriptionSync {
  const update = useAtomSet(updateTicketDetail(req), { mode: "promiseExit" })
  const saveLocally = useAtomSet(saveDescription, { mode: "promiseExit" })
  const resolve = useAtomSet(resolveDescription)
  const setDraft = useAtomSet(ticketBodyDraft(req))
  const [revision, setRevision] = useState(0)
  const [held, setHeld] = useState<Held | null>(null)
  const loadedRef = useRef(body)
  const baseRef = useRef<DescriptionVersion | null>(local?.server ?? null)
  const project = { orgSlug: req.params.orgSlug, slug: req.params.slug }

  const markdownOf = (editor: LexicalEditor): string =>
    editor
      .getEditorState()
      .read(() => $convertToMarkdownString([...transformers]))

  const loaded = (next: string) => {
    loadedRef.current = next
    baseRef.current = local?.server ?? null
    setHeld(null)
  }

  const reloadWith = (next: string) => {
    loaded(next)
    setDraft(null)
    setRevision((current) => current + 1)
  }

  const onIncoming = useEffectEvent(
    (incoming: string, settled: boolean, idle: boolean) => {
      if (local !== null && settled && local.server.body === loadedRef.current)
        baseRef.current = local.server
      if (idle && held !== null) {
        reloadWith(incoming)
        return
      }
      const editor = editorRef.current
      const action = incomingDescription({
        incoming,
        loaded: loadedRef.current,
        current: editor === null ? null : markdownOf(editor),
        idle,
        uploading: editor !== null && hasUnsavedAttachments(editor)
      })
      if (action.kind === "adopt") loaded(incoming)
      else if (action.kind === "reload") reloadWith(incoming)
      else if (action.kind === "replace" && editor !== null) {
        mergeIntoEditor(editor, action.body, transformers)
        loaded(incoming)
      } else if (action.kind === "conflict")
        setHeld({
          theirs: incoming,
          server: local?.server ?? null,
          conflicts: action.conflicts
        })
    }
  )
  const settled = local !== null && local.edit === null
  useEffect(
    () => onIncoming(body, settled, editorIdle),
    [body, settled, editorIdle]
  )

  const save = async (next: string) => {
    const exit =
      local === null
        ? Exit.asVoid(await update({ body: next }))
        : await saveLocally({
            project,
            id: req.params.id,
            body: next,
            base: baseRef.current ?? local.server
          })
    const failure = Exit.getCause<void, unknown>(exit)
    if (Option.isSome(failure)) throw Cause.squash(failure.value)
    loadedRef.current = next
    setDraft((draft) => (draft === next ? null : draft))
  }

  return {
    revision,
    conflicts: held?.conflicts ?? workerConflicts(local),
    save,
    takeTheirs: () => {
      if (held !== null) {
        reloadWith(body)
        return
      }
      resolve({ project, id: req.params.id, keep: "theirs" })
    },
    keepMine: () => {
      if (held === null) {
        resolve({ project, id: req.params.id, keep: "mine" })
        return
      }
      const editor = editorRef.current
      loadedRef.current = held.theirs
      baseRef.current = held.server
      setHeld(null)
      if (editor !== null) void save(markdownOf(editor))
    }
  }
}
