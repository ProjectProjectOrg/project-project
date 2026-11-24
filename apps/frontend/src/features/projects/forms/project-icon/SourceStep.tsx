import { useAtomValue } from "@effect/atom-react"
import { Button } from "@pp/ui/button"
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch
} from "@pp/ui/emoji-picker"
import { Database } from "@pp/ui/icons"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import { Link } from "@tanstack/react-router"
import * as Predicate from "effect/Predicate"

import { AsyncView } from "@/components/shell/AsyncView"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import { StepHeading } from "@/features/projects/components/appearance/AppearanceCard"
import { ProjectImagePicker } from "@/features/projects/components/appearance/ProjectImagePicker"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { CUTOUT_DEFAULT_TOLERANCE } from "@/features/projects/lib/iconCutout"
import { m } from "@/paraglide/messages"

import type { IconForm } from "./index"
import { sourceSchema, stepValidator } from "./opts"
import type { IconDraft } from "./useIconDraft"

export function SourceStep({
  form,
  draft,

  busy,
  error,
  onAdvance
}: {
  form: IconForm
  draft: IconDraft
  busy: boolean
  error: boolean
  onAdvance: () => void
}) {
  const { orgSlug } = useProjectRoute()
  const storage = useAtomValue(orgStorage(storageRequest(orgSlug)))

  const take = async (file: File, advance: () => void) => {
    const accepted = await draft.accept(file)
    if (!accepted) return
    form.setFieldValue("source.objectUrl", accepted.url)
    form.setFieldValue("crop", { x: 0.5, y: 0.5, zoom: 1 })
    form.setFieldValue("treatment", {
      kind: accepted.treatment,
      tolerance: CUTOUT_DEFAULT_TOLERANCE
    })
    advance()
  }

  return (
    <form.FormGroup
      name="source"
      validators={[stepValidator(sourceSchema)]}
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
          <fieldset disabled={busy} className="contents">
            <StepHeading current={1} total={3} shareId="icon-source">
              {m.project_icon_step_source_heading()}
            </StepHeading>

            <group.Field name="_tag">
              {(field) => (
                <SegmentedTabs
                  variant="inline"
                  className="self-start"
                  items={[
                    { key: "emoji", label: m.project_icon_source_emoji_tab() },
                    { key: "image", label: m.project_icon_source_image_tab() }
                  ]}
                  value={field.value}
                  onValueChange={field.handleChange}
                />
              )}
            </group.Field>

            <group.Subscribe selector={(state) => state.values._tag}>
              {(kind) =>
                kind === "emoji" ? (
                  <group.Field name="emoji">
                    {(field) => (
                      <EmojiPicker
                        variant="embedded"
                        onEmojiSelect={({ emoji }) => {
                          field.handleChange(emoji)
                          void group.handleSubmit()
                        }}
                      >
                        <EmojiPickerSearch
                          placeholder={m.project_identity_emoji_search_placeholder()}
                          aria-label={m.project_identity_emoji_aria_label()}
                        />
                        <EmojiPickerContent
                          emptyLabel={m.project_identity_emoji_empty()}
                        />
                      </EmojiPicker>
                    )}
                  </group.Field>
                ) : (
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
                              {m.project_icon_storage_title()}
                            </span>
                            <span className="text-body text-muted-foreground">
                              {m.project_icon_storage_body()}
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
                          accept="image/png,image/jpeg,image/webp,image/avif"
                          onPick={(file) =>
                            void take(file, () => void group.handleSubmit())
                          }
                        />
                      )
                    }
                  />
                )
              }
            </group.Subscribe>

            <group.Subscribe selector={(state) => state.values.emoji}>
              {(emoji) => (
                <div className="flex items-start gap-2.5 rounded-md surface-muted p-2.5">
                  {/* oxlint-disable-next-line shadcn/no-arbitrary-values -- a 24px emoji tile, squircled to read as an icon */}
                  <span className="grid size-6 shrink-0 place-items-center rounded-[6px] surface-background text-body leading-none corner-squircle">
                    {emoji}
                  </span>
                  <span className="text-body text-muted-foreground">
                    {m.project_icon_emoji_fallback_hint()}
                  </span>
                </div>
              )}
            </group.Subscribe>

            {error ? (
              <p role="alert" className="text-body text-destructive">
                {m.project_identity_error()}
              </p>
            ) : null}

            <group.Subscribe selector={(state) => state.values}>
              {(source) =>
                Predicate.isTagged(source, "image") && source.objectUrl ? (
                  <Button type="submit" size="sm" className="self-start">
                    {m.project_appearance_continue()}
                  </Button>
                ) : null
              }
            </group.Subscribe>
          </fieldset>
        </form>
      )}
    </form.FormGroup>
  )
}
