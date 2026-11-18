import type { Tag } from "@pp/shared"
import { DropdownMenuCheckboxItem } from "@pp/ui/dropdown-menu"

export function TagMenuItem({
  tag,
  checked,
  onToggle
}: Readonly<{
  tag: Pick<Tag, "name" | "color">
  checked: boolean
  onToggle: () => void
}>) {
  return (
    <DropdownMenuCheckboxItem
      label={tag.name}
      checked={checked}
      closeOnClick={false}
      onCheckedChange={onToggle}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <span className="min-w-0 truncate">{tag.name}</span>
    </DropdownMenuCheckboxItem>
  )
}
