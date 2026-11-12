import { useAtomValue } from "@effect/atom-react"
import type { TypeDefinition } from "@pp/shared"

import { projectLibraryRequest } from "@/features/library/atoms/library"
import { projectTicketTypes } from "@/features/tickets/atoms/ticketTypes"

export function useTicketTypes(
  orgSlug: string,
  slug: string
): ReadonlyArray<TypeDefinition> {
  return useAtomValue(projectTicketTypes(projectLibraryRequest(orgSlug, slug)))
}
