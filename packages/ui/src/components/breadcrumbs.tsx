import { useRender } from "@base-ui/react/use-render"
import { motion, useReducedMotion } from "motion/react"
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  use,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from "react"

import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "../hooks/useFluidHover"
import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { FluidHoverHighlight } from "./fluid-hover-highlight"
import { ChevronRight } from "./icons"
import { TextSwap } from "./text-swap"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

/*
 * Breadcrumbs: where the page sits, as a trail of links ending in the page.
 *
 *   <Breadcrumbs label={m.nav_breadcrumb_label()}>
 *     <BreadcrumbItem key="projects" label="Projects" render={<Link … />} />
 *     <BreadcrumbItem key="project" label={project.name} render={<Link … />} />
 *   </Breadcrumbs>
 *
 * The trail is one contained thing that animates its own changes. A crumb
 * that stays (same key) and changes its text rolls through TextSwap: moving
 * between projects keeps the project crumb and swaps its name. A crumb that
 * comes or goes grows or shrinks in width as it fades and blurs, so the
 * crumbs around it slide along instead of jumping. A crumb's key is its
 * identity: key the project and ticket crumbs by their role, so another
 * project reads as a swap, and fixed crumbs by their label.
 */

type Position = Readonly<{
  index: number
  isLast: boolean
  // Unset while the crumb leaves: it takes no hover.
  register: UseFluidHoverReturn["registerItem"] | undefined
}>

const PositionContext = createContext<Position | null>(null)

const BLUR = "blur(4px)"
const SHARP = "blur(0px)"

// A crumb opens its width on the house curve (260ms, transitions.morph) while
// its ink fades in a beat behind (60ms in, 180ms long), so it never shows
// squeezed.
const INK_DELAY = 0.06

const enter = {
  width: "auto",
  opacity: 1,
  filter: SHARP,
  transition: {
    width: transitions.morph,
    opacity: { ...transitions.presence, delay: INK_DELAY },
    filter: { ...transitions.presence, delay: INK_DELAY }
  }
}
// Leaving is quicker and on the house curve, not a reversed copy of the
// enter (that starts too slowly): the ink fades out at once (100ms) while the
// width closes over 180ms, so the gap is gone before the eye waits for it.
const inkOut = { ...transitions.fade, duration: 0.1 }
const exit = {
  width: 0,
  opacity: 0,
  filter: BLUR,
  transition: {
    width: { ...transitions.morph, duration: 0.18 },
    opacity: inkOut,
    filter: inkOut
  }
}
const hidden = { width: 0, opacity: 0, filter: BLUR }
const fadeOnly = {
  enter: { opacity: 1, transition: transitions.fade },
  exit: { opacity: 0, transition: transitions.fade },
  hidden: { opacity: 0 }
}

type BreadcrumbsProps = Readonly<{
  // The nav's accessible name ("Breadcrumb").
  label: string
  children: ReactNode
  className?: string
}>

// A crumb on screen: one the caller passed (live), or one that is leaving and
// keeps its last element and place until its exit finishes.
type Entry = Readonly<{
  key: string
  element: ReactElement
  index: number
  isLast: boolean
  // The live crumb this one sat in front of when it left; it stays in front
  // of it while it shrinks, or goes last when nothing followed it.
  before: string | null
}>

// The first crumb is always the same crumb, whatever its key: the trail's
// root (Projects, Dashboard) rolls into its new name through TextSwap
// instead of leaving and entering.
const ROOT = "root"
// Children.toArray prefixes keys by where an element sits (".$project" as a
// direct child, ".0:$project" inside an array) and escapes "=" and ":". Strip
// that, so a crumb is its caller's key wherever the caller put it.
const ownKey = (key: string) =>
  key
    .slice(key.lastIndexOf("$") + 1)
    .replace(/=([02])/gu, (_, code: string) => (code === "0" ? "=" : ":"))

const keyOf = (element: ReactElement, index: number) =>
  index === 0 ? ROOT : ownKey(String(element.key))

// Live crumbs in the caller's order, each leaving crumb right in front of the
// crumb it preceded. So a crumb that replaces another (Dashboard for
// Projects) grows in front of the ones that are leaving, never behind them.
function arrange(
  live: ReadonlyArray<Entry>,
  leaving: ReadonlyArray<Entry>
): ReadonlyArray<Entry & { leaving: boolean }> {
  const out: Array<Entry & { leaving: boolean }> = []
  for (const entry of live) out.push({ ...entry, leaving: false })
  for (const entry of leaving) {
    const at =
      entry.before === null
        ? -1
        : out.findIndex((other) => other.key === entry.before)
    const placed = { ...entry, leaving: true }
    if (at === -1) out.push(placed)
    else out.splice(at, 0, placed)
  }
  return out
}

