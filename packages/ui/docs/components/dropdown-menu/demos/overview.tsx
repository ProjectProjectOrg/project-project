import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import { Copy, FileText, Link, Pencil, Share2, Trash2 } from "lucide-react"
import { useState } from "react"

const USER_TOGGLES = new Set(["trigger-press", "escape-key"])

const ORDER = [
  { value: "selected", label: "Selected option" },
  { value: "other", label: "Other option" }
] as const

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
            <DropdownMenuShortcut>E</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Copy />
            Default
          </DropdownMenuItem>
          <DropdownMenuItem>
            With shortcut
            <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
