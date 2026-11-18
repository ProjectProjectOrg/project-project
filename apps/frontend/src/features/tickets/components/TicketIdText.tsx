export function TicketIdText({
  id,
  children
}: Readonly<{ id: string; children: string }>) {
  return children.split(id).flatMap((part, index) =>
    index === 0
      ? [part]
      : [
          <span key={index} className="tabular-nums">
            {id}
          </span>,
          part
        ]
  )
}
