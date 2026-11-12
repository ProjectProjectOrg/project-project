import type { TicketListQuery } from "@pp/shared"
import { createContext, use, useLayoutEffect } from "react"

export const ShownQueryContext = createContext<
  ((query: TicketListQuery | null) => void) | null
>(null)

export function useReportShownQuery(query: TicketListQuery | undefined) {
  const report = use(ShownQueryContext)
  useLayoutEffect(() => {
    if (report && query) report(query)
  }, [report, query])
  useLayoutEffect(() => () => report?.(null), [report])
}
