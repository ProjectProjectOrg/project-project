import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketDetail } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useCallback, useId, useMemo, useRef, useState } from "react"

import {
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

export function TitleField({
  orgSlug,
  slug,
  ticket
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
}) {
  const req = useMemo(
    () => ticketRequest(orgSlug, slug, ticket.id),
    [orgSlug, slug, ticket.id]
  )
  const atom = updateTicketDetail(req)
  const update = useAtomSet(atom, { mode: "promiseExit" })
  const result = useAtomValue(atom)
  const pending = result.waiting
  const error = Result.matchWithError(result, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: (error) =>
      error._tag === "HttpClientError" ||
      error._tag === "SchemaError" ||
      error._tag === "Validation"
        ? m.tickets_title_save_error()
        : errorMessage(error),
    onDefect: () => m.tickets_title_save_error()
  })

  const [draft, setDraft] = useState<string | null>(null)
  const editing = useRef(false)
  const saving = useRef(false)
  const restoreFocus = useRef(false)
  const errorId = useId()

  const previewRef = useCallback((element: HTMLButtonElement | null) => {
    if (element && restoreFocus.current) {
      restoreFocus.current = false
      element.focus()
    }
  }, [])
  const focusAtEnd = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) return
    element.focus()
    element.setSelectionRange(element.value.length, element.value.length)
  }, [])

  function close(focusPreview: boolean) {
    editing.current = false
    restoreFocus.current = focusPreview
    setDraft(null)
  }

  async function commit() {
    if (draft === null || !editing.current || saving.current || pending) return
    const title = draft.trim()
    if (!title || title === ticket.title) {
      close(false)
      return
    }
    saving.current = true
    try {
      if (Exit.isSuccess(await update({ title }))) close(false)
    } finally {
      saving.current = false
    }
  }

  if (draft === null)
    return (
      <button
        type="button"
        ref={previewRef}
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          if (pending) return
          editing.current = true
          setDraft(ticket.title)
        }}
        className="line-clamp-5 w-full rounded-md px-2 py-1.5 text-left text-xl font-semibold break-words transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none aria-busy:animate-pulse motion-reduce:animate-none"
      >
        {ticket.title}
      </button>
    )

  return (
    <>
      <textarea
        ref={focusAtEnd}
        value={draft}
        readOnly={pending}
        maxLength={200}
        aria-label={m.tickets_title_aria_label()}
        aria-busy={pending}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) =>
          setDraft(event.currentTarget.value.replace(/\r?\n/g, " "))
        }
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === "Enter") {
            event.preventDefault()
            void commit()
          } else if (event.key === "Escape") {
            event.preventDefault()
            if (!saving.current && !pending) close(true)
          }
        }}
        className="block field-sizing-content max-h-[calc(5lh+0.75rem)] min-h-[1lh] w-full min-w-0 resize-none overflow-y-auto rounded-md bg-accent/40 px-2 py-1.5 text-xl font-semibold [overflow-wrap:anywhere] ring-2 ring-ring/50 outline-none aria-busy:animate-pulse motion-reduce:animate-none"
      />
      {error && (
        <span
          id={errorId}
          role="alert"
          className="mt-1 block text-xs font-normal text-destructive"
        >
          {error}
        </span>
      )}
    </>
  )
}
