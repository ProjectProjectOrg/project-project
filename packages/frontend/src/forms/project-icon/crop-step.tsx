import { StepHeading } from "@/components/appearance/AppearanceCard"
import { Button } from "@/components/ui/button"
import { CropWindow } from "@/components/ui/crop-window"
import { Slider } from "@/components/ui/slider"
import { m } from "@/paraglide/messages"
import { cropSchema, stepValidator } from "./opts"
import type { IconForm } from "./index"

export function CropStep({
  form,
  src,
  onAdvance
}: {
  form: IconForm
  src: string
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
          className="flex flex-col gap-3 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void group.handleSubmit()
          }}
        >
          <StepHeading current={2} total={3}>
            {m.project_icon_step_crop_heading()}
          </StepHeading>

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
                  valuePosition="top"
                  endLabels={[
                    m.project_icon_crop_zoom_min(),
                    m.project_icon_crop_zoom_max()
                  ]}
                />
                <p className="text-[13px] text-muted-foreground">
                  {m.project_icon_crop_hint()}
                </p>
              </>
            )}
          </group.Subscribe>

          <Button type="submit" size="sm" className="self-start">
            {m.project_appearance_continue()}
          </Button>
        </form>
      )}
    </form.FormGroup>
  )
}
