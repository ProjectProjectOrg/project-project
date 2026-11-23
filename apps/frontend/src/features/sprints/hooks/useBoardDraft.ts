import type { GroupId, TicketStatus } from "@pp/shared"
import { useRef, useState } from "react"

import type { QuickCreateInput } from "@/features/tickets/lib/ticketRows"

import type { BoardTicketCreate } from "../components/BoardTicketDraft"

type BoardDraft = Readonly<{
  status: TicketStatus
  index: number
  key: string
  title?: string
  error?: string
}>

export type ColumnCreateOptions = Readonly<{
  submit: BoardTicketCreate
  insertable: boolean
  sprint?: GroupId
  showsInPlace: (input: QuickCreateInput) => boolean
}>

export type ColumnCreate = ColumnCreateOptions &
  Readonly<{
    draft: BoardDraft | null
    open: (index: number) => void
    reopen: (index: number, title: string, error: string) => void
    advance: () => void
    close: () => void
  }>

export function useBoardDraft() {
  const [draft, setDraft] = useState<BoardDraft | null>(null)
  const opened = useRef(0)
  const forColumn = (status: TicketStatus, options: ColumnCreateOptions) => {
    const current = draft?.status === status ? draft : null
    const start = (index: number, title?: string, error?: string) => {
      opened.current += 1
      setDraft({ status, index, key: `draft-${opened.current}`, title, error })
    }
    return {
      ...options,
      draft: current,
      open: (index) => start(index),
      reopen: start,
      advance: () =>
        setDraft((latest) =>
          latest?.key === current?.key && latest
            ? { ...latest, index: latest.index + 1 }
            : latest
        ),
      close: () =>
        setDraft((latest) => (latest?.key === current?.key ? null : latest))
    } satisfies ColumnCreate
  }
  return { forColumn }
}
