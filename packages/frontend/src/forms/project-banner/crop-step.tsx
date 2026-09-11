import { Button } from "@/components/ui/button"
import { CropWindow } from "@/components/ui/crop-window"
import { Slider } from "@/components/ui/slider"
import { m } from "@/paraglide/messages"
import { bannerCropSchema, bannerStepValidator } from "./opts"
import type { BannerForm } from "./index"

export function BannerCropStep({
  form,
  src,
  busy,
  error,
  onBack
}: {
  form: BannerForm
  src: string
  busy: boolean
  error: boolean
  onBack: () => void
}) {
  return (
    <form.FormGroup
      name="crop"
      validators={[bannerStepValidator(bannerCropSchema)]}
      onSubmit={() => void form.handleSubmit()}
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
                  aspect={3}
                  shape="rect"
                  label={m.project_banner_settings_crop()}
                  caption={m.project_banner_crop_caption()}
                  value={crop}
                  onChange={(next) => {
                    form.setFieldValue("crop.x", next.x)
                    form.setFieldValue("crop.y", next.y)
                    form.setFieldValue("crop.zoom", next.zoom)
                  }}
                />
                <Slider
                  size="compact"
                  label={m.project_banner_settings_zoom()}
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

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {m.project_banner_settings_save_error()}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              {m.project_icon_back()}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {m.project_banner_settings_apply()}
            </Button>
          </div>
        </form>
      )}
    </form.FormGroup>
  )
}
