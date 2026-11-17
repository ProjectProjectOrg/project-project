import { Button } from "@pp/ui/button"
import {
  CommandMenu,
  CommandMenuDialog,
  CommandMenuEmpty,
  CommandMenuInput,
  CommandMenuItem,
  CommandMenuList,
  CommandMenuShortcut,
  type KeyLabels
} from "@pp/ui/command-menu"
import { Search as SearchIcon } from "@pp/ui/icons"
import { useState } from "react"

import { pages } from "./registry"
import { navigate } from "./router"

const KEY_LABELS: KeyLabels = {
  ctrl: "Ctrl",
  meta: "Win",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Del",
  tab: "Tab",
  space: "Space"
}

export function Search() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const items = pages
    .filter((page) =>
      page.meta.title.toLowerCase().includes(query.trim().toLowerCase())
    )
    .map((page) => ({
      value: page.path,
      label: page.meta.title,
      group: page.meta.group
    }))

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) setQuery("")
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={SearchIcon}
        onClick={() => changeOpen(true)}
        className="w-full justify-start"
      >
        <span className="flex-1 text-left">Search</span>
        <CommandMenuShortcut keys="mod+k" keyLabels={KEY_LABELS} />
      </Button>
      <CommandMenuDialog
        open={open}
        onOpenChange={changeOpen}
        title="Search components"
      >
        <CommandMenu
          items={items}
          onSelect={(item) => {
            changeOpen(false)
            void navigate(item.value)
          }}
        >
          <CommandMenuInput
            aria-label="Search components"
            placeholder="Search components…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <CommandMenuList
            renderItem={(item) => (
              <CommandMenuItem value={item.value}>{item.label}</CommandMenuItem>
            )}
          >
            <CommandMenuEmpty>No components match.</CommandMenuEmpty>
          </CommandMenuList>
        </CommandMenu>
      </CommandMenuDialog>
    </>
  )
}
