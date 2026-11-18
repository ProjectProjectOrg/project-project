import { useAtomValue } from "@effect/atom-react"

import { projectLibraryRequest } from "@/features/library/atoms/library"
import { projectTicketTypes } from "@/features/tickets/atoms/ticketTypes"

export function useTicketTypes(orgSlug: string, slug: string) {
  return useAtomValue(projectTicketTypes(projectLibraryRequest(orgSlug, slug)))
}
