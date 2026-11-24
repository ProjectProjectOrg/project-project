import { useAtomValue } from "@effect/atom-react"
import { Button } from "@pp/ui/button"
import { Database } from "@pp/ui/icons"
import { transitions } from "@pp/ui/lib/springs"
import { cn } from "@pp/ui/lib/utils"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import { Link } from "@tanstack/react-router"
import { m as motion, useReducedMotion } from "motion/react"

import { AsyncView } from "@/components/shell/AsyncView"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import { StepHeading } from "@/features/projects/components/appearance/AppearanceCard"
import { ProjectImagePicker } from "@/features/projects/components/appearance/ProjectImagePicker"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { bannerPresets } from "@/features/projects/lib/bannerPresets"
import { m } from "@/paraglide/messages"

import type { BannerForm } from "./index"
import { bannerSourceSchema, bannerStepValidator } from "./opts"

export function BannerSourceStep({
  form,

  onAdvance,
  onPickFile,
  onPickPreset,
  rejected
}: {
  form: BannerForm
  onAdvance: () => void
  onPickFile: (file: File) => boolean
  onPickPreset: () => void
  rejected: boolean
}) {
  const { orgSlug } = useProjectRoute()
  const storage = useAtomValue(orgStorage(storageRequest(orgSlug)))
  const reduce = useReducedMotion() ?? false
  const shared = reduce ? { duration: 0 } : transitions.morph

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
          <StepHeading current={1} total={2} shareId="banner-source">
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
                value={field.value === "none" ? "artwork" : field.value}
                onValueChange={field.handleChange}
              />
            )}
          </group.Field>

          <group.Subscribe selector={(state) => state.values}>
            {(source) =>
              source.kind === "upload" ? (
                <AsyncView
                  result={storage}
                  contained
                  onInitial={() => (
                    <div
                      aria-busy="true"
                      className="h-32 animate-pulse rounded-md bg-muted"
                    />
                  )}
                  onSuccess={({ value }) =>
                    value.status !== "active" ? (
                      <div className="flex gap-3 rounded-md surface-muted p-3">
                        <Database
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          strokeWidth={1.75}
                        />
                        <div className="flex flex-col items-start gap-2">
                          <span className="text-body font-semibold">
                            {m.project_banner_settings_storage_required()}
                          </span>
                          <Button
                            variant="tertiary"
                            size="sm"
                            render={
                              <Link
                                to="/settings/orgs/$orgSlug/integrations/storage"
                                params={{ orgSlug }}
                              />
                            }
                          >
                            {m.project_icon_storage_action()}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <ProjectImagePicker
                        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                        onPick={(file) => {
                          if (onPickFile(file)) void group.handleSubmit()
                        }}
                      />
                    )
                  }
                />
              ) : (
                <div
                  role="group"
                  aria-label={m.project_banner_templates_heading()}
                  className="grid grid-cols-2 gap-2.5"
                >
                  {bannerPresets.map((entry) => (
                    <Button
                      key={entry.id}
                      type="button"
                      aria-pressed={source.preset === entry.id}
                      onClick={() => {
                        onPickPreset()
                        form.setFieldValue("source.kind", "artwork")
                        form.setFieldValue("source.preset", entry.id)
                        form.setFieldValue("source.src", entry.src)
                        form.setFieldValue("crop.x", entry.x)
                        form.setFieldValue("crop.y", entry.y)
                        form.setFieldValue("crop.zoom", 1)
                        void group.handleSubmit()
                      }}
                      variant="artwork-option"
                      size="artwork-option"
                    >
                      <motion.span
                        layoutId={`banner-preset-${entry.id}`}
                        transition={shared}
                        className={cn(
                          "block aspect-[3/1] w-full overflow-hidden rounded-md transition-shadow",
                          source.preset === entry.id
                            ? "ring-2 ring-foreground"
                            : "ring-1 ring-border group-hover/reveal:ring-ring"
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
                      </motion.span>
                      <span className="truncate text-caption text-muted-foreground">
                        {entry.label()}
                      </span>
                    </Button>
                  ))}
                </div>
              )
            }
          </group.Subscribe>

          {rejected ? (
            <p role="alert" className="text-body text-destructive">
              {m.project_banner_settings_load_error()}
            </p>
          ) : null}

          <Button type="submit" size="sm" className="self-start">
            {m.project_appearance_continue()}
          </Button>
        </form>
      )}
    </form.FormGroup>
  )
}
