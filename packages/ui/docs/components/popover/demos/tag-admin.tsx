import { Badge } from "@pp/ui/badge"
import { Button } from "@pp/ui/button"
import { ColorPicker } from "@pp/ui/color-picker"
import { ConfirmButton, useConfirmButton } from "@pp/ui/confirm-button"
import { Trash2, X } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { transitions } from "@pp/ui/lib/springs"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import { TextSwap } from "@pp/ui/text-swap"
import { motion } from "motion/react"
import { useState } from "react"

const USER_TOGGLES = new Set(["trigger-press", "escape-key", "outside-press"])
const VALID = /^[a-z0-9][a-z0-9 -]{0,30}$/
const USAGE = 12

// Clicking an applied tag in the tag editor. The name is the badge's main
// button, so the whole badge hovers and presses with it, and a rename blurs
// into the new name once it commits. The popover recolours, renames, or
// deletes behind an in-place confirmation that swaps its content.
export default function TagAdmin() {
  const [open, setOpen] = useState(true)
  const [name, setName] = useState("frontend")
  const [color, setColor] = useState("#8b5cf6")

  return (
    <Badge tone={null} style={{ "--badge-tone": color }} className="gap-1.5">
      <Popover
        open={open}
        onOpenChange={(next, details) => {
          if (USER_TOGGLES.has(details.reason)) setOpen(next)
        }}
      >
        <PopoverTrigger
          render={<button type="button" aria-label={`Edit tag ${name}`} />}
        >
          <TextSwap>{name}</TextSwap>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-64 p-2">
          <ConfirmButton.Root className="w-full">
            <Body
              name={name}
              color={color}
              onRename={setName}
              onColor={setColor}
              onDelete={() => setOpen(false)}
              onDismiss={() => setOpen(false)}
            />
          </ConfirmButton.Root>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={`Remove tag ${name}`}
        className="focus-ring -mr-0.5 inline-grid size-4 place-items-center rounded-sm opacity-60 transition-[opacity,background-color] duration-100 hover:bg-black/15 hover:opacity-100 focus-visible:opacity-100 active:scale-[0.9] dark:hover:bg-white/20"
      >
        <X className="size-3" strokeWidth={2} />
      </button>
    </Badge>
  )
}

function Body({
  name,
  color,
  onRename,
  onColor,
  onDelete,
  onDismiss
}: Readonly<{
  name: string
  color: string
  onRename: (name: string) => void
  onColor: (hex: string) => void
  onDelete: () => void
  onDismiss: () => void
}>) {
  const { state, open: openConfirm, close } = useConfirmButton()
  const [draft, setDraft] = useState(name)
  const trimmed = draft.trim()
  const invalid = trimmed.length > 0 && !VALID.test(trimmed)
  const commit = () => {
    if (trimmed === name || invalid || trimmed.length === 0) return
    onRename(trimmed)
  }

  return (
    <motion.div
      key={state}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitions.fade}
    >
      {state === "idle" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <ColorPicker
              swatchLabel={(hex) => `Colour ${hex}`}
              value={color}
              onChange={onColor}
              ariaLabel={`Colour of ${name}`}
            />
            <Input
              size="sm"
              value={draft}
              onChange={(event) => setDraft(event.target.value.toLowerCase())}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  commit()
                }
                if (event.key === "Escape") {
                  setDraft(name)
                  onDismiss()
                }
              }}
              aria-label="Tag name"
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? "tag-admin-error" : undefined}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="square-7"
              aria-label="Delete tag"
              onClick={() => openConfirm()}
              className="not-disabled:hover:text-destructive"
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} />
            </Button>
          </div>
          {invalid ? (
            <p
              id="tag-admin-error"
              className="px-0.5 text-micro leading-tight text-destructive"
            >
              Use lowercase letters, digits, spaces or hyphens. Start with a
              letter or digit. Max 31 characters.
            </p>
          ) : (
            <p className="px-0.5 text-micro text-muted-foreground">
              Applied to {USAGE} tickets
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-caption">
          <p>
            Delete {name} permanently? It will be removed from {USAGE} tickets
            and the tag will no longer exist on this project.
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={onDelete}
            >
              Delete tag
            </Button>
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
