import { use, type ReactNode } from "react"

import { TicketLayoutContext } from "@/features/tickets/components/ticket-page/ticketLayout"

export function TicketPageShell({
  back,
  actions,
  header,
  aside,
  children
}: Readonly<{
  back: ReactNode
  actions?: ReactNode
  header: ReactNode
  aside?: ReactNode
  children: ReactNode
}>) {
  const pane = use(TicketLayoutContext) === "pane"
  if (pane)
    return (
      <div className="@container/ticket w-full">
        <div className="ticket-page grid w-full grid-cols-1 gap-x-10 gap-y-3 @3xl/ticket:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="flex items-center justify-end gap-2 @3xl/ticket:col-start-2 @3xl/ticket:justify-start @3xl/ticket:pl-5 [&>*]:shrink-0">
            {actions}
          </div>
          <div className="flex w-full max-w-[42rem] min-w-0 flex-col gap-3 @3xl/ticket:col-start-1 @3xl/ticket:row-span-2 @3xl/ticket:row-start-1">
            {header}
            {children}
          </div>
          {aside}
        </div>
      </div>
    )
  return (
    // oxlint-disable-next-line shadcn/no-arbitrary-values -- centres the 64rem page while the sidebar column hangs off its right
    <div className="ticket-page grid w-full grid-cols-1 gap-x-16 gap-y-3 lg:grid-cols-[minmax(0,42rem)_18rem] lg:pl-[max(0px,calc((100%-64rem)/2))]">
      <div className="flex items-center justify-between gap-3 lg:contents">
        <div>{back}</div>
        <div className="flex items-center justify-end gap-2 lg:justify-start lg:pl-5 [&>*]:shrink-0">
          {actions}
        </div>
      </div>
      <div className="flex w-full max-w-[42rem] min-w-0 flex-col gap-3">
        {header}
        {children}
      </div>
      {aside}
    </div>
  )
}
