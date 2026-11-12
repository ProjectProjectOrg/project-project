import type { ArchiveTicketInput } from "@pp/shared"

import { appFormOptions } from "@/lib/form"

export type ArchiveTicketValues = Readonly<{
  preset: string | null
  details: string
}>

const defaultValues: ArchiveTicketValues = { preset: null, details: "" }

export const archiveTicketFormOpts = appFormOptions({ defaultValues })

export const toArchiveTicketInput = ({
  preset,
  details
}: ArchiveTicketValues): ArchiveTicketInput => {
  const parts = [preset, details.trim()].filter(
    (part): part is string => part !== null && part !== ""
  )
  return { reason: parts.length === 0 ? undefined : parts.join(": ") }
}
