import { Badge } from "@pp/ui/badge"
import type { ComponentProps } from "react"

const NEUTRAL = "#94a3b8"

// A tag in its own hue, through the badge's clean-colour recipe. Pass
// `render` to make it a menu trigger or preview trigger.
export function TagChip({
  color,
  style,
  ...props
}: Omit<ComponentProps<typeof Badge>, "tone" | "color"> &
  Readonly<{ color: string | null | undefined }>) {
  return (
    <Badge
      data-slot="tag-chip"
      {...props}
      tone={null}
      style={{ ...style, "--badge-tone": color ?? NEUTRAL }}
    />
  )
}
