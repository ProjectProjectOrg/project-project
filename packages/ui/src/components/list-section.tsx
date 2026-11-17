import { AnimatePresence, motion } from "motion/react"
import type { ReactNode, Ref } from "react"

import { keepInPlace } from "../lib/keepInPlace"
import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { Badge } from "./badge"
import { Hitbox } from "./hitbox"
import { ChevronDown, Plus } from "./icons"

/*
 * A group of ticket rows (a status, a sprint, an epic) with a sticky header
 * that collapses it and a "+" that turns the header into an inline creator.
 *
 *   <ListSectionHeader
 *     icon={<StatusGlyph icon={meta.icon} />}
 *     label="In progress"
 *     count={4}
 *     countLabel="4 tickets"
 *     collapsed={collapsed}
 *     onToggleCollapsed={toggle}
 *     collapseLabel="Collapse In progress"
 *     create={{ creating, creator, onStart, onDismiss, label, dismissLabel }}
 *   />
 *   <ListSectionBody collapsed={collapsed}>{rows}</ListSectionBody>
 *
 * The header lines up with the rows under it through the list's CSS
 * variables: the chevron takes the checkbox column (`--list-lead`) and the
 * icon the status column (`--list-icon`).
 */

type SectionCreate = Readonly<{
  // The header shows `creator` in place of its heading.
  creating: boolean
  creator: ReactNode
  onStart: () => void
  onDismiss: () => void
  // The "+" button's name, and its name while creating ("Cancel …").
  label: string
  dismissLabel: string
}>

type ListSectionHeaderProps = Readonly<{
  ref?: Ref<HTMLDivElement>
  icon: ReactNode
  label: string
  count: number
  // Read out for the count, for example "4 tickets".
  countLabel: string
  // Muted text at the end of the heading: a sprint's dates, its points.
  detail?: ReactNode
  collapsed: boolean
  onToggleCollapsed: () => void
  // The chevron's name, for example "Collapse In progress".
  collapseLabel: string
  // Leave out where nobody can create tickets; the "+" is hidden then.
  create?: SectionCreate
}>

const morphFrom = { opacity: 0, filter: "blur(8px)" }
const morphTo = { opacity: 1, filter: "blur(0px)" }

export function ListSectionHeader({
  ref,
  icon,
  label,
  count,
  countLabel,
  detail,
  collapsed,
  onToggleCollapsed,
  collapseLabel,
  create
}: ListSectionHeaderProps) {
  const creating = create?.creating ?? false
  // The header stays where it is on screen while the rows under it open or
  // close, instead of the page jumping by their height.
  const toggle = (anchor: Element) => keepInPlace(anchor, onToggleCollapsed)
  return (
    <div
      ref={ref}
      data-slot="list-section-header"
      onClick={creating ? undefined : (event) => toggle(event.currentTarget)}
      className={cn(
        "sticky top-0 z-10 flex items-center gap-(--list-lead-gap) rounded-lg bg-muted py-2 pr-3 pl-(--list-pad-start) transition-colors",
        !creating &&
          "cursor-pointer select-none hover:bg-[color-mix(in_oklch,var(--muted)_95%,var(--foreground)_5%)]"
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          toggle(event.currentTarget)
        }}
        aria-expanded={!collapsed}
        aria-label={collapseLabel}
        className={cn(
          "grid h-6 w-(--list-lead) shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none",
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
              {create?.creator}
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
              <div className="flex w-full items-center gap-2">
                <span className="grid h-6 w-(--list-icon) shrink-0 place-items-center">
                  {icon}
                </span>
                <span className="truncate text-body font-semibold">
                  {label}
                </span>
                <span className="flex" aria-label={countLabel}>
                  <Badge variant="count">{count}</Badge>
                </span>
                {detail ? (
                  <span className="ml-auto hidden text-caption text-muted-foreground sm:block">
                    {detail}
                  </span>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {create ? (
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(event) => {
            event.stopPropagation()
            if (creating) create.onDismiss()
            else create.onStart()
          }}
          aria-label={creating ? create.dismissLabel : create.label}
          title={creating ? create.dismissLabel : create.label}
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-all duration-100 hover:bg-hover hover:text-foreground active:scale-[0.97]">
            <Plus
              className={cn(
                "size-4 transition-transform duration-200 ease-out",
                creating && "rotate-45"
              )}
              strokeWidth={1.75}
            />
          </span>
        </Hitbox>
      ) : null}
    </div>
  )
}

// The section's rows; collapsing closes it to zero height and takes it out
// of the tab order and the accessibility tree.
export function ListSectionBody({
  collapsed,
  children
}: Readonly<{ collapsed: boolean; children: ReactNode }>) {
  return (
    <div
      data-slot="list-section-body"
      aria-hidden={collapsed || undefined}
      inert={collapsed ? true : undefined}
      className={cn("grid", collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="flex flex-col gap-1 pt-1">{children}</div>
      </div>
    </div>
  )
}

export type { ListSectionHeaderProps, SectionCreate }
