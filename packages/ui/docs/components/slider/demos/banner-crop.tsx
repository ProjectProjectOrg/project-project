import { CropWindow } from "@pp/ui/crop-window"
import { Slider } from "@pp/ui/slider"
import { useState } from "react"

// The project banner's crop step: a 3:1 strip over the painting, the zoom
// slider under it, and the hint, as the app lays them out.
export default function BannerCrop() {
  const [crop, setCrop] = useState({ x: 0.5, y: 0.5, zoom: 1.2 })
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <span className="text-body font-semibold">
        Which strip of the painting?
      </span>
      <CropWindow
        src="/samples/figma-onboarding.png"
        aspect={3}
        shape="rect"
        label="Banner crop, 3:1"
        caption="Bright strip = the 3:1 banner"
        value={crop}
        onChange={setCrop}
      />
      <Slider
        label="Zoom"
        min={1}
        max={4}
        step={0.05}
        value={crop.zoom}
        onChange={(zoom) => setCrop({ ...crop, zoom })}
        formatValue={(value) => `${value.toFixed(2)}×`}
        endLabels={["1× · whole photo", "4× · a quarter of it"]}
      />
      <p className="text-body text-muted-foreground">
        Drag the strip to move it. Zoom in to make it smaller.
      </p>
    </div>
  )
}
