import { chipClassName } from "@pp/ui/chip"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@pp/ui/hover-card"
import { CalendarRange, CircleDashed, Flag, Gauge, Scale } from "@pp/ui/icons"
import { ListSectionHeader } from "@pp/ui/list-section"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"
import { useState } from "react"

// A planned sprint's section header, as the backlog shows it. Each chip is
// as interactive as what it does: the dates are static, the estimate and
// the capacity only open a preview or a tooltip (hover), and the
// unestimated count filters the list (press). Warnings recolour the text,
// never the fill.
export default function SprintHeader() {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="@container w-full rounded-xl bg-page p-3">
      <ListSectionHeader
        icon={
          <Flag className="size-4 text-muted-foreground" strokeWidth={1.75} />
        }
        label="Sprint 26"
        count={14}
        countLabel="14 tickets"
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
        collapseLabel="Toggle section Sprint 26"
        detail={
          <>
            <span className={chipClassName()}>
              <CalendarRange className="size-3 shrink-0" strokeWidth={1.75} />
              Dec 8 – Dec 21
            </span>
            <HoverCard>
              <HoverCardTrigger
                render={
                  <span
                    className={chipClassName({
                      interaction: "hover",
                      className: "tabular-nums"
                    })}
                  />
                }
              >
                <Gauge className="size-3 shrink-0" strokeWidth={1.75} />
                <span className="text-foreground">21 pts</span>
              </HoverCardTrigger>
              <HoverCardContent
                align="end"
                className="pointer-events-none flex w-64 flex-col gap-2 text-caption"
              >
                <span className="text-body font-semibold">Sprint 26</span>
                <span className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>21 pts
                </span>
                <span className="flex justify-between">
                  <span className="text-muted-foreground">Unestimated</span>2
                  tickets
                </span>
              </HoverCardContent>
            </HoverCard>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Show tickets without an estimate"
                    className={chipClassName({
                      interaction: "press",
                      className:
                        "text-state-warning tabular-nums hover:text-state-warning"
                    })}
                  />
                }
              >
                <CircleDashed className="size-3 shrink-0" strokeWidth={2} />2
              </TooltipTrigger>
              <TooltipContent>
                2 tickets have no estimate
                <div className="text-muted-foreground">
                  Show tickets without an estimate
                </div>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className={chipClassName({
                      interaction: "hover",
                      className:
                        "text-state-warning tabular-nums hover:text-state-warning"
                    })}
                  />
                }
              >
                <Scale className="size-3 shrink-0" strokeWidth={1.75} />4 pts
                over
              </TooltipTrigger>
              <TooltipContent>
                Average of the last 3 sprints: 17 pts
              </TooltipContent>
            </Tooltip>
          </>
        }
      />
    </div>
  )
}
