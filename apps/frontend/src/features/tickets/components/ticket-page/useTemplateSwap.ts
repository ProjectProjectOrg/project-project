import type { TypeKey } from "@pp/shared"
import * as Exit from "effect/Exit"
import { useEffect, useRef, useState } from "react"

import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"

import type { DescriptionHandle, TemplateSwapNote } from "./DescriptionField"

export const TEMPLATE_SWAP_NOTE_MS = 4000

export type TypePatch = (
  patch: TicketEdit
) => Promise<Exit.Exit<unknown, unknown>>

export function useTemplateSwap(
  ticketType: TypeKey | null,
  onPatch: TypePatch
) {
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

  const onTypePatch = (patch: TicketEdit) => {
    const retyped = patch.type !== undefined && patch.type !== ticketType
    const swap =
      patch.type === undefined || !retyped
        ? null
        : (descriptionRef.current?.swapTemplate(ticketType, patch.type) ?? null)
    if (retyped) setNote(swap)
    void onPatch(patch).then((exit) => {
      if (swap !== null && Exit.isFailure(exit)) rollBack(swap)
    })
  }

  const undo = () => {
    if (note !== null) rollBack(note)
  }

  return { descriptionRef, onTypePatch, note, undo }
}
