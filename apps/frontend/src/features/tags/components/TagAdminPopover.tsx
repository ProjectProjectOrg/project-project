import { TagColor, TagName, type Tag } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { ColorPicker } from "@pp/ui/color-picker"
import { ConfirmButton, useConfirmButton } from "@pp/ui/confirm-button"
import { Trash2 } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { transitions } from "@pp/ui/lib/springs"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import * as Schema from "effect/Schema"
import { m as motion } from "motion/react"
import { useState, type ReactElement } from "react"

import { m } from "@/paraglide/messages"

const VALID = /^[a-z0-9][a-z0-9 -]{0,30}$/
const makeTagName = Schema.decodeUnknownSync(TagName)
const makeTagColor = Schema.decodeUnknownSync(TagColor)

type Props = {
  tag: Tag
  usageCount: number
  updateError: string | null
  onPatch: (patch: { nextName?: TagName; color?: Tag["color"] }) => void
  onDelete: () => Promise<void> | void
  onOpenChange?: (open: boolean) => void
  children: ReactElement<Record<string, unknown>>
}

export function TagAdminPopover({
  tag,
  usageCount,
  updateError,
  onPatch,
  onDelete,
  onOpenChange,
  children
}: Props) {
  const [open, setOpen] = useState(false)
  const changeOpen = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger render={children} />
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-64 p-2"
        initialFocus={true}
      >
        <ConfirmButton.Root className="w-full">
          <Body
            tag={tag}
            usageCount={usageCount}
            updateError={updateError}
            onPatch={onPatch}
            onConfirmDelete={async () => {
              await onDelete()
              changeOpen(false)
            }}
            onDismiss={() => changeOpen(false)}
          />
        </ConfirmButton.Root>
      </PopoverContent>
    </Popover>
  )
}

function Body({
  tag,
  usageCount,
  updateError,
  onPatch,
  onConfirmDelete,
  onDismiss
}: {
  tag: Tag
  usageCount: number
  updateError: string | null
  onPatch: (patch: { nextName?: TagName; color?: Tag["color"] }) => void
  onConfirmDelete: () => Promise<void>
  onDismiss: () => void
}) {
  const { state } = useConfirmButton()
  return (
    <div className="w-full">
      <motion.div
        key={state}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={transitions.fade}
      >
        {state === "idle" ? (
          <Editor
            tag={tag}
            usageCount={usageCount}
            error={updateError}
            onPatch={onPatch}
            onDismiss={onDismiss}
          />
        ) : (
          <Confirm
            tag={tag}
            usageCount={usageCount}
            onConfirm={onConfirmDelete}
          />
        )}
      </motion.div>
    </div>
  )
}

function Editor({
  tag,
  usageCount,
  error,
  onPatch,
  onDismiss
}: {
  tag: Tag
  usageCount: number
  error: string | null
  onPatch: (patch: { nextName?: TagName; color?: Tag["color"] }) => void
  onDismiss: () => void
}) {
  const { open: openConfirm } = useConfirmButton()
  const [draftName, setDraftName] = useState<string>(tag.name)

  const trimmed = draftName.trim()
  const invalid = trimmed.length > 0 && !VALID.test(trimmed)

  const commit = () => {
    if (trimmed === tag.name || invalid || trimmed.length === 0) return
    onPatch({ nextName: makeTagName(trimmed) })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <ColorPicker
          swatchLabel={(hex) => m.color_swatch_aria_label({ hex })}
          value={tag.color}
          onChange={(hex) => onPatch({ color: makeTagColor(hex) })}
          ariaLabel={m.tags_color_aria_label({ name: tag.name })}
        />
        <Input
          size="sm"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value.toLowerCase())}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            }
            if (e.key === "Escape") {
              setDraftName(tag.name)
              onDismiss()
            }
          }}
          aria-label={m.tags_name_aria_label()}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "tag-rename-error" : undefined}
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="square-7"
          onClick={() => openConfirm()}
          aria-label={m.tags_delete_button()}
          tone="destructive"
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </Button>
      </div>
      {invalid ? (
        <p
          id="tag-rename-error"
          className="px-0.5 text-micro leading-tight text-destructive"
        >
          {m.tags_name_validation_hint()}
        </p>
      ) : error ? (
        <p
          role="alert"
          className="px-0.5 text-micro leading-tight text-destructive"
        >
          {error}
        </p>
      ) : (
        <p className="px-0.5 text-micro text-muted-foreground">
          {usageCount === 1
            ? m.tags_usage_one()
            : m.tags_usage_many({ count: usageCount })}
        </p>
      )}
    </div>
  )
}

function Confirm({
  tag,
  usageCount,
  onConfirm
}: {
  tag: Tag
  usageCount: number
  onConfirm: () => Promise<void>
}) {
  const { close, busy, setBusy } = useConfirmButton()
  const run = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } catch {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 text-caption">
      <p>
        {usageCount === 1
          ? m.tags_delete_confirm_one({ name: tag.name })
          : m.tags_delete_confirm_many({
              name: tag.name,
              count: usageCount
            })}
      </p>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="destructive"
          onClick={() => void run()}
          disabled={busy}
          className="flex-1"
        >
          {busy ? m.tags_delete_in_progress() : m.tags_delete_button()}
        </Button>
        <Button size="sm" variant="ghost" onClick={close} disabled={busy}>
          {m.common_cancel_button()}
        </Button>
      </div>
    </div>
  )
}
