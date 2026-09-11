import { SegmentedTabs, SEGMENTED_ITEM_CLASS } from "@/components/SegmentedTabs"
import { IconPreviewTile } from "@/components/appearance/IconPreviewTile"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { CUTOUT_MAX_TOLERANCE } from "@/lib/iconCutout"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { stepValidator, treatmentSchema } from "./opts"
import type { IconDraft } from "./useIconDraft"
import type { IconForm } from "./index"

export function TreatmentStep({
  form,
  draft,
  busy,
  error,
  onBack
}: {
  form: IconForm
  draft: IconDraft
  busy: boolean
  error: boolean
  onBack: () => void
}) {
  const preview = draft.preview

  return (
    <form.FormGroup
      name="treatment"
      validators={[stepValidator(treatmentSchema)]}
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
          {preview ? (
            <IconPreviewTile
              live={{
                src: preview.url,
                crop: form.state.values.crop,
                treatment: preview.treatment
              }}
              size={64}
              radius={16}
            />
          ) : null}

          <group.Field name="kind">
            {(field) => (
              <SegmentedTabs
                variant="inline"
                items={[
                  { key: "sticker", label: m.project_icon_treatment_sticker() },
                  {
                    key: "full_bleed",
                    label: m.project_icon_treatment_full_bleed()
                  }
                ]}
                isActive={(key) => key === field.value}
                renderItem={(item, content, { active }) => (
                  <button
                    type="button"
                    aria-pressed={active}
                    disabled={
                      item.key === "sticker" && preview?.clean === false
                    }
                    onClick={() => {
                      const kind =
                        item.key === "full_bleed" ? "full_bleed" : "sticker"
                      field.handleChange(kind)
                      void draft.restyle(
                        kind,
                        form.state.values.treatment.tolerance
                      )
                    }}
                    className={cn(
                      SEGMENTED_ITEM_CLASS(active, "inline"),
                      "disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    {content}
                  </button>
                )}
              />
            )}
          </group.Field>

          {preview && !preview.clean ? (
            <p className="text-xs text-muted-foreground">
              {m.project_icon_cutout_rejected()}
            </p>
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
                  onChange={(tolerance) => {
                    form.setFieldValue(
                      "treatment.tolerance",
                      tolerance as number
                    )
                    void draft.restyle(treatment.kind, tolerance as number)
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
            <p role="alert" className="text-xs text-destructive">
              {m.project_identity_error()}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              {m.project_icon_back()}
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
