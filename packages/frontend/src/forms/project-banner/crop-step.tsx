import { motion, useReducedMotion } from "motion/react"
import { StepHeading } from "@/components/appearance/AppearanceCard"
import { Button } from "@/components/ui/button"
import { CropWindow } from "@/components/ui/crop-window"
import { Slider } from "@/components/ui/slider"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"
import { bannerCropSchema, bannerStepValidator } from "./opts"
import type { BannerForm } from "./index"

export function BannerCropStep({
  form,
  src,
  busy,
  error,
  onRemove
}: {
  form: BannerForm
  src: string
  busy: boolean
  error: boolean
  onRemove: () => void
}) {
  const reduce = useReducedMotion() ?? false
  const shared = reduce ? { duration: 0 } : transitions.morph

  return (
    <form.FormGroup
      name="crop"
      validators={[bannerStepValidator(bannerCropSchema)]}
      onSubmit={() => void form.handleSubmit()}
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
          <StepHeading current={2} total={2}>
            {m.project_banner_step_crop_heading()}
          </StepHeading>

          <group.Subscribe selector={(state) => state.values}>
            {(crop) => (
              <>
                <motion.div layoutId="banner-result" transition={shared}>
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
                </motion.div>
                <Slider
                  size="compact"
                  label={m.project_banner_settings_zoom()}
                  min={1}
                  max={4}
                  step={0.05}
                  value={crop.zoom}
                  valuePosition="top"
                  onChange={(zoom) =>
                    form.setFieldValue("crop.zoom", zoom as number)
                  }
                  formatValue={(value) => `${value.toFixed(2)}×`}
                  endLabels={[
                    m.project_icon_crop_zoom_min(),
                    m.project_icon_crop_zoom_max()
                  ]}
                />
                <p className="text-[13px] text-muted-foreground">
                  {m.project_banner_crop_hint()}
                </p>
              </>
            )}
          </group.Subscribe>

          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {m.project_banner_settings_save_error()}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={busy}
            >
              {m.project_banner_remove()}
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
