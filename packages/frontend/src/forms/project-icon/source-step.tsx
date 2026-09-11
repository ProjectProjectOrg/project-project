import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useAtomValue } from "@effect/atom-react"
import { Link } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { Database, Upload } from "lucide-react"
import { orgStorageAtom } from "@/atoms/storage"
import { SegmentedTabs, SEGMENTED_ITEM_CLASS } from "@/components/SegmentedTabs"
import { StepHeading } from "@/components/appearance/AppearanceCard"
import { Button } from "@/components/ui/button"
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch
} from "@/components/ui/emoji-picker"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { sourceSchema, stepValidator } from "./opts"
import type { IconDraft } from "./useIconDraft"
import type { IconForm } from "./index"

export function SourceStep({
  form,
  draft,
  orgSlug,
  onAdvance
}: {
  form: IconForm
  draft: IconDraft
  orgSlug: string
  onAdvance: () => void
}) {
  const storage = useAtomValue(orgStorageAtom(orgSlug))
  const storageAvailable =
    AsyncResult.isSuccess(storage) && storage.value.status === "active"
  const storageKnown = AsyncResult.isSuccess(storage)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const take = async (file: File) => {
    const url = await draft.accept(file)
    if (!url) return
    form.setFieldValue("source.objectUrl", url)
    form.resetField("crop")
    form.resetField("treatment")
    onAdvance()
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
                      className="h-[280px] w-full rounded-md border border-border"
                      onEmojiSelect={({ emoji }) => {
                        field.handleChange(emoji)
                        onAdvance()
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
              ) : storageKnown && !storageAvailable ? (
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
                    if (file) void take(file)
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

          {draft.rejected ? (
            <p role="alert" className="text-[13px] text-destructive">
              {m.project_icon_file_rejected()}
            </p>
          ) : null}

          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void take(file)
            }}
          />
        </form>
      )}
    </form.FormGroup>
  )
}
