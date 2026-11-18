import type { ProjectIconImage, ProjectTone } from "@pp/shared"
import { ProjectIcon } from "@pp/ui/project-icon"
import type { ReactNode } from "react"

import { ProjectIconDisplay } from "@/features/projects/components/ProjectIconDisplay"

// The app's sizes for a project's tile, in px.
type TileSize = "row" | "xs" | "compact" | "rail" | "sm" | "md" | "lg"

const SIZE_TO_PX: Record<TileSize, number> = {
  // A settings row, in a line icon's 16px slot.
  row: 14,
  xs: 16,
  compact: 28,
  // The sidebar rail's item.
  rail: 34,
  sm: 36,
  md: 40,
  lg: 48
}

// A project's tile: @pp/ui's ProjectIcon (a backdrop generated from the
// project, with its emoji), plus the project's uploaded icon when it has one.
export function ProjectIconTile({
  orgSlug,
  icon,
  iconImage,
  color,
  tone = "mono",
  colors,
  size,
  seed,
  waiting = false,
  iconNode,
  className
}: {
  orgSlug: string
  icon: string
  iconImage: ProjectIconImage | null
  color: string
  // One hue or several (the project's multicolour choice).
  tone?: ProjectTone
  // Multicolor's picked colours; none means seeded.
  colors?: ReadonlyArray<string>
  size: TileSize
  seed?: string
  waiting?: boolean
  iconNode?: ReactNode
  className?: string
}) {
  const px = SIZE_TO_PX[size]
  const image =
    iconNode ??
    (iconImage === null ? undefined : (
      <ProjectIconDisplay
        orgSlug={orgSlug}
        icon={icon}
        iconImage={iconImage}
        size={px}
      />
    ))
  return (
    <ProjectIcon
      seed={seed ?? color}
      color={color}
      tone={tone}
      colors={colors}
      icon={icon}
      image={image}
      size={px}
      waiting={waiting}
      className={className}
    />
  )
}
