import { cn } from "../lib/utils"
import type { IconType } from "./icons"

/*
 * A ticket status's icon at the size every list and board uses (16px, a
 * 1.75 stroke), in the status's colour: a section header, a board column, a
 * drag preview.
 *
 *   <StatusGlyph icon={meta.icon} className={meta.className} color={meta.color} />
 *
 * Built-in statuses colour themselves through `className`; a project's own
 * status brings its picked colour as `color`.
 */

export function StatusGlyph({
  icon: Icon,
  className,
  color
}: Readonly<{
  icon: IconType
  className?: string
  // A picked colour (#rrggbb) for a custom status.
  color?: string | null
}>) {
  return (
    <Icon
      aria-hidden
      className={cn("size-4", className)}
      style={color ? { color } : undefined}
      strokeWidth={1.75}
    />
  )
}
