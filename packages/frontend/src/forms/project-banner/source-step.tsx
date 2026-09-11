import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useAtomValue } from "@effect/atom-react"
import { Link } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { Database, Upload } from "lucide-react"
import { orgStorageAtom } from "@/atoms/storage"
import { SegmentedTabs, SEGMENTED_ITEM_CLASS } from "@/components/SegmentedTabs"
import { StepHeading } from "@/components/appearance/AppearanceCard"
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
  rejected
}: {
  form: BannerForm
  orgSlug: string
  onAdvance: () => void
  onPickFile: (file: File) => void
  rejected: boolean
}) {
  const storage = useAtomValue(orgStorageAtom(orgSlug))
  const storageAvailable =
    AsyncResult.isSuccess(storage) && storage.value.status === "active"
  const storageKnown = AsyncResult.isSuccess(storage)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <form.FormGroup
      name="source"
      validators={[bannerStepValidator(bannerSourceSchema)]}
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
          <StepHeading current={1} total={2}>
            {m.project_banner_step_source_heading()}
          </StepHeading>

          <group.Field name="kind">
            {(field) => (
              <SegmentedTabs
                variant="inline"
                className="self-start"
                items={[
                  { key: "artwork", label: m.project_banner_tab_artwork() },
                  { key: "upload", label: m.project_banner_tab_upload() }
                ]}
                isActive={(key) =>
                  key === (field.value === "none" ? "artwork" : field.value)
                }
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
                storageKnown && !storageAvailable ? (
                  <div className="flex gap-3 rounded-md bg-muted p-3">
                    <Database
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                    <div className="flex flex-col items-start gap-2">
                      <span className="text-[13px] font-medium">
                        {m.project_banner_settings_storage_required()}
                      </span>
                      <Button
                        variant="tertiary"
                        size="sm"
                        render={
                          <Link
                            to="/orgs/$orgSlug/settings/storage"
                            params={{ orgSlug }}
                          />
                        }
                      >
                        {m.project_icon_storage_action()}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragging(false)
                      const file = event.dataTransfer.files[0]
                      if (file) onPickFile(file)
                    }}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border border-dashed px-4 py-8",
                      "transition-all duration-100 active:scale-[0.97]",
                      dragging
                        ? "border-ring bg-accent/60"
                        : "border-border hover:bg-accent/40"
                    )}
                  >
                    <Upload
                      className="mb-1 size-4 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                    <span className="text-[13px] font-medium">
                      {m.project_icon_dropzone_title()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {m.project_icon_dropzone_hint()}
                    </span>
                  </button>
                )
              ) : (
                <div
                  role="group"
                  aria-label={m.project_banner_templates_heading()}
                  className="grid grid-cols-2 gap-2.5"
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
                        onAdvance()
                      }}
                      className="flex flex-col gap-1.5 text-left outline-none transition-transform duration-100 active:scale-[0.97]"
                    >
                      <span
                        className={cn(
                          "block aspect-[3/1] w-full overflow-hidden rounded-md transition-shadow",
                          source.preset === entry.id
                            ? "ring-2 ring-foreground"
                            : "ring-1 ring-border"
                        )}
                      >
                        <img
                          src={entry.thumbSrc}
                          alt=""
                          loading="lazy"
                          decoding="async"
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
            <p role="alert" className="text-[13px] text-destructive">
              {m.project_banner_settings_load_error()}
            </p>
          ) : null}

          <Button type="submit" size="sm" className="self-start">
            {m.project_appearance_continue()}
          </Button>

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
