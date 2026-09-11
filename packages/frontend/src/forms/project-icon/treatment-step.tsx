import { AlertCircle } from "lucide-react"
import type { ReactNode } from "react"
import { StepHeading } from "@/components/appearance/AppearanceCard"
import { IconPreviewTile } from "@/components/appearance/IconPreviewTile"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { CUTOUT_MAX_TOLERANCE } from "@/lib/iconCutout"
import type { IconTreatment } from "@/lib/iconDraft"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { stepValidator, treatmentSchema } from "./opts"
import type { IconDraft } from "./useIconDraft"
import type { IconForm } from "./index"

function TreatmentChoice({
  active,
  disabled,
  title,
  hint,
  preview,
  onSelect
}: {
  active: boolean
  disabled: boolean
  title: string
  hint: string
  preview: ReactNode
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex flex-1 items-center gap-2.5 rounded-md border p-2.5 text-left",
        "transition-all duration-100 active:scale-[0.97]",
        active ? "border-foreground" : "border-border hover:bg-accent/40",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      {preview}
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}

export function TreatmentStep({
  form,
  draft,
  busy,
  error,
  accent,
  onRemove,
  onChangePhoto
}: {
  form: IconForm
  draft: IconDraft
  busy: boolean
  error: boolean
  accent: string
  onRemove: () => void
  onChangePhoto: () => void
}) {
  const preview = draft.preview
  const src = preview?.url ?? form.state.values.source.objectUrl
  const failed = preview?.clean === false

  const tile = (treatment: IconTreatment) =>
    src ? (
      <IconPreviewTile
        live={{ src, crop: form.state.values.crop, treatment }}
        size={40}
        radius={12}
        background={treatment === "sticker" ? accent : undefined}
      />
    ) : null

  return (
    <form.FormGroup
      name="treatment"
      validators={[stepValidator(treatmentSchema)]}
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
          <StepHeading current={3} total={3}>
            {m.project_icon_step_treatment_heading()}
          </StepHeading>

          <group.Field name="kind">
            {(field) => (
              <div className="flex gap-2.5">
                <TreatmentChoice
                  active={field.value === "sticker"}
                  disabled={failed}
                  title={m.project_icon_treatment_sticker()}
                  hint={m.project_icon_treatment_sticker_hint()}
                  preview={tile("sticker")}
                  onSelect={() => {
                    field.handleChange("sticker")
                    void draft.restyle(
                      "sticker",
                      form.state.values.treatment.tolerance
                    )
                  }}
                />
                <TreatmentChoice
                  active={field.value === "full_bleed"}
                  disabled={false}
                  title={m.project_icon_treatment_full_bleed()}
                  hint={m.project_icon_treatment_full_bleed_hint()}
                  preview={tile("full_bleed")}
                  onSelect={() => {
                    field.handleChange("full_bleed")
                    void draft.restyle(
                      "full_bleed",
                      form.state.values.treatment.tolerance
                    )
                  }}
                />
              </div>
            )}
          </group.Field>

          {failed ? (
            <div
              role="alert"
              className="flex gap-2.5 rounded-md border border-destructive/30 bg-destructive-light p-3"
            >
              <AlertCircle
                className="mt-0.5 size-4 shrink-0 text-destructive"
                strokeWidth={1.75}
              />
              <div className="flex flex-col items-start gap-2">
                <span className="text-[13px] font-medium">
                  {m.project_icon_cutout_failed_title()}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {m.project_icon_cutout_failed_body()}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      form.setFieldValue("treatment.kind", "full_bleed")
                      void draft.restyle(
                        "full_bleed",
                        form.state.values.treatment.tolerance
                      )
                    }}
                  >
                    {m.project_icon_use_full_bleed()}
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    onClick={onChangePhoto}
                  >
                    {m.project_icon_change_photo()}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <group.Subscribe selector={(state) => state.values}>
            {(treatment) =>
              treatment.kind === "sticker" &&
              preview &&
              !preview.transparent ? (
                <Slider
                  size="compact"
                  label={m.project_icon_background_removal()}
                  min={0}
                  max={CUTOUT_MAX_TOLERANCE}
                  value={treatment.tolerance}
                  valuePosition="top"
                  onChange={(tolerance) => {
                    form.setFieldValue(
                      "treatment.tolerance",
                      tolerance as number
                    )
                    void draft.restyle("sticker", tolerance as number)
                  }}
                  endLabels={[
                    m.project_icon_background_removal_min(),
                    m.project_icon_background_removal_max()
                  ]}
                />
              ) : null
            }
          </group.Subscribe>

          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {m.project_identity_error()}
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
              {m.project_icon_remove_image()}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {m.project_icon_apply()}
            </Button>
          </div>
        </form>
      )}
    </form.FormGroup>
  )
}
