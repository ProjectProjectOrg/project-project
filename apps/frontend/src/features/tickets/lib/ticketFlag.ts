import type { TicketFlag } from "@pp/shared"

export const flagFor = (reason: string, by: string, at: Date): TicketFlag => {
  const trimmed = reason.trim()
  return trimmed === "" ? { by, at } : { reason: trimmed, by, at }
}
