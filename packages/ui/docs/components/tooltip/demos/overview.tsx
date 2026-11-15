import { Button } from "@pp/ui/button"
import { Kbd } from "@pp/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipGroup,
  TooltipGroupTrigger,
  TooltipTrigger
} from "@pp/ui/tooltip"
import { Bold, Code, Italic, Link, Strikethrough } from "lucide-react"
import type { ReactNode } from "react"

const TOOLS = [
  { label: "Bold", shortcut: "⌘B", icon: Bold },
  { label: "Italic", shortcut: "⌘I", icon: Italic },
  { label: "Strikethrough", shortcut: "⌘⇧X", icon: Strikethrough },
  { label: "Inline code", shortcut: "⌘E", icon: Code },
  { label: "Link", shortcut: "⌘K", icon: Link }
] as const

const SIDES = ["top", "right", "bottom", "left"] as const

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

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex h-24 items-end justify-center">{children}</div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

export default function Overview() {
  return (
    <div className="@container grid w-full content-start gap-14 pt-12">
      {/* Live: one shared tooltip for the whole toolbar. */}
      <div className="flex justify-center">
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
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] justify-items-center gap-y-6 @xl:grid-cols-[repeat(3,minmax(0,1fr))]">
        <Cell caption="Label">
          <Tooltip open>
            <TooltipTrigger render={<Button variant="tertiary" size="sm" />}>
              Subscribe
            </TooltipTrigger>
            <TooltipContent>Get notified about changes</TooltipContent>
          </Tooltip>
        </Cell>
        <Cell caption="With shortcut">
          <Tooltip open>
            <TooltipTrigger
              render={
                <Button variant="toolbar" size="icon-sm" aria-label="Bold" />
              }
            >
              <Bold />
            </TooltipTrigger>
            <TooltipContent>
              <Label label="Bold" shortcut="⌘B" />
            </TooltipContent>
          </Tooltip>
        </Cell>
        <Cell caption="Two lines">
          <Tooltip open>
            <TooltipTrigger render={<Button variant="tertiary" size="sm" />}>
              4 unestimated
            </TooltipTrigger>
            <TooltipContent className="max-w-56">
              4 tickets have no estimate and don't count toward the total.
              <span className="block opacity-70">Click to show them</span>
            </TooltipContent>
          </Tooltip>
        </Cell>
      </div>
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] justify-items-center gap-y-16 pb-10 @xl:grid-cols-[repeat(4,minmax(0,1fr))]">
        {SIDES.map((side) => (
          <Tooltip key={side} open>
            <TooltipTrigger render={<Button variant="tertiary" size="sm" />}>
              {side}
            </TooltipTrigger>
            <TooltipContent side={side}>On {side}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
