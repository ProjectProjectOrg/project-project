import type { TypeDefinition, TypeKey } from "@pp/shared"
import { type MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { startingTypes } from "@/features/tickets/lib/creatorType"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const keepEditorFocus = (event: MouseEvent) => event.preventDefault()

export function DescriptionTypeStarts({
  types,
  ticketType,
  onStart,
  className
}: Readonly<{
  types: ReadonlyArray<TypeDefinition>
  ticketType: TypeKey | null
  onStart: (type: TypeKey) => void
  className?: string
}>) {
  const starts = startingTypes(types, ticketType)
  if (starts.length === 0) return null
  return (
    <div
      role="group"
      aria-label={m.tickets_description_starts_label()}
      className={cn(
        "pointer-events-none flex flex-col gap-2 text-caption leading-6 text-muted-foreground",
        className
      )}
    >
      <p>{m.tickets_description_starts_teaser()}</p>
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 self-start">
        <span className="mr-0.5">{m.tickets_description_starts_label()}</span>
        {starts.map((type) => (
          <Button
            key={type.key}
            type="button"
            variant="template-start"
            onMouseDown={keepEditorFocus}
            onClick={() => onStart(type.key)}
          >
            <TypeGlyph type={type} className="size-3.5" />
            {type.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
