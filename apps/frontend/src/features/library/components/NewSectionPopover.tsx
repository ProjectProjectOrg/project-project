import type { Library } from "@pp/shared"
import { Popover, PopoverContent, PopoverTitle } from "@pp/ui/popover"
import type { RefObject } from "react"

import { LibraryCreateForm } from "@/features/library/forms/library-create"
import { m } from "@/paraglide/messages"

import type { LibraryScope } from "../atoms/libraryScope"

// Creating a new section from the "Add section" menu: the menu closes and
// this popover opens on the same Add section button.
export function NewSectionPopover({
  scope,
  library,
  typeName,
  anchor,
  open,
  onOpenChange,
  onCreated
}: Readonly<{
  scope: LibraryScope
  library: Library
  typeName: string
  anchor: RefObject<HTMLElement | null>
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (key: string) => void
}>) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverContent
        anchor={anchor}
        align="start"
        sideOffset={6}
        className="w-80"
      >
        <PopoverTitle className="text-subtitle font-semibold">
          {m.templates_new_section_title()}
        </PopoverTitle>
        <p className="mt-0.5 mb-3 text-body text-muted-foreground">
          {m.templates_new_section_for_type({ name: typeName })}
        </p>
        <LibraryCreateForm
          kind="section"
          scope={scope}
          library={library}
          orgLibrary={null}
          layers={[scope.layer]}
          orgName=""
          compact
          onCreated={(key) => {
            onCreated(key)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
