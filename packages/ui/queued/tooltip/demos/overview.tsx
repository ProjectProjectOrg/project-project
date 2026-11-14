import { Button } from "@pp/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"
import { Bold, Code, Italic, Link, Strikethrough } from "lucide-react"
import type { ReactNode } from "react"

const SIDES = ["top", "right", "bottom", "left"] as const

function Row({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-6">
      <span className="text-caption text-muted-foreground">{caption}</span>
      <div className="flex flex-wrap items-center gap-x-28 gap-y-16">
        {children}
      </div>
    </div>
  )
}

const LIVE = [
  { label: "Bold", icon: Bold },
  { label: "Italic", icon: Italic },
  { label: "Strikethrough", icon: Strikethrough },
  { label: "Inline code", icon: Code },
  { label: "Link", icon: Link }
] as const

export default function Overview() {
  return (
    <div className="grid w-full max-w-2xl gap-16 pt-10">
      <Row caption="Sides (pinned open)">
        {SIDES.map((side) => (
          <Tooltip key={side} open>
            <TooltipTrigger render={<Button variant="tertiary" size="sm" />}>
              {side}
            </TooltipTrigger>
            <TooltipContent side={side}>Tooltip on {side}</TooltipContent>
          </Tooltip>
        ))}
      </Row>
      <Row caption="Live, 400ms delay">
        <div className="flex gap-0.5">
          {LIVE.map(({ label, icon: Icon }) => (
            <Tooltip key={label}>
              <TooltipTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={label} />
                }
              >
                <Icon />
              </TooltipTrigger>
              <TooltipContent sideOffset={10}>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </Row>
    </div>
  )
}