function Breadcrumbs({ label, children, className }: BreadcrumbsProps) {
  const reduce = useReducedMotion() ?? false
  const trailRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(trailRef, { axis: "x" })
  const elements = Children.toArray(children).filter(isValidElement)
  const live: ReadonlyArray<Entry> = elements.map((element, index) => ({
    key: keyOf(element, index),
    element,
    index,
    isLast: index === elements.length - 1,
    before: null
  }))

  // Presence by hand, not AnimatePresence: a leaving crumb has to stay in the
  // flow (to shrink its width, as the enter grows it) and in a place we pick.
  const [shown, setShown] = useState<ReadonlyArray<Entry>>(live)
  // The crumbs the trail mounts with appear as they are; later ones animate.
  const [first, setFirst] = useState<ReadonlySet<string>>(
    () => new Set(live.map((entry) => entry.key))
  )
  const [leaving, setLeaving] = useState<ReadonlyArray<Entry>>([])
  const liveKeys = live.map((entry) => entry.key)
  const shownKeys = shown.map((entry) => entry.key)
  if (liveKeys.join("\u0000") !== shownKeys.join("\u0000")) {
    const kept = new Set(liveKeys)
    const gone: Array<Entry> = []
    for (const entry of shown) {
      if (kept.has(entry.key)) continue
      const after = shown.slice(entry.index + 1).find((o) => kept.has(o.key))
      gone.push({ ...entry, before: after?.key ?? null })
    }
    setShown(live)
    // A crumb that left and comes back has to animate in again.
    if (gone.length > 0)
      setFirst((current) => {
        const next = new Set(current)
        for (const entry of gone) next.delete(entry.key)
        return next
      })
    setLeaving((current) => [
      ...current.filter((entry) => !kept.has(entry.key)),
      ...gone
    ])
  }
  const drop = (key: string) =>
    setLeaving((current) => current.filter((entry) => entry.key !== key))

  return (
    <nav
      aria-label={label}
      data-slot="breadcrumbs"
      className={cn(
        // Crumbs keep their full text: a trail is short, and TextSwap can't
        // truncate (its letters wrap once squeezed). Only a trail wider than
        // the page is clipped, a few px out so focus rings still show.
        "-ml-2 flex min-w-0 overflow-clip text-body text-muted-foreground [overflow-clip-margin:4px]",
        className
      )}
    >
      <div
        ref={trailRef}
        role="presentation"
        onMouseEnter={hover.handlers.onMouseEnter}
        onMouseMove={hover.handlers.onMouseMove}
        onMouseLeave={hover.handlers.onMouseLeave}
        onClick={hover.handlers.onClick}
        className="relative flex items-center"
      >
        <FluidHoverHighlight hover={hover} className="rounded-md" />
        {arrange(live, leaving).map((entry) => (
          <motion.span
            key={entry.key}
            // No layout animation: crumbs slide along with the widths that
            // open and close, and a measured jump (the page scrolling to the
            // top on navigation) would fly them in from far away.
            initial={
              first.has(entry.key) ? false : reduce ? fadeOnly.hidden : hidden
            }
            animate={
              entry.leaving
                ? reduce
                  ? fadeOnly.exit
                  : exit
                : reduce
                  ? fadeOnly.enter
                  : enter
            }
            onAnimationComplete={() => {
              if (entry.leaving) drop(entry.key)
            }}
            inert={entry.leaving || undefined}
            // Clips the crumb while its width opens or closes; the margin
            // keeps a focus ring visible once it's open.
            className="flex shrink-0 items-center overflow-clip [overflow-clip-margin:4px]"
          >
            <Slot
              index={entry.index}
              isLast={entry.isLast}
              register={entry.leaving ? undefined : hover.registerItem}
            >
              {/* Re-keyed to the crumb's identity, so the caller's own key
                    (projects, dashboard) can't remount it under the root. */}
              {cloneElement(entry.element, { key: entry.key })}
            </Slot>
          </motion.span>
        ))}
      </div>
    </nav>
  )
}

function Slot({
  index,
  isLast,
  register,
  children
}: Position & Readonly<{ children: ReactNode }>) {
  const value = useMemo(
    () => ({ index, isLast, register }),
    [index, isLast, register]
  )
  return <PositionContext value={value}>{children}</PositionContext>
}

type BreadcrumbItemProps = Readonly<{
  // The crumb's text; null while it loads, which shows a skeleton. Leave it
  // out for a crumb that is only its prefix (a parent ticket's key).
  label?: string | null
  // Read out while the label loads.
  loadingLabel?: string
  // The skeleton's width while loading, in CSS units ("12ch").
  loadingWidth?: string
  // A mono prefix before the label: a ticket's key.
  prefix?: string
  // The full name of a crumb that shows less (a parent ticket's title next
  // to its key): a tooltip under the crumb, and part of its accessible name.
  detail?: string
  // The link to render (a router Link). The last crumb is the current page
  // and never links.
  render?: useRender.RenderProp
}>

