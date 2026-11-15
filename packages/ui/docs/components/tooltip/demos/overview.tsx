import { Button } from "@pp/ui/button"
import { Kbd } from "@pp/ui/kbd"
import { Switch } from "@pp/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipGroup,
  TooltipGroupTrigger,
  TooltipTrigger
} from "@pp/ui/tooltip"
import { Bold, Code, Italic, Link, Strikethrough } from "lucide-react"
import { useId, useState, type ReactNode } from "react"

const TOOLS = [
  { label: "Bold", shortcut: "⌘B", icon: Bold },
  { label: "Italic", shortcut: "⌘I", icon: Italic },
  { label: "Strikethrough", shortcut: "⌘⇧X", icon: Strikethrough },
  { label: "Inline code", shortcut: "⌘E", icon: Code },
  { label: "Link", shortcut: "⌘K", icon: Link }
] as const

function Label({
  label,
  shortcut
}: Readonly<{ label: string; shortcut: string }>) {
  return (
    <span className="flex items-center gap-2">
      {label}
      <Kbd size="sm">{shortcut}</Kbd>
    </span>
  )
}

// A state cell: room for its tooltip on every side, so pinned ones never
// cover a neighbour or a caption.
function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="grid h-28 w-full place-items-center">{children}</div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

function State({
  pinned,
  trigger,
  side,
  className,
  children
}: Readonly<{
  pinned: boolean
  trigger: ReactNode
  side?: "top" | "right" | "bottom" | "left"
  className?: string
  children: ReactNode
}>) {
  return (
    <Tooltip open={pinned}>
      <TooltipTrigger render={<Button variant="tertiary" size="sm" />}>
        {trigger}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

export default function Overview() {
  const [pinned, setPinned] = useState(false)
  const switchId = useId()

  return (
    <div className="@container grid w-full content-start gap-10 py-6">
      {/* Live: hover or Tab along the toolbar; one tooltip glides along. */}
      <div className="flex justify-center pt-10">
        <TooltipGroup sideOffset={10}>
          <div className="flex gap-0.5 rounded-xl bg-card p-1">
            {TOOLS.map(({ label, shortcut, icon: Icon }) => (
              <TooltipGroupTrigger
                key={label}
                tooltip={<Label label={label} shortcut={shortcut} />}
                render={
                  <Button variant="toolbar" size="icon-sm" aria-label={label} />
                }
              >
                <Icon />
              </TooltipGroupTrigger>
            ))}
          </div>
        </TooltipGroup>
      </div>

      <label
        htmlFor={switchId}
        className="flex items-center justify-center gap-2 text-caption text-muted-foreground"
      >
        <Switch id={switchId} checked={pinned} onCheckedChange={setPinned} />
        Show every state
      </label>

      {/* Content: what a tooltip can hold. */}
      <div className="grid grid-cols-[repeat(1,minmax(0,1fr))] @md:grid-cols-[repeat(3,minmax(0,1fr))]">
        <Cell caption="Label">
          <State pinned={pinned} trigger="Subscribe">
            Get notified about changes
          </State>
        </Cell>
        <Cell caption="With shortcut">
          <State pinned={pinned} trigger="Bold">
            <Label label="Bold" shortcut="⌘B" />
          </State>
        </Cell>
        <Cell caption="Two lines">
          <State pinned={pinned} trigger="4 unestimated" className="max-w-56">
            4 tickets have no estimate and don't count toward the total.
            <span className="block opacity-70">Click to show them</span>
          </State>
        </Cell>
      </div>

      {/* Placement: each side, flipping when it doesn't fit. */}
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] @xl:grid-cols-[repeat(4,minmax(0,1fr))]">
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <Cell key={side} caption={`On ${side}`}>
            <State pinned={pinned} trigger={side} side={side}>
              Tooltip
            </State>
          </Cell>
        ))}
      </div>
    </div>
  )
}
