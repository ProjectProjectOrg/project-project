import type { Tag } from "@pp/shared"

import { CheckboxMenuItem } from "@/components/ui/checkbox-menu-item"

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
    <CheckboxMenuItem label={tag.name} checked={checked} onToggle={onToggle}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <span className="min-w-0 truncate">{tag.name}</span>
    </CheckboxMenuItem>
  )
}
