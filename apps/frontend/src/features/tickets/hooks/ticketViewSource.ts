import { createContext } from "react"

import type { TicketNavigationSearch } from "@/features/tickets/lib/ticketSearch"

export const TicketViewSourceContext = createContext<
  TicketNavigationSearch | undefined
>(undefined)
