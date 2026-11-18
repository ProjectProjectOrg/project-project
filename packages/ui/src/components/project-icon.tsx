import { useMemo, type ReactNode } from "react"

import type { PaletteTone } from "../lib/ditherPalette"
import { projectTileUrl } from "../lib/projectTile"
import { cn } from "../lib/utils"
import { avatarEdgeClass } from "./avatar"

/*
 * ProjectIcon: a project's tile, the square sibling of MemberAvatar.
 *
 *   <ProjectIcon seed={project.id} color={project.color} icon={project.icon} size={28} />
 *
 * The backdrop is generated from the seed and the project's colour
 * (lib/projectTile): a pattern, a light direction and a texture, painted
 * through the same ordered dither as the member orbs. The emoji sits on top,
 * centred on the tile; an uploaded image (`image`) replaces it.
 */

// The emoji is centred by the grid at its real width. Below about 14px the
// emoji font draws its smallest bitmap, up to 30% wider than the font size,
// so a box the size of the font would push it off to the right. Vertically,
// with line-height 1, the glyph already sits on the centre.
const EMOJI_SCALE = 0.62

const emojiShadow = (size: number) =>
  size < 24
    ? "drop-shadow(0 0.5px 0 rgb(0 0 0 / 0.4))"
    : [
        "drop-shadow(0 1px 0 rgb(0 0 0 / 0.45))",
        "drop-shadow(0 3px 5px rgb(0 0 0 / 0.5))",
        "drop-shadow(0 6px 8px rgb(0 0 0 / 0.3))"
      ].join(" ")

// Corners at about a quarter of the side, squircled like the house controls.
const projectIconRadius = (size: number) => Math.max(3, Math.round(size * 0.28))

type ProjectIconProps = Readonly<{
  // What the backdrop is generated from: the project's id (or slug).
  seed: string
  // The project's colour, as #rrggbb.
  color: string
  // How the colour is used: one hue ("mono"), the member orbs' three hues
  // ("multi"), or none ("gray").
  tone?: PaletteTone
  // Multicolour's picked colours (with tone "multi"); none means seeded.
  colors?: ReadonlyArray<string>
  // The project's emoji.
  icon?: string
  // An uploaded icon to show instead of the emoji, sized to fill the tile.
  image?: ReactNode
  // The side in px.
  size: number
  // Pulses while the project's icon is being saved.
  waiting?: boolean
  // The project's name, when the tile stands alone; leave it out when the
  // name is next to it and the tile is hidden from assistive tech.
  label?: string
  className?: string
}>

function ProjectIcon({
  seed,
  color,
  tone = "mono",
  colors,
  icon,
  image,
  size,
  waiting = false,
  label,
  className
}: ProjectIconProps) {
  const backdrop = useMemo(
    () => projectTileUrl(seed, color, size, tone, colors),
    [seed, color, size, tone, colors]
  )
  const fontSize = Math.round(size * EMOJI_SCALE)
  return (
    <span
      data-slot="project-icon"
      {...(label === undefined
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label })}
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden bg-cover select-none corner-squircle",
        // The avatars' hairline edge and top light, so tiles and orbs match.
        avatarEdgeClass,
        waiting && "animate-pulse",
        className
      )}
      style={{
        width: size,
        height: size,
        borderRadius: projectIconRadius(size),
        // The palette is translucent, like the member orbs; a card-coloured
        // base under it keeps the tile the same wherever it sits (the rail's
        // tinted items, cards, rows) instead of taking on what's behind.
        backgroundColor: "var(--card)",
        backgroundImage: backdrop ? `url(${backdrop})` : undefined
      }}
    >
      {image ?? (
        <span
          className="block whitespace-nowrap"
          style={{ fontSize, lineHeight: 1, filter: emojiShadow(size) }}
        >
          {icon}
        </span>
      )}
    </span>
  )
}

export { ProjectIcon, projectIconRadius }
export type { ProjectIconProps }
