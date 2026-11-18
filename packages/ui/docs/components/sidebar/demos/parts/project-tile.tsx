import { ProjectIcon, projectIconRadius } from "@pp/ui/project-icon"
import type { CSSProperties } from "react"

// The rail tile's side in px, as the app's (AppRail, ProjectIconTile's
// "rail" size).
export const RAIL_TILE = 34

// What the app passes a project's rail item, so the item takes the tile's
// own squircle (its hover and active ring follow the tile's shape).
export const railTileItem = {
  className: "corner-squircle",
  style: { borderRadius: projectIconRadius(RAIL_TILE) } satisfies CSSProperties
} as const

// The app's project tile in the rail: @pp/ui's ProjectIcon, its backdrop
// generated from the project, with the project's emoji.
export function ProjectTile({
  slug,
  icon,
  color
}: Readonly<{ slug: string; icon: string; color: string }>) {
  return <ProjectIcon seed={slug} color={color} icon={icon} size={RAIL_TILE} />
}
