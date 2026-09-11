import { Button } from "@/components/ui/button"
import { CropWindow } from "@/components/ui/crop-window"
import { Slider } from "@/components/ui/slider"
import { m } from "@/paraglide/messages"
import { cropSchema, stepValidator } from "./opts"
import type { IconForm } from "./index"

export function CropStep({
  form,
  src,
  onBack,
  onAdvance
}: {
  form: IconForm
  src: string
  onBack: () => void
  onAdvance: () => void
}) {
  return (
    <form.FormGroup
      name="crop"
      validators={[stepValidator(cropSchema)]}
      onSubmit={onAdvance}
    >
      {(group) => (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void group.handleSubmit()
          }}
        >
          <group.Subscribe selector={(state) => state.values}>
            {(crop) => (
              <>
                <CropWindow
                  src={src}
                  aspect={1}
                  shape="squircle"
                  label={m.project_icon_crop_label()}
                  caption={m.project_icon_crop_caption()}
                  value={crop}
                  onChange={(next) => {
                    form.setFieldValue("crop.x", next.x)
                    form.setFieldValue("crop.y", next.y)
                    form.setFieldValue("crop.zoom", next.zoom)
                  }}
                />
                <Slider
                  size="compact"
                  label={m.project_icon_crop_zoom()}
                  min={1}
                  max={4}
                  step={0.05}
                  value={crop.zoom}
                  onChange={(zoom) =>
                    form.setFieldValue("crop.zoom", zoom as number)
                  }
                  formatValue={(value) => `${value.toFixed(2)}×`}
                  endLabels={[
                    m.project_icon_crop_zoom_min(),
                    m.project_icon_crop_zoom_max()
                  ]}
                />
              </>
            )}
          </group.Subscribe>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              {m.project_icon_back()}
            </Button>
            <Button type="submit" size="sm">
              {m.project_icon_next()}
            </Button>
          </div>
        </form>
      )}
    </form.FormGroup>
  )
}
