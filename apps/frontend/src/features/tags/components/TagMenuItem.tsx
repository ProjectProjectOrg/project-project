import type { Tag } from "@pp/shared"

import { CheckboxMenuItem } from "@/components/ui/checkbox-menu-item"
import { menuItemMetaClass } from "@/components/ui/menu-styles"

export function TagMenuItem({
  tag,
  checked,
  onToggle,
  count
}: Readonly<{
  tag: Pick<Tag, "name" | "color">
  checked: boolean
  onToggle: () => void
  count?: number | undefined
}>) {
  return (
    <CheckboxMenuItem
      label={tag.name}
      value={tag.name}
      checked={checked}
      onToggle={onToggle}
    >
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <span className="min-w-0 truncate">{tag.name}</span>
      {count !== undefined && (
        <span data-menu-meta className={menuItemMetaClass}>
          {count}
        </span>
      )}
    </CheckboxMenuItem>
  )
}
