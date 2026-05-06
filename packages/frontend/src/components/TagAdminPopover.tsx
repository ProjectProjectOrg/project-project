import { Trash2 } from "lucide-react"
import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ColorPicker } from "@/components/ColorPicker"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import {
  ConfirmButton,
  useConfirmButton
} from "@/components/ui/confirm-button"
import { Button } from "@/components/ui/button"
import type { Tag, TagName } from "@projectproject/shared"

const VALID = /^[a-z0-9][a-z0-9-]{0,30}$/
const FADE_TRANSITION = { duration: 0.15, ease: "easeOut" } as const

type Props = {
  tag: Tag
  usageCount: number
  onPatch: (patch: { nextName?: TagName; color?: Tag["color"] }) => void
  onDelete: () => Promise<void> | void
  children: React.ReactNode
}

export function TagAdminPopover({
  tag,
  usageCount,
  onPatch,
  onDelete,
  children
}: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-64 p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ConfirmButton.Root className="w-full">
          <Body
            tag={tag}
            usageCount={usageCount}
            onPatch={onPatch}
            onConfirmDelete={async () => {
              await onDelete()
              setOpen(false)
            }}
            onDismiss={() => setOpen(false)}
          />
        </ConfirmButton.Root>
      </PopoverContent>
    </Popover>
  )
}

function Body({
  tag,
  usageCount,
  onPatch,
  onConfirmDelete,
  onDismiss
}: {
  tag: Tag
  usageCount: number
  onPatch: (patch: { nextName?: TagName; color?: Tag["color"] }) => void
  onConfirmDelete: () => Promise<void>
  onDismiss: () => void
}) {
  const { state } = useConfirmButton()
  return (
    <div className="w-full">
      <AnimatePresence initial={false} mode="popLayout">
        {state === "idle" ? (
          <motion.div
            key="editor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE_TRANSITION}
          >
            <Editor
              tag={tag}
              usageCount={usageCount}
              onPatch={onPatch}
              onDismiss={onDismiss}
            />
          </motion.div>
        ) : (
          <motion.div
            key="confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE_TRANSITION}
          >
            <Confirm
              tag={tag}
              usageCount={usageCount}
              onConfirm={onConfirmDelete}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Editor({
  tag,
  usageCount,
  onPatch,
  onDismiss
}: {
  tag: Tag
  usageCount: number
  onPatch: (patch: { nextName?: TagName; color?: Tag["color"] }) => void
  onDismiss: () => void
}) {
  const { open: openConfirm } = useConfirmButton()
  const [draftName, setDraftName] = useState<string>(tag.name)

  const commit = () => {
    const trimmed = draftName.trim()
    if (trimmed === tag.name || !VALID.test(trimmed)) return
    onPatch({ nextName: trimmed as TagName })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <ColorPicker
          value={tag.color}
          onChange={(hex) => onPatch({ color: hex as Tag["color"] })}
          ariaLabel={`Color for ${tag.name}`}
        />
        <input
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
          aria-label="Tag name"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 text-xs outline-none focus-visible:border-foreground/40"
        />
        <button
          type="button"
          onClick={openConfirm}
          aria-label="Delete tag"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
      <p className="px-0.5 text-[11px] text-muted-foreground">
        Applied to {usageCount} ticket{usageCount === 1 ? "" : "s"}
      </p>
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
    <div className="flex flex-col gap-2 text-xs">
      <p>
        Delete <strong>{tag.name}</strong> permanently? It will be removed
        from {usageCount} ticket{usageCount === 1 ? "" : "s"} and the tag
        will no longer exist on this project.
      </p>
      <div className="flex gap-1">
        <Button
          size="sm"
          onClick={() => void run()}
          disabled={busy}
          className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {busy ? "Deleting…" : "Delete tag"}
        </Button>
        <Button size="sm" variant="ghost" onClick={close} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
