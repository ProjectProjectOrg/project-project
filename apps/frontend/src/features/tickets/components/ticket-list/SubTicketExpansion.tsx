import type { TicketId } from "@pp/shared"
import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode
} from "react"

import { useSubTicketsExpanded } from "@/features/tickets/hooks/useSubTicketsExpanded"

type SubTicketExpansion = Readonly<{
  isExpanded: (id: TicketId) => boolean
  toggle: (id: TicketId) => void
}>

const SubTicketExpansionContext = createContext<SubTicketExpansion | null>(null)

export function SubTicketExpansionProvider({
  children
}: Readonly<{ children: ReactNode }>) {
  const [byDefault] = useSubTicketsExpanded()
  const [choices, setChoices] = useState<ReadonlyMap<TicketId, boolean>>(
    () => new Map()
  )
  const isExpanded = useCallback(
    (id: TicketId) => choices.get(id) ?? byDefault,
    [choices, byDefault]
  )
  const toggle = useCallback(
    (id: TicketId) =>
      setChoices((current) =>
        new Map(current).set(id, !(current.get(id) ?? byDefault))
      ),
    [byDefault]
  )
  const value = useMemo(() => ({ isExpanded, toggle }), [isExpanded, toggle])
  return (
    <SubTicketExpansionContext value={value}>
      {children}
    </SubTicketExpansionContext>
  )
}

export const useSubTicketExpansion = () => use(SubTicketExpansionContext)
