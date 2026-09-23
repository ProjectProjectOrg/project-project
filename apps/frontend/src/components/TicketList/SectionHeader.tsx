import type { ProjectStatus, TicketStatus } from "@pp/shared"
import { ChevronDown, Plus } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { forwardRef, type ReactNode, type Ref } from "react"

import { Hitbox } from "@/components/ui/hitbox"
import { keepInPlace } from "@/lib/keepInPlace"
import { transitions } from "@/lib/springs"
import { statusLabelFor, statusMetaFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export type SectionHeading = {
  label: string
  icon: ReactNode
  detail?: ReactNode
}

type HeadingSource =
  | {
      heading: SectionHeading
      status?: TicketStatus
      statuses?: ReadonlyArray<ProjectStatus>
    }
  | {
      heading?: undefined
      status: TicketStatus
      statuses: ReadonlyArray<ProjectStatus>
    }

type BareProps = HeadingSource & {
  variant?: "bare"
  count: number
}

type StickyProps = HeadingSource & {
  variant: "sticky"
  count: number
  collapsed: boolean
  creating: boolean
  onToggleCollapsed: () => void
  onStartCreate: () => void
  onDismissCreate: () => void
  creator: ReactNode
  canCreate?: boolean
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

function BareSectionHeader(props: BareProps): ReactNode {
  const { count, heading } = props
  const label = headingLabel(props)

  return (
    <div className="flex w-full items-center gap-2">
      <span className="grid size-6 shrink-0 place-items-center">
        {heading ? heading.icon : <StatusHeadingIcon {...props} />}
      </span>
      <span className="truncate text-sm font-medium">{label}</span>
      <span
        className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground tabular-nums"
        aria-label={m.tickets_section_count_aria_label({ count })}
      >
        {count}
      </span>
      {heading?.detail && (
        <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
          {heading.detail}
        </span>
      )}
    </div>
  )
}

const headingLabel = (source: HeadingSource): string =>
  source.heading
    ? source.heading.label
    : statusLabelFor(source.status, source.statuses)

function StatusHeadingIcon({
  status,
  statuses
}: Readonly<{
  status: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
}>) {
  const meta = statusMetaFor(status, statuses)
  const Icon = meta.icon
  return (
    <Icon
      className={cn("size-4", meta.className)}
      style={meta.color ? { color: meta.color } : undefined}
      strokeWidth={1.75}
    />
  )
}

const morphFrom = { opacity: 0, filter: "blur(8px)" }
const morphTo = { opacity: 1, filter: "blur(0px)" }

const StickySectionHeader = forwardRef<HTMLDivElement, StickyProps>(
  function StickySectionHeader(props, ref: Ref<HTMLDivElement>) {
    const {
      canCreate = true,
      collapsed,
      creating,
      onToggleCollapsed,
      onStartCreate,
      onDismissCreate,
      creator
    } = props
    const label = headingLabel(props)
    return (
      <div
        ref={ref}
        onClick={
          creating
            ? undefined
            : (e) => keepInPlace(e.currentTarget, onToggleCollapsed)
        }
        className={cn(
          "sticky top-0 z-10 flex items-center gap-3 rounded-lg bg-muted px-3 py-2 transition-colors",
          !creating && "cursor-pointer select-none hover:bg-foreground/5"
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            keepInPlace(e.currentTarget, onToggleCollapsed)
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
                <BareSectionHeader {...props} variant="bare" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {canCreate && (
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
        )}
      </div>
    )
  }
)
