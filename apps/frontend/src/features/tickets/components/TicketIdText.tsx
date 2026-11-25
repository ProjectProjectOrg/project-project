import type { ReactNode } from "react"

export function TicketIdText({
  id,
  children
}: Readonly<{ id: string; children: string }>) {
  if (id.length === 0) return children
  const parts: Array<ReactNode> = []
  let start = 0
  for (
    let offset = children.indexOf(id);
    offset !== -1;
    offset = children.indexOf(id, start)
  ) {
    parts.push(
      children.slice(start, offset),
      <span key={offset} className="tabular-nums">
        {id}
      </span>
    )
    start = offset + id.length
  }
  parts.push(children.slice(start))
  return parts
}
