import type { TypeDefinition, TypeKey } from "@pp/shared"

import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { typeOptions, typeName } from "@/features/tickets/lib/ticketTypes"
import { m } from "@/paraglide/messages"

export const typeMenuItems = (
  types: ReadonlyArray<TypeDefinition>,
  {
    epics = true,
    lastUsed
  }: Readonly<{
    epics?: boolean
    lastUsed?: TypeKey | null
  }> = {}
) =>
  typeOptions(types, epics).map((option) => ({
    value: option.value,
    textValue: typeName(option.type),
    separated: option.separated,
    closeOnClick: true,
    label: (
      <>
        <TypeGlyph type={option.type} />
        <span className="truncate">{typeName(option.type)}</span>
        {lastUsed !== undefined && (option.type?.key ?? null) === lastUsed && (
          <span className="ml-auto shrink-0 text-micro text-muted-foreground">
            {m.tickets_create_type_last_used()}
          </span>
        )}
      </>
    )
  }))
