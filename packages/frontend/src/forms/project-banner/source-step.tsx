import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useAtomValue } from "@effect/atom-react"
import { useRef } from "react"
import { Trash2, Upload } from "lucide-react"
import { orgStorageAtom } from "@/atoms/storage"
import { SegmentedTabs, SEGMENTED_ITEM_CLASS } from "@/components/SegmentedTabs"
import { bannerPresets } from "@/components/project-banner-presets"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { bannerSourceSchema, bannerStepValidator } from "./opts"
import type { BannerForm } from "./index"

export function BannerSourceStep({
  form,
  orgSlug,
  onAdvance,
  onPickFile,
  onRemove,
  rejected
}: {
  form: BannerForm
  orgSlug: string
  onAdvance: () => void
  onPickFile: (file: File) => void
  onRemove: () => void
  rejected: boolean
}) {
  const storage = useAtomValue(orgStorageAtom(orgSlug))
  const storageAvailable =
    AsyncResult.isSuccess(storage) && storage.value.status === "active"
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <form.FormGroup
      name="source"
      validators={[bannerStepValidator(bannerSourceSchema)]}
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
          <group.Field name="kind">
            {(field) => (
              <SegmentedTabs
                variant="inline"
                items={[
                  { key: "artwork", label: m.project_banner_tab_artwork() },
                  { key: "upload", label: m.project_banner_tab_upload() }
                ]}
                isActive={(key) => key === field.value}
                renderItem={(item, content, { active }) => (
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      field.handleChange(
                        item.key === "upload" ? "upload" : "artwork"
                      )
                    }
                    className={SEGMENTED_ITEM_CLASS(active, "inline")}
                  >
                    {content}
                  </button>
                )}
              />
            )}
          </group.Field>

          <group.Subscribe selector={(state) => state.values}>
            {(source) =>
              source.kind === "upload" ? (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    leadingIcon={Upload}
                    disabled={!storageAvailable}
                    onClick={() => fileRef.current?.click()}
                  >
                    {m.project_banner_settings_upload()}
                  </Button>
                  {AsyncResult.isSuccess(storage) && !storageAvailable ? (
                    <p className="text-xs text-muted-foreground">
                      {m.project_banner_settings_storage_required()}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div
                  role="group"
                  aria-label={m.project_banner_templates_heading()}
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                >
                  {bannerPresets.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={source.preset === entry.id}
                      onClick={() => {
                        form.setFieldValue("source.kind", "artwork")
                        form.setFieldValue("source.preset", entry.id)
                        form.setFieldValue("source.src", entry.src)
                        form.setFieldValue("crop.x", entry.x)
                        form.setFieldValue("crop.y", entry.y)
                        form.setFieldValue("crop.zoom", 1)
                      }}
                      className="group/reveal flex flex-col gap-1.5 text-left outline-none"
                    >
                      <span
                        className={cn(
                          "block aspect-[3/1] w-full overflow-hidden rounded-lg ring-1 transition-[box-shadow]",
                          source.preset === entry.id
                            ? "ring-2 ring-foreground"
                            : "ring-border/60"
                        )}
                      >
                        <img
                          src={entry.src}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                          style={{
                            objectPosition: `${entry.x * 100}% ${entry.y * 100}%`
                          }}
                        />
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {entry.label()}
                      </span>
                    </button>
                  ))}
                </div>
              )
            }
          </group.Subscribe>

          {rejected ? (
            <p role="alert" className="text-xs text-destructive">
              {m.project_banner_settings_load_error()}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={m.project_banner_settings_remove()}
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
            <Button type="submit" size="sm">
              {m.project_icon_next()}
            </Button>
          </div>

          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) onPickFile(file)
            }}
          />
        </form>
      )}
    </form.FormGroup>
  )
}
