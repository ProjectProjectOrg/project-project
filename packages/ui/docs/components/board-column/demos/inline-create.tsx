import { BoardCard, BoardDraftCard } from "@pp/ui/board-card"
import {
  BoardCardList,
  boardCardSlotClass,
  BoardColumnAddButton,
  BoardColumnHeader,
  BoardColumnTitle,
  BoardInsertGap,
  boardColumnClass,
  boardColumnTone
} from "@pp/ui/board-column"
import { TicketKey } from "@pp/ui/ticket-key"
import { Fragment, useState } from "react"

import {
  AUDIT,
  FOCUS,
  INVITED,
  StatusIcon,
  type SampleTicket
} from "../../list-row/demos/parts/tickets"

type Draft = Readonly<{ index: number; title: string }>

export default function InlineCreate() {
  const [tickets, setTickets] = useState<ReadonlyArray<SampleTicket>>([
    FOCUS,
    AUDIT,
    INVITED
  ])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [next, setNext] = useState(40)

  const open = (index: number) => setDraft({ index, title: "" })
  const dismiss = () => setDraft(null)
  const submit = (keepOpen: boolean) => {
    if (!draft) return
    const title = draft.title.trim()
    if (title === "") return dismiss()
    const ticket = { ...FOCUS, id: `ATL-${next}`, title }
    setNext(next + 1)
    setTickets((current) => [
      ...current.slice(0, draft.index),
      ticket,
      ...current.slice(draft.index)
    ])
    setDraft(keepOpen ? { index: draft.index + 1, title: "" } : null)
  }

  const draftCard = draft && (
    <li key="draft" className={boardCardSlotClass}>
      <BoardDraftCard
        ref={(node) => node?.focus()}
        aria-label="New ticket title"
        placeholder="What needs to be done?"
        value={draft.title}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Escape") dismiss()
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return
          event.preventDefault()
          submit(true)
        }}
        onBlur={() => submit(false)}
      />
    </li>
  )

  return (
    <div
      className={boardColumnClass}
      style={{ ...boardColumnTone("var(--state-info)"), height: "28rem" }}
    >
      <BoardColumnHeader
        title={
          <BoardColumnTitle
            icon={<StatusIcon status="progress" />}
            label="In progress"
          />
        }
        count={tickets.length}
      />
      <BoardCardList scrollLabel="Scrollable">
        <ul className="relative w-full">
          {tickets.map((ticket, index) => (
            <Fragment key={ticket.id}>
              {draft?.index === index && draftCard}
              {index > 0 && draft === null && (
                <li aria-hidden className="relative h-0">
                  <BoardInsertGap
                    top={0}
                    label="New ticket here"
                    onInsert={() => open(index)}
                  />
                </li>
              )}
              <li className={boardCardSlotClass}>
                <BoardCard
                  meta={<TicketKey value={ticket.id} />}
                  title={ticket.title}
                />
              </li>
            </Fragment>
          ))}
          {draft?.index === tickets.length && draftCard}
        </ul>
      </BoardCardList>
      <BoardColumnAddButton
        label="New ticket"
        folded={draft !== null}
        onClick={() => open(tickets.length)}
      />
    </div>
  )
}
