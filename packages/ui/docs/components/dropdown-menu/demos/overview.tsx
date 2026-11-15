import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuConfirmItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import type { KeyLabels } from "@pp/ui/kbd"
import * as Effect from "effect/Effect"
import { Copy, FileText, Link, Pencil, Share2, Trash2 } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

const KEY_LABELS: KeyLabels = {
  ctrl: "Ctrl",
  meta: "Win",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  space: "Space"
}

const USER_TOGGLES = new Set(["trigger-press", "escape-key"])

const ORDER = [
  { value: "selected", label: "Selected option" },
  { value: "other", label: "Other option" }
] as const

// Clicks the confirm item inside `clicks` times once the menu is up, to pin
// it armed (one click) or running (two). Demo-only.
function Pinned({
  clicks,
  children
}: Readonly<{ clicks: number; children: ReactNode }>) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const click = Effect.sync(() =>
      ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.click()
    )
    const step = Effect.sleep("150 millis").pipe(Effect.andThen(click))
    const controller = new AbortController()
    // Then hand the highlight back to the menu's first row, which the
    // overview labels "Highlighted".
    const release = Effect.sync(() =>
      ref.current
        ?.closest("[role=menu]")
        ?.querySelector<HTMLElement>("[role=menuitem]")
        ?.focus({ preventScroll: true })
    )
    void Effect.runPromise(
      Effect.forEach(Array.from({ length: clicks }), () => step, {
        discard: true
      }).pipe(Effect.andThen(release)),
      { signal: controller.signal }
    ).catch(() => {})
    return () => controller.abort()
  }, [clicks])
  return (
    <span ref={ref} className="contents">
      {children}
    </span>
  )
}

const never = () => new Promise<void>(() => {})
const fails = () => Effect.runPromiseExit(Effect.fail("offline"))
const trash = <Trash2 />

export default function Overview() {
  const [open, setOpen] = useState(true)
  const [checked, setChecked] = useState(true)
  const [unchecked, setUnchecked] = useState(false)
  const [order, setOrder] = useState<"selected" | "other">("selected")

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next, details) => {
        if (USER_TOGGLES.has(details.reason)) setOpen(next)
      }}
      modal={false}
    >
      <DropdownMenuTrigger
        render={<Button variant="secondary" className="w-60" />}
      >
        Menu
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" highlightFirst>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Items</DropdownMenuLabel>
          <DropdownMenuItem>
            <Pencil />
            Highlighted
            <DropdownMenuShortcut keys="e" keyLabels={KEY_LABELS} />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Copy />
            Default
          </DropdownMenuItem>
          <DropdownMenuItem>
            With shortcut
            <DropdownMenuShortcut keys="mod+d" keyLabels={KEY_LABELS} />
          </DropdownMenuItem>
          <DropdownMenuItem disabled>Disabled</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Checkbox items</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={checked}
            closeOnClick={false}
            onCheckedChange={setChecked}
          >
            Checked
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={unchecked}
            closeOnClick={false}
            onCheckedChange={setUnchecked}
          >
            Unchecked
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Radio group</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            items={ORDER}
            value={order}
            onValueChange={setOrder}
          />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Share2 />
            Submenu
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>
              <Link />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FileText />
              Copy as Markdown
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem variant="destructive">
          <Trash2 />
          Destructive
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Confirm items</DropdownMenuLabel>
          <DropdownMenuConfirmItem
            icon={trash}
            label="Confirm: click twice"
            confirmLabel="Delete this sprint?"
            busyLabel="Deleting…"
            describeError={() => "Couldn't delete the sprint."}
            closeOnConfirm={false}
            onConfirm={() => undefined}
          />
          <Pinned clicks={1}>
            <DropdownMenuConfirmItem
              icon={trash}
              label="Armed"
              confirmLabel="Armed: delete it?"
              busyLabel="Deleting…"
              timeout={3600}
              describeError={() => "Couldn't delete it."}
              onConfirm={() => undefined}
            />
          </Pinned>
          <Pinned clicks={2}>
            <DropdownMenuConfirmItem
              icon={trash}
              label="Busy"
              confirmLabel="Delete it?"
              busyLabel="Deleting…"
              describeError={() => "Couldn't delete it."}
              onConfirm={never}
            />
          </Pinned>
          <Pinned clicks={2}>
            <DropdownMenuConfirmItem
              icon={trash}
              label="Error"
              confirmLabel="Delete it?"
              busyLabel="Deleting…"
              timeout={3600}
              describeError={() => "Error: couldn't delete it"}
              onConfirm={fails}
            />
          </Pinned>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
