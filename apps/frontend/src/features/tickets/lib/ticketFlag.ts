import type { TicketFlag } from "@pp/shared"

export const flagFor = (reason: string, by: string, at: Date) => {
  const trimmed = reason.trim()
  return trimmed === ""
    ? ({ by, at } satisfies TicketFlag)
    : ({ reason: trimmed, by, at } satisfies TicketFlag)
}
