import { DitherBackdrop } from "@pp/ui/button-dither"

const EMOJI_SHADOW = [
  "drop-shadow(0 1px 0 rgba(0,0,0,0.45))",
  "drop-shadow(0 3px 5px rgba(0,0,0,0.55))",
  "drop-shadow(0 6px 8px rgba(0,0,0,0.35))"
].join(" ")

// The app's ProjectIconTile (features/projects/components/ProjectIconTile):
// an ordered dither from the darkened project colour into the colour, with
// the emoji on top, filling the rail item's squircle.
export function ProjectTile({
  icon,
  color
}: Readonly<{ icon: string; color: string }>) {
  return (
    <span className="relative grid size-full place-items-center overflow-hidden rounded-[inherit] text-subtitle leading-none [corner-shape:inherit]">
      <DitherBackdrop
        from={`color-mix(in oklch, ${color} 60%, black 40%)`}
        to={color}
        direction="br"
        stops={[0, 1]}
        matrix="4x4"
        pixelSize={2}
        shape="square"
      />
      <span aria-hidden className="relative" style={{ filter: EMOJI_SHADOW }}>
        {icon}
      </span>
    </span>
  )
}
