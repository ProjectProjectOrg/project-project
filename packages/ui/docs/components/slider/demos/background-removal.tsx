import { Button } from "@pp/ui/button"
import { Slider } from "@pp/ui/slider"
import { useState } from "react"

const SAMPLE = "/samples/figma-onboarding.png"

// A 40px tile as the treatment choices preview it: the photo cut out on the
// project's accent, or the photo filling the tile.
function Tile({ cutout }: Readonly<{ cutout: boolean }>) {
  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[12px] [corner-shape:var(--button-corner)]"
      style={{ background: cutout ? "oklch(0.72 0.13 250)" : undefined }}
    >
      <img
        src={SAMPLE}
        alt=""
        className={cutout ? "size-8 object-contain" : "size-full object-cover"}
      />
    </span>
  )
}

function Choice({
  active,
  title,
  hint,
  cutout,
  onSelect
}: Readonly<{
  active: boolean
  title: string
  hint: string
  cutout: boolean
  onSelect: () => void
}>) {
  return (
    <Button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      variant="selection-card"
      size="selection-card"
    >
      <Tile cutout={cutout} />
      <span className="flex min-w-0 flex-col">
        <span className="text-body font-semibold">{title}</span>
        <span className="text-caption text-muted-foreground">{hint}</span>
      </span>
    </Button>
  )
}

// The project icon's last step: how the photo sits in the tile. Picking the
// cutout shows the background removal slider (0 to 160), as in the app.
export default function BackgroundRemoval() {
  const [kind, setKind] = useState<"sticker" | "full_bleed">("sticker")
  const [tolerance, setTolerance] = useState(48)
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <span className="text-body font-semibold">
        How should it sit in the tile?
      </span>
      <div className="flex gap-2.5">
        <Choice
          active={kind === "sticker"}
          title="Cutout"
          hint="Subject cut out, on your accent"
          cutout
          onSelect={() => setKind("sticker")}
        />
        <Choice
          active={kind === "full_bleed"}
          title="Cropped"
          hint="Photo fills the tile"
          cutout={false}
          onSelect={() => setKind("full_bleed")}
        />
      </div>
      {kind === "sticker" ? (
        <Slider
          label="Background removal"
          min={0}
          max={160}
          value={tolerance}
          onChange={setTolerance}
          endLabels={[
            "Gentle · keeps more background",
            "Aggressive · may eat the subject"
          ]}
        />
      ) : null}
    </div>
  )
}
