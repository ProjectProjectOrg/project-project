import { useAtomValue } from "@effect/atom-react"
import type { Ticket, TicketId, TicketPosition, TicketStatus } from "@pp/shared"
import { BoardDraftCard } from "@pp/ui/board-card"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/reactivity/AsyncResult"
import { useCallback, useLayoutEffect, useRef, useState } from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  project as projectView,
  projectRequest
} from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { CreatorTypeMenu } from "@/features/tickets/components/ticket-list/CreatorMenus"
import { useCreatorFocus } from "@/features/tickets/components/ticket-list/useCreatorFocus"
import { useCreatorType } from "@/features/tickets/hooks/useCreatorType"
import type { QuickCreateInput } from "@/features/tickets/lib/ticketRows"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

import type { ColumnCreate } from "../hooks/useBoardDraft"

export type BoardTicketCreate = (
  input: QuickCreateInput
) => Promise<
  Exit.Exit<
    Readonly<{ id: TicketId; sprintAssignmentFailed?: boolean }>,
    Readonly<{ _tag: string }>
  >
>

const placeAfter = (anchor: TicketId | null | undefined) =>
  anchor ? ({ after: anchor } satisfies TicketPosition) : undefined

export function BoardTicketDraft({
  status,
  tickets,
  index,
  column,
  initialTitle = "",
  initialError = null
}: Readonly<{
  status: TicketStatus
  tickets: ReadonlyArray<Ticket>
  index: number
  column: ColumnCreate
  initialTitle?: string
  initialError?: string | null
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const viewerId = useAtomValue(currentUserId)
  const project = useAtomValue(projectView(projectRequest(orgSlug, slug)))
  const projectPrefix = Result.isSuccess(project) ? project.value.key : "T"
  const estimation = Result.isSuccess(project)
    ? project.value.estimation
    : "off"
  const creatorType = useCreatorType({ orgSlug, slug, epics: false })
  const [title, setTitle] = useState(initialTitle)
  const [error, setError] = useState<string | null>(initialError)
  const [note, setNote] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const discard = useRef(false)
  const previous = useRef<Promise<TicketId | null> | null>(null)
  const inFlight = useRef(0)
  const mounted = useRef(true)
  const latestTickets = useRef(tickets)
  useLayoutEffect(() => {
    latestTickets.current = tickets
  })
  useLayoutEffect(
    () => () => {
      mounted.current = false
    },
    []
  )

  const focusOnMount = useCallback((node: HTMLTextAreaElement | null) => {
    inputRef.current = node
    node?.focus()
  }, [])

  const dismiss = column.close

  const fail = (failedTitle: string, reason: string) => {
    if (!mounted.current) return column.reopen(index, failedTitle, reason)
    setTitle((current) => (current === "" ? failedTitle : current))
    setError(
      inputRef.current?.value.trim()
        ? m.sprints_board_draft_failed({ title: failedTitle, reason })
        : reason
    )
  }

  const submit = (keepOpen: boolean) => {
    const trimmed = title.trim()
    if (trimmed === "") return dismiss()
    setTitle("")
    setError(null)
    setNote(null)
    const typePayload = creatorType.payload
    const inputAt = (position: TicketPosition | undefined) =>
      ({
        payload: { title: trimmed, status, ...typePayload, position },
        sprint: column.sprint,
        inPlace: true,
        prediction: {
          clientId: Effect.runSync(Random.next).toString(36),
          createdBy: viewerId ?? "",
          projectPrefix,
          estimation,
          ...creatorType.prediction
        }
      }) satisfies QuickCreateInput
    const send = async (position: TicketPosition | undefined) => {
      inFlight.current += 1
      const exit = await column.submit(inputAt(position))
      inFlight.current -= 1
      creatorType.settle(exit)
      if (Exit.isFailure(exit)) {
        fail(trimmed, errorMessage(Cause.squash(exit.cause)))
        return null
      }
      if (exit.value.sprintAssignmentFailed && mounted.current)
        setError(m.tickets_create_sprint_assignment_failed())
      return exit.value.id
    }
    const next = tickets[index]
    const prior = previous.current
    previous.current = !column.insertable
      ? send(undefined)
      : next !== undefined
        ? send({ before: next.id })
        : inFlight.current > 0 && prior !== null
          ? prior.then((id) =>
              send(placeAfter(id ?? latestTickets.current.at(-1)?.id))
            )
          : send(placeAfter(tickets[index - 1]?.id))
    if (!keepOpen) return column.close()
    if (column.showsInPlace(inputAt(undefined))) column.advance()
    else setNote(m.sprints_board_draft_elsewhere({ title: trimmed }))
  }

  useCreatorFocus(
    containerRef,
    () => {
      if (discard.current) dismiss()
      else submit(false)
    },
    true
  )

  return (
    <div ref={containerRef}>
      <BoardDraftCard
        ref={focusOnMount}
        aria-label={m.sprints_board_draft_label()}
        aria-invalid={error ? true : undefined}
        placeholder={m.sprints_board_draft_placeholder()}
        maxLength={200}
        value={title}
        error={error}
        note={note}
        meta={
          <CreatorTypeMenu
            type={creatorType.type}
            lastUsed={creatorType.lastUsed}
            epics={false}
            onTypeChange={creatorType.pick}
            expanded
            inputRef={inputRef}
          />
        }
        onChange={(event) => setTitle(event.target.value)}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") discard.current = true
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return
          event.preventDefault()
          submit(true)
        }}
      />
    </div>
  )
}
