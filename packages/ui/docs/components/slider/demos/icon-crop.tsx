import { CropWindow } from "@pp/ui/crop-window"
import { Slider } from "@pp/ui/slider"
import { useState } from "react"

// The project icon's crop step: the crop window over the photo, the zoom
// slider under it, and the hint, as the app lays them out.
export default function IconCrop() {
  const [crop, setCrop] = useState({ x: 0.5, y: 0.4, zoom: 1.4 })
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CropWindow
        src="/samples/figma-onboarding.png"
        aspect={1}
        shape="squircle"
        label="Crop the icon"
        caption="Bright square = what the tile shows"
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
        Drag the square to move it. Zoom in to make it smaller.
      </p>
    </div>
  )
}
