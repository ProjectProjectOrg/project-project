import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketDetail } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import { useId, useLayoutEffect, useRef, useState } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { errorMessage } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export function TitleField({
  ticket,
  onEnter
}: Readonly<{ ticket: TicketDetail; onEnter: () => void }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketRequest(orgSlug, slug, ticket.id)
  const atom = updateTicketDetail(req)
  const update = useAtomSet(atom, { mode: "promiseExit" })
  const result = useAtomValue(atom)
  const pending = result.waiting
  const error = mutationErrorText(
    result,
    (error) =>
      Match.value(error).pipe(
        Match.tag("HttpClientError", "SchemaError", "Validation", () =>
          m.tickets_title_save_error()
        ),
        Match.orElse((error) => errorMessage(error))
      ),
    m.tickets_title_save_error
  )

  const [draft, setDraft] = useState<string | null>(null)
  const saving = useRef(false)
  const discarding = useRef(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const errorId = useId()
  const value = draft ?? ticket.title

  useLayoutEffect(() => {
    const element = field.current
    if (!element) return undefined
    const fit = () => {
      element.style.height = "auto"
      element.style.height = `${element.scrollHeight}px`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [value])

  async function commit() {
    if (discarding.current) {
      discarding.current = false
      setDraft(null)
      return
    }
    if (draft === null || saving.current || pending) return
    const title = draft.trim()
    if (!title || title === ticket.title) {
      setDraft(null)
      return
    }
    saving.current = true
    try {
      if (Exit.isSuccess(await update({ title }))) setDraft(null)
    } finally {
      saving.current = false
    }
  }

  return (
    <>
      <textarea
        ref={field}
        value={value}
        rows={1}
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
            if (!event.shiftKey) onEnter()
          } else if (event.key === "Escape") {
            event.preventDefault()
            if (saving.current || pending) return
            discarding.current = true
            event.currentTarget.blur()
          }
        }}
        className="block w-full min-w-0 resize-none overflow-hidden bg-transparent px-2 py-1.5 text-display-compact font-semibold wrap-anywhere outline-none aria-busy:animate-pulse motion-reduce:animate-none"
      />
      {error && (
        <span
          id={errorId}
          role="alert"
          className="mt-1 block text-caption font-normal text-destructive"
        >
          {error}
        </span>
      )}
    </>
  )
}
