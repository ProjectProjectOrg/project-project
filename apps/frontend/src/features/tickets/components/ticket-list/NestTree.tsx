import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export type RowNest =
  | Readonly<{ role: "parent"; expanded: boolean; onToggle: () => void }>
  | Readonly<{ role: "child"; last: boolean }>

const LINE =
  "border-[color-mix(in_oklab,var(--muted-foreground)_28%,var(--background))]"

export function NestTree({ nest }: Readonly<{ nest: RowNest | undefined }>) {
  if (nest === undefined) return null
  if (nest.role === "child") {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-4"
      >
        {!nest.last && (
          <span
            className={cn(
              "absolute -top-2 -bottom-2 left-[6px] border-l",
              LINE
            )}
          />
        )}
        <span
          className={cn(
            "absolute -top-2 bottom-1/2 left-[6px] w-3 rounded-bl-[6px] border-b border-l",
            LINE
          )}
        />
      </span>
    )
  }
  return (
    <>
      {nest.expanded && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-[calc(50%+9px)] -bottom-2 left-[6px] border-l",
            LINE
          )}
        />
      )}
      <span className="absolute top-1/2 left-[-2px] z-20 -translate-y-1/2">
        <button
          type="button"
          aria-expanded={nest.expanded}
          aria-label={
            nest.expanded
              ? m.tickets_sub_tickets_collapse()
              : m.tickets_sub_tickets_expand()
          }
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            nest.onToggle()
          }}
          className="grid size-4 place-items-center rounded text-muted-foreground transition-[color,background-color] duration-100 hover:bg-hover hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "size-3 transition-transform duration-150",
              nest.expanded && "rotate-90"
            )}
            strokeWidth={2}
          />
        </button>
      </span>
    </>
  )
}
