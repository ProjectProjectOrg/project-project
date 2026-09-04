import { forwardRef, type ReactNode, type Ref } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ChevronDown, Plus } from "lucide-react"
import { Hitbox } from "@/components/ui/hitbox"
import { statusLabelFor, statusMetaFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"
import type { ProjectStatus, TicketStatus } from "@projectproject/shared"

type BareProps = {
  variant?: "bare"
  status: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
  count: number
}

type StickyProps = {
  variant: "sticky"
  status: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
  count: number
  collapsed: boolean
  creating: boolean
  onToggleCollapsed: () => void
  onStartCreate: () => void
  onDismissCreate: () => void
  creator: ReactNode
}

export const SectionHeader = forwardRef<
  HTMLDivElement,
  BareProps | StickyProps
>(function SectionHeader(props, ref) {
  if (props.variant === "sticky") {
    return <StickySectionHeader {...props} ref={ref} />
  }
  return <BareSectionHeader {...props} />
})

function BareSectionHeader({ status, statuses, count }: BareProps): ReactNode {
  const meta = statusMetaFor(status, statuses)
  const Icon = meta.icon
  const label = statusLabelFor(status, statuses)

  return (
    <div className="flex w-full items-center gap-2">
      <span className="grid size-6 shrink-0 place-items-center">
        <Icon
          className={cn("size-4", meta.className)}
          style={meta.color ? { color: meta.color } : undefined}
          strokeWidth={1.75}
        />
      </span>
      <span className="truncate text-sm font-medium">{label}</span>
      <span
        className="rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground"
        aria-label={m.tickets_section_count_aria_label({ count })}
      >
        {count}
      </span>
    </div>
  )
}

const morphFrom = { opacity: 0, filter: "blur(8px)" }
const morphTo = { opacity: 1, filter: "blur(0px)" }

const StickySectionHeader = forwardRef<HTMLDivElement, StickyProps>(
  function StickySectionHeader(
    {
      status,
      statuses,
      count,
      collapsed,
      creating,
      onToggleCollapsed,
      onStartCreate,
      onDismissCreate,
      creator
    },
    ref: Ref<HTMLDivElement>
  ) {
    const label = statusLabelFor(status, statuses)
    return (
      <div
        ref={ref}
        onClick={creating ? undefined : onToggleCollapsed}
        className={cn(
          "sticky top-0 z-10 flex items-center gap-3 rounded-lg bg-muted px-3 py-2 transition-colors",
          !creating && "cursor-pointer select-none hover:bg-foreground/5"
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapsed()
          }}
          aria-expanded={!collapsed}
          aria-label={m.tickets_section_collapse_aria_label({ label })}
          className={cn(
            "grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none",
            "transition-all duration-100 hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring",
            "active:scale-[0.97]"
          )}
        >
          <span className="translate-x-px">
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-150",
                collapsed && "-rotate-90"
              )}
              strokeWidth={1.75}
            />
          </span>
        </button>

        <div className="grid min-w-0 flex-1">
          <AnimatePresence mode="sync" initial={false}>
            {creating ? (
              <motion.div
                key="creator"
                initial={morphFrom}
                animate={morphTo}
                exit={morphFrom}
                transition={transitions.presence}
                className="min-w-0 self-center [grid-area:1/1]"
              >
                {creator}
              </motion.div>
            ) : (
              <motion.div
                key="header"
                initial={morphFrom}
                animate={morphTo}
                exit={morphFrom}
                transition={transitions.presence}
                className="self-center [grid-area:1/1]"
              >
                <BareSectionHeader
                  status={status}
                  statuses={statuses}
                  count={count}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => {
            e.stopPropagation()
            if (creating) onDismissCreate()
            else onStartCreate()
          }}
          aria-label={
            creating
              ? m.tickets_section_create_dismiss_aria_label({ label })
              : m.tickets_section_create_aria_label({ label })
          }
          title={
            creating
              ? m.tickets_section_create_dismiss_aria_label({ label })
              : m.tickets_section_create_aria_label({ label })
          }
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-all duration-100 hover:bg-accent hover:text-foreground active:scale-[0.97]">
            <Plus
              className={cn(
                "size-4 transition-transform duration-200 ease-out",
                creating && "rotate-45"
              )}
              strokeWidth={1.75}
            />
          </span>
        </Hitbox>
      </div>
    )
  }
)
