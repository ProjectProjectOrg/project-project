import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useAtomValue } from "@effect/atom-react"
import { useRef } from "react"
import { orgStorageAtom } from "@/atoms/storage"
import { SegmentedTabs, SEGMENTED_ITEM_CLASS } from "@/components/SegmentedTabs"
import { Button } from "@/components/ui/button"
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch
} from "@/components/ui/emoji-picker"
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
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <form.FormGroup
      name="source"
      validators={[stepValidator(sourceSchema)]}
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
                      className="h-[280px] rounded-lg border border-border"
                      onEmojiSelect={({ emoji }) => field.handleChange(emoji)}
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
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    disabled={!storageAvailable}
                    onClick={() => fileRef.current?.click()}
                  >
                    {m.project_icon_dropzone_prompt()}
                  </Button>
                  {AsyncResult.isSuccess(storage) && !storageAvailable ? (
                    <p className="text-xs text-muted-foreground">
                      {m.project_icon_storage_required()}
                    </p>
                  ) : null}
                </div>
              )
            }
          </group.Subscribe>

          <p className="text-xs text-muted-foreground">
            {m.project_icon_emoji_fallback_hint()}
          </p>

          {draft.rejected ? (
            <p role="alert" className="text-xs text-destructive">
              {m.project_icon_file_rejected()}
            </p>
          ) : null}

          <Button type="submit" size="sm" className="self-start">
            {m.project_icon_next()}
          </Button>

          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (!file) return
              const url = await draft.accept(file)
              if (!url) return
              form.setFieldValue("source.objectUrl", url)
              form.resetField("crop")
              form.resetField("treatment")
            }}
          />
        </form>
      )}
    </form.FormGroup>
  )
}
