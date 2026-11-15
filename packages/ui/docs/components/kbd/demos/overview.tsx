import { Button } from "@pp/ui/button"
import { Kbd, KbdShortcut, type KeyLabels } from "@pp/ui/kbd"
import type { ReactNode } from "react"

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

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid w-full min-w-0 justify-items-center gap-2">
      <div className="grid h-12 place-items-center">{children}</div>
      <span className="text-center text-caption text-muted-foreground">
        {caption}
      </span>
    </div>
  )
}

// The same Kbd on every surface it sits on: its fill and glyph are mixes of
// the surrounding text colour, so nothing is overridden per place.
export default function Overview() {
  return (
    <div className="@container grid w-full gap-10">
      <div className="flex [zoom:3] items-center justify-center gap-10 py-2">
        <Kbd>/</Kbd>
        <KbdShortcut keys="mod+k" keyLabels={KEY_LABELS} />
      </div>

      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] justify-items-center gap-y-6 @xl:grid-cols-[repeat(4,minmax(0,1fr))]">
        <Cell caption="Default">
          <Kbd>E</Kbd>
        </Cell>
        <Cell caption="Small">
          <Kbd size="sm">E</Kbd>
        </Cell>
        <Cell caption="Glyph">
          <KbdShortcut keys="↵" keyLabels={KEY_LABELS} />
        </Cell>
        <Cell caption="Word">
          <Kbd>Esc</Kbd>
        </Cell>
        <Cell caption="Shortcut">
          <KbdShortcut keys="mod+shift+p" keyLabels={KEY_LABELS} />
        </Cell>
        <Cell caption="Sequence">
          <KbdShortcut keys="g+b" keyLabels={KEY_LABELS} />
        </Cell>
        <Cell caption="Arrows, small">
          <KbdShortcut size="sm" keys="↑↓" keyLabels={KEY_LABELS} />
        </Cell>
        <Cell caption="Muted text">
          <span className="text-muted-foreground">
            <Kbd>/</Kbd>
          </span>
        </Cell>
        <Cell caption="Ghost button">
          <Button variant="ghost" size="xs">
            Cancel
            <Kbd size="sm">Esc</Kbd>
          </Button>
        </Cell>
        <Cell caption="Secondary button">
          <Button variant="secondary" size="sm">
            Save
            <KbdShortcut size="sm" keys="↵" keyLabels={KEY_LABELS} />
          </Button>
        </Cell>
        <Cell caption="Primary button">
          <Button size="sm">
            Add 3 tickets
            <KbdShortcut size="sm" keys="↵" keyLabels={KEY_LABELS} />
          </Button>
        </Cell>
        <Cell caption="Ink (tooltip)">
          <span className="inline-flex h-7 items-center gap-2 rounded-[10px] bg-primary pr-1.5 pl-2.5 text-caption text-primary-foreground">
            Open ticket
            <Kbd size="sm">O</Kbd>
          </span>
        </Cell>
      </div>
    </div>
  )
}
