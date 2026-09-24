import type { TicketType, UpdateTicketInput } from "@pp/shared"
import * as Exit from "effect/Exit"
import { useEffect, useRef, useState } from "react"

import type { DescriptionHandle, TemplateSwapNote } from "./DescriptionField"

export const TEMPLATE_SWAP_NOTE_MS = 4000

export type TypePatch = (
  patch: UpdateTicketInput
) => Promise<Exit.Exit<unknown, unknown>>

export function useTemplateSwap(ticketType: TicketType, onPatch: TypePatch) {
  const descriptionRef = useRef<DescriptionHandle>(null)
  const [note, setNote] = useState<TemplateSwapNote | null>(null)

  useEffect(() => {
    if (note === null) return
    const timer = window.setTimeout(() => setNote(null), TEMPLATE_SWAP_NOTE_MS)
    const stopWatching = descriptionRef.current?.onEdit(note.swapped, () =>
      setNote(null)
    )
    return () => {
      window.clearTimeout(timer)
      stopWatching?.()
    }
  }, [note])

  const rollBack = (swap: TemplateSwapNote) => {
    const description = descriptionRef.current
    if (description?.matches(swap.swapped)) description.restore(swap.previous)
    setNote((current) => (current === swap ? null : current))
  }

  const onTypePatch = (patch: UpdateTicketInput) => {
    const nextType =
      patch.type !== undefined && patch.type !== ticketType ? patch.type : null
    const swap =
      nextType === null
        ? null
        : (descriptionRef.current?.swapTemplate(ticketType, nextType) ?? null)
    if (nextType !== null) setNote(swap)
    void onPatch(patch).then((exit) => {
      if (swap !== null && Exit.isFailure(exit)) rollBack(swap)
    })
  }

  const undo = () => {
    if (note !== null) rollBack(note)
  }

  return { descriptionRef, onTypePatch, note, undo }
}
