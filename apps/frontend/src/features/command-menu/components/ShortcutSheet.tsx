import { useAtom } from "@effect/atom-react"
import {
  useAppHotkeyList,
  useHotkey,
  type RegisteredAppHotkeyListItem
} from "@tanstack/react-hotkeys"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { KbdShortcut } from "@/components/ui/kbd"
import { appHotkeys } from "@/lib/appHotkeys"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { shortcutSheetOpen } from "../atoms/commandMenu"

export function ShortcutSheet() {
  const [open, setOpen] = useAtom(shortcutSheetOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{m.chrome_keyboard_shortcuts()}</DialogTitle>
        </DialogHeader>
        {open && <ShortcutList onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

const groupOf = (item: RegisteredAppHotkeyListItem) =>
  item.appHotkey.meta?.group ?? ""

function ShortcutList({ onClose }: Readonly<{ onClose: () => void }>) {
  useHotkey(appHotkeys["app.shortcuts"], onClose)
  const items = useAppHotkeyList().filter(
    (item) => item.appHotkey.hotkey !== null
  )
  const groups = [...new Set(items.map(groupOf))]
  return (
    <div className="-mx-1 flex max-h-[60dvh] flex-col gap-5 overflow-y-auto px-1">
      {groups.map((group) => (
        <section key={group} className="flex flex-col gap-1">
          <h3 className="text-caption text-muted-foreground">{group}</h3>
          <ul className="flex flex-col">
            {items
              .filter((item) => groupOf(item) === group)
              .map(({ appHotkey, status }) => (
                <li
                  key={appHotkey.id}
                  className={cn(
                    "flex h-8 items-center justify-between gap-4 text-body",
                    status === "inactive" && "text-muted-foreground"
                  )}
                >
                  <span className="truncate">{appHotkey.meta?.name}</span>
                  {appHotkey.hotkey !== null && (
                    <KbdShortcut keys={appHotkey.hotkey} />
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
