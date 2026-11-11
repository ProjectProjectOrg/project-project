import type { ReactNode } from "react"

export function TicketIdText({
  id,
  children
}: Readonly<{ id: string; children: string }>): ReactNode {
  return children.split(id).flatMap((part, index) =>
    index === 0
      ? [part]
      : [
          <span key={index} className="font-mono tabular-nums">
            {id}
          </span>,
          part
        ]
  )
}
