import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, type ReactNode, type RefObject } from "react"

import { keepInPlace } from "../lib/keepInPlace"
import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { ChevronDown, Plus } from "./icons"
import { TextSwap } from "./text-swap"
import { HoverSide } from "./tooltip"

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
  ref?: RefObject<HTMLDivElement | null>
  icon: ReactNode
  label: string
  count: number
  // Read out for the count, for example "4 tickets".
  countLabel: string
  // Muted text at the end of the heading: a sprint's dates, its points.
  detail?: ReactNode
  lock?: ReactNode
  collapsed: boolean
  onToggleCollapsed: () => void
  // The chevron's name, for example "Collapse In progress".
  collapseLabel: string
  // Leave out where nobody can create tickets; the "+" is hidden then.
  create?: SectionCreate
}>

// The heading and the creator trade places with a short blur crossfade; the
// creator comes in from the "+" side and the heading leaves the other way.
const creatorFrom = { opacity: 0, filter: "blur(6px)", x: 12 }
const headingFrom = { opacity: 0, filter: "blur(6px)", x: -12 }
const morphTo = { opacity: 1, filter: "blur(0px)", x: 0 }

function useStuck() {
  const marker = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const target = marker.current
    const header = target?.parentElement
    const root = header?.closest<HTMLElement>("[data-scroll-root]")
    if (!target || !header || !root) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        const top = entry.rootBounds?.top
        header.toggleAttribute(
          "data-stuck",
          top !== undefined &&
            entry.intersectionRatio > 0 &&
            entry.boundingClientRect.top < top &&
            root.scrollTop > 0
        )
      },
      { root, threshold: [0, 0.5, 1] }
    )
    observer.observe(target)
    return () => {
      observer.disconnect()
      header.removeAttribute("data-stuck")
    }
  }, [])
  return marker
}

export function ListSectionHeader({
  ref,
  icon,
  label,
  count,
  countLabel,
  detail,
  lock,
  collapsed,
  onToggleCollapsed,
  collapseLabel,
  create
}: ListSectionHeaderProps) {
  const creating = create?.creating ?? false
  // The header stays where it is on screen while the rows under it open or
  // close, instead of the page jumping by their height.
  const toggle = (anchor: Element) => keepInPlace(anchor, onToggleCollapsed)
  const marker = useStuck()
  return (
    // Every hover in it opens below, tooltips and cards alike.
    <HoverSide side="bottom">
      <div
        ref={ref}
        data-slot="list-section-header"
        data-creating={creating || undefined}
        className="group/section-header sticky top-[var(--list-sticky-top,0px)] z-10 -mb-1 surface-page pb-1"
      >
        <span
          ref={marker}
          aria-hidden="true"
          className="pointer-events-none absolute top-[calc(-1px-var(--list-sticky-top,0px))] left-0 h-0.5 w-px"
        />
        <div
          onClick={
            creating ? undefined : (event) => toggle(event.currentTarget)
          }
          className={cn(
            "relative flex h-10 items-center gap-(--list-lead-gap) rounded-[20px] pr-2 pl-(--list-pad-start) transition-[background-color,box-shadow] duration-150 ease-standard [corner-shape:var(--button-corner)]",
            // Pinned to the top: a soft lift, so rows read as passing under it.
            "group-data-stuck/section-header:shadow-surface-3",
            creating
              ? // Typing a ticket: the bar becomes the field it holds.
                "bg-field shadow-[inset_0_0_0_1px_var(--field-line)]"
              : cn(
                  "cursor-pointer surface-muted select-none hover:duration-0 hover:[--surface:color-mix(in_oklch,var(--muted)_95%,var(--foreground)_5%)]",
                  // Pressed: one step darker, unless the press is on one of
                  // the header's own controls (a chip, the chevron, the "+").
                  "[&:active:not(:has(button:active,a:active,[data-popup-open],[data-section-detail]:active))]:[--surface:color-mix(in_oklch,var(--muted)_90%,var(--foreground)_10%)]"
                )
          )}
        >
          {/* The header's controls are house buttons (ghost, 24px), so they
            hover, press and take focus like every other icon button. */}
          <Button
            type="button"
            variant="ghost"
            size="square-6"
            onClick={(event) => {
              event.stopPropagation()
              toggle(event.currentTarget)
            }}
            aria-expanded={!collapsed}
            aria-label={collapseLabel}
            className="w-(--list-lead) text-muted-foreground"
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-150 ease-standard",
                collapsed && "-rotate-90"
              )}
              strokeWidth={1.75}
            />
          </Button>

          <div className="grid min-w-0 flex-1">
            <AnimatePresence mode="sync" initial={false}>
              {creating ? (
                <motion.div
                  key="creator"
                  initial={creatorFrom}
                  animate={morphTo}
                  exit={creatorFrom}
                  transition={transitions.presence}
                  className="min-w-0 self-center [grid-area:1/1]"
                >
                  {create?.creator}
                </motion.div>
              ) : (
                <motion.div
                  key="header"
                  initial={headingFrom}
                  animate={morphTo}
                  exit={headingFrom}
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
                    {/* A plain number, like the rows' values; it rolls when
                      tickets move in or out. */}
                    <span
                      aria-label={countLabel}
                      className="flex text-caption text-muted-foreground tabular-nums"
                    >
                      <TextSwap>{String(count)}</TextSwap>
                    </span>
                    {lock ? (
                      // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- keeps a click on the lock from toggling the section
                      <span
                        className="-ml-1 flex"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {lock}
                      </span>
                    ) : null}
                    {detail ? (
                      // Chips (<Chip>): dates, estimates, capacity, each
                      // with its own hover. Clicks on them don't toggle.
                      // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- only stops a pointer click on a chip from toggling the section; the chips are controls of their own
                      <span
                        data-section-detail=""
                        onClick={(event) => event.stopPropagation()}
                        className="ml-auto hidden cursor-default items-center gap-1 text-caption text-muted-foreground sm:flex"
                      >
                        {detail}
                      </span>
                    ) : null}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {create ? (
            <Button
              type="button"
              variant="ghost"
              size="square-6"
              onClick={(event) => {
                event.stopPropagation()
                if (creating) create.onDismiss()
                else create.onStart()
              }}
              aria-label={creating ? create.dismissLabel : create.label}
              title={creating ? create.dismissLabel : create.label}
              className="text-muted-foreground"
            >
              <Plus
                className={cn(
                  "size-4 transition-transform duration-200 ease-standard",
                  creating && "rotate-45"
                )}
                strokeWidth={1.75}
              />
            </Button>
          ) : null}
        </div>
      </div>
    </HoverSide>
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
      className={cn("flex flex-col gap-1 pt-1", collapsed && "hidden")}
    >
      {children}
    </div>
  )
}

export type { ListSectionHeaderProps, SectionCreate }
