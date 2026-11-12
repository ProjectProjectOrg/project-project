import type { BlockDefinition } from "@pp/shared"
import { Plus } from "lucide-react"
import { Fragment } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import type { AddSectionGroups } from "@/features/editor/lexical/blocks/slashMenuItems"
import { BlockIconGlyph } from "@/features/library/components/BlockIconGlyph"
import { m } from "@/paraglide/messages"

export function AddSectionButton({
  groups,
  onAdd
}: Readonly<{
  groups: AddSectionGroups
  onAdd: (definition: BlockDefinition) => void
}>) {
  const shown = [
    {
      key: "suggested",
      label:
        groups.suggestedFor === null
          ? null
          : m.tickets_add_section_suggested({ type: groups.suggestedFor }),
      sections: groups.suggested
    },
    {
      key: "all",
      label: m.tickets_add_section_all(),
      sections: groups.all
    }
  ].filter((group) => group.sections.length > 0)
  if (shown.length === 0) return null
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              leadingIcon={Plus}
            >
              {m.tickets_add_section()}
            </Button>
          }
        />
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="max-h-80 w-64"
        >
          {shown.map((group, index) => (
            <Fragment key={group.key}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                {group.label !== null && (
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                )}
                {group.sections.map((section) => (
                  <DropdownMenuItem
                    key={section.key}
                    onClick={() => onAdd(section)}
                  >
                    <BlockIconGlyph icon={section.icon} color={section.color} />
                    <span className="min-w-0 flex-1 truncate">
                      {section.name}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-caption text-muted-foreground">
        {m.tickets_add_section_slash_hint()}
      </span>
    </div>
  )
}
