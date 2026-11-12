import type { ReactNode } from "react"

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
  return (
    <div className="ticket-page grid w-full grid-cols-1 gap-x-16 gap-y-3 lg:grid-cols-[minmax(0,42rem)_18rem] lg:justify-center">
      <div className="flex items-center justify-between gap-3 lg:contents">
        <div className="lg:mx-auto lg:w-full lg:max-w-[42rem]">{back}</div>
        {actions && (
          <div className="flex items-center justify-end gap-2 lg:justify-start lg:pl-5 [&>*]:shrink-0">
            {actions}
          </div>
        )}
      </div>
      <div className="mx-auto flex w-full max-w-[42rem] min-w-0 flex-col gap-3">
        {header}
        {children}
      </div>
      {aside}
    </div>
  )
}
