import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useAtomValue } from "@effect/atom-react"
import { Link } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { Database, Upload } from "lucide-react"
import { orgStorageAtom } from "@/atoms/storage"
import { SegmentedTabs, SEGMENTED_ITEM_CLASS } from "@/components/SegmentedTabs"
import { StepHeading } from "@/components/appearance/AppearanceCard"
import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch
} from "@/components/ui/emoji-picker"
import { CUTOUT_DEFAULT_TOLERANCE } from "@/lib/iconCutout"
import { m } from "@/paraglide/messages"
import { sourceSchema, stepValidator } from "./opts"
import type { IconDraft } from "./useIconDraft"
import type { IconForm } from "./index"

export function SourceStep({
  form,
  draft,
  orgSlug,
  busy,
  error,
  onAdvance
}: {
  form: IconForm
  draft: IconDraft
  orgSlug: string
  busy: boolean
  error: boolean
  onAdvance: () => void
}) {
  const storage = useAtomValue(orgStorageAtom(orgSlug))
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const take = async (file: File) => {
    const url = await draft.accept(file)
    if (!url) return false
    form.setFieldValue("source.objectUrl", url)
    form.setFieldValue("crop", { x: 0.5, y: 0.5, zoom: 1 })
    form.setFieldValue("treatment", {
      kind: "sticker",
      tolerance: CUTOUT_DEFAULT_TOLERANCE
    })
    return true
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

            <group.Field name="kind">
              {(field) => (
                <SegmentedTabs
                  variant="inline"
                  className="self-start"
                  items={[
                    { key: "emoji", label: m.project_icon_source_emoji_tab() },
                    { key: "image", label: m.project_icon_source_image_tab() }
                  ]}
                  isActive={(key) => key === field.value}
                  renderItem={(item, content, { active }) => (
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        field.handleChange(
                          item.key === "image" ? "image" : "emoji"
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

            <group.Subscribe selector={(state) => state.values.kind}>
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
                        <EmojiPickerContent />
                      </EmojiPicker>
                    )}
                  </group.Field>
                ) : (
                  AsyncResult.matchWithError(storage, {
                    onInitial: () => (
                      <div
                        aria-busy="true"
                        className="h-32 animate-pulse rounded-md bg-muted"
                      />
                    ),
                    onError: (error) => <ErrorPage error={error} contained />,
                    onDefect: (defect) => (
                      <ErrorPage error={defect} contained />
                    ),
                    onSuccess: ({ value }) =>
                      value.status !== "active" ? (
                        <div className="flex gap-3 rounded-md bg-muted p-3">
                          <Database
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            strokeWidth={1.75}
                          />
                          <div className="flex flex-col items-start gap-2">
                            <span className="text-[13px] font-medium">
                              {m.project_icon_storage_title()}
                            </span>
                            <span className="text-[13px] text-muted-foreground">
                              {m.project_icon_storage_body()}
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
                        <Button
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
                            if (file)
                              void take(file).then((accepted) => {
                                if (accepted) void group.handleSubmit()
                              })
                          }}
                          variant="dropzone"
                          size="dropzone"
                          data-dragging={dragging}
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
                        </Button>
                      )
                  })
                )
              }
            </group.Subscribe>

            <group.Subscribe selector={(state) => state.values.emoji}>
              {(emoji) => (
                <div className="flex items-start gap-2.5 rounded-md bg-muted p-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-[6px] corner-squircle bg-background text-[13px] leading-none">
                    {emoji}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {m.project_icon_emoji_fallback_hint()}
                  </span>
                </div>
              )}
            </group.Subscribe>

            {error ? (
              <p role="alert" className="text-[13px] text-destructive">
                {m.project_identity_error()}
              </p>
            ) : null}

            <group.Subscribe selector={(state) => state.values}>
              {(source) =>
                source.kind === "image" && source.objectUrl ? (
                  <Button type="submit" size="sm" className="self-start">
                    {m.project_appearance_continue()}
                  </Button>
                ) : null
              }
            </group.Subscribe>

            <input
              ref={fileRef}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file)
                  void take(file).then((accepted) => {
                    if (accepted) void group.handleSubmit()
                  })
              }}
            />
          </fieldset>
        </form>
      )}
    </form.FormGroup>
  )
}