function BreadcrumbItem({
  label,
  loadingLabel,
  loadingWidth = "8ch",
  prefix,
  detail,
  render
}: BreadcrumbItemProps) {
  const position = use(PositionContext)
  const index = position?.index ?? 0
  const isLast = position?.isLast ?? true
  const linked = !isLast && render !== undefined
  const ref = useRef<HTMLSpanElement>(null)
  useRegisterFluidHoverItem(linked ? position?.register : undefined, index, ref)

  // The last name this crumb showed. While it reloads, that name stays
  // (hidden under the skeleton) so the width doesn't move, and a new name
  // rolls in from it through TextSwap.
  const named = label === null || label === undefined ? null : label
  const [shownLabel, setShownLabel] = useState<string | null>(named)
  if (named !== null && named !== shownLabel) setShownLabel(named)
  const loading = label === null
  // Nothing to show yet: the skeleton holds the crumb's width.
  const empty = loading && shownLabel === null

  const text = (
    <span className="flex shrink-0 items-baseline">
      {/* Always mounted, so a prefix that comes or goes rolls in or out. */}
      <TextSwap
        className={cn(
          "shrink-0 font-mono text-caption/[var(--lh-body)] text-muted-foreground tabular-nums transition-[margin] duration-260",
          prefix && label !== undefined ? "mr-1.5" : "mr-0"
        )}
      >
        {prefix ?? ""}
      </TextSwap>
      {label === undefined ? null : (
        // Remounted once when the first name arrives, so it appears at its
        // width instead of rolling in from nothing.
        <TextSwap key={shownLabel === null ? "empty" : "named"}>
          {shownLabel ?? ""}
        </TextSwap>
      )}
    </span>
  )

  // The crumb is one stable element whether it links or not, so its text
  // keeps animating when it turns from a link into the page and back. A link
  // lies over it (`render`, filling the crumb) and carries the name.
  const overlay = linked || detail !== undefined
  const name = [prefix, label, detail].filter(Boolean).join(" ")
  const overlayProps = {
    "aria-label": name,
    className:
      "focus-ring absolute inset-0 z-10 rounded-md outline-offset-0 [corner-shape:inherit]"
  }
  const link = !overlay ? null : detail === undefined ? (
    <Crumb render={render} {...overlayProps} />
  ) : (
    <Tooltip>
      <TooltipTrigger render={linked ? render : <span />} {...overlayProps} />
      <TooltipContent side="bottom">{detail}</TooltipContent>
    </Tooltip>
  )

  return (
    <>
      {index > 0 ? (
        <ChevronRight
          aria-hidden
          strokeWidth={1.75}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      ) : null}
      <span
        ref={ref}
        data-slot="breadcrumb-item"
        aria-current={isLast ? "page" : undefined}
        className={cn(
          "relative z-10 flex h-7 shrink-0 items-center rounded-md px-2 transition-[color,scale] duration-150",
          isLast ? "text-foreground" : "",
          linked &&
            "hover:text-foreground hover:duration-0 has-[>:last-child:active]:scale-[0.97]"
        )}
      >
        {/* While a crumb loads, its last name (if any) stays in place under
            the skeleton, so its width holds. The first name to arrive eases
            the crumb from the skeleton's width to its own (interpolate-size;
            browsers without it jump) and fades in. */}
        <span
          aria-hidden={overlay || loading || undefined}
          className="relative flex shrink-0 overflow-clip transition-[width] duration-260 ease-standard [interpolate-size:allow-keywords]"
          style={{ width: empty ? loadingWidth : "auto" }}
        >
          <span
            className={cn(
              "flex shrink-0 transition-opacity duration-150",
              loading ? "opacity-0" : "opacity-100"
            )}
          >
            {text}
          </span>
          {/* The fade sits on a wrapper: the skeleton's own pulse animates
              its opacity and would override a fade on it. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 transition-opacity duration-150",
              loading ? "opacity-100" : "opacity-0"
            )}
          >
            <span className="skeleton block h-4 rounded bg-muted/60" />
          </span>
        </span>
        {loading && loadingLabel !== undefined ? (
          <span className="sr-only">{loadingLabel}</span>
        ) : null}
        {link}
      </span>
    </>
  )
}

function Crumb({
  render,
  ...props
}: Readonly<{
  render: useRender.RenderProp | undefined
  className: string
  "aria-label": string
}>) {
  return useRender({ defaultTagName: "span", render, props })
}

export { BreadcrumbItem, Breadcrumbs }
export type { BreadcrumbItemProps, BreadcrumbsProps }
