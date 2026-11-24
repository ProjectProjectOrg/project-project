import { createPortal } from "react-dom"

import { LoaderOverlay } from "@/components/shell/LoaderOverlay"

export function TicketPageLoading() {
  return createPortal(<LoaderOverlay active />, document.body)
}
