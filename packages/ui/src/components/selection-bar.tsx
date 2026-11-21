import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { AnimatePresence, motion, useIsPresent } from "motion/react"
import * as React from "react"

import { standardEaseCss, transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { Freeze } from "./freeze"
import { X } from "./icons"
import { FoldedContext, useFold } from "./selection-bar-fold"
import {
  ResultContent,
  swap,
  useSwapResize,
  type SelectionBarResult
} from "./selection-bar-result"
import { TextSwap } from "./text-swap"
import {
  hoverCardSurfaceClass,
  liftedSurfaceShadowClass,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "./tooltip"

/*
 * The bar that rises while tickets are selected: how many, the fields the
 * selection shares (each opens its picker), more actions, and a way out.
 *
 *   <SelectionBar label="Actions for 3 selected tickets" onClear={clear}
 *     count={m.tickets_selection_count({ count })} clearLabel={…}>
 *     <StatusMenu trigger={
 *       <SelectionBarField name="Status" icon={<StatusGlyph … />}
 *         value={shared.status ? label : "2 statuses"} />
 *     } />
 *     …
 *     <SelectionBarSeparator />
 *     <SelectionBarField name="More" icon={<MoreHorizontal />} onClick={…} />
 *   </SelectionBar>
 *
 * Each field reads like a property: the value every selected ticket shares,
 * or (muted) how many values they have between them, so you see what you're
 * about to change before you change it. A field is a plain button; menus
 * render it as their trigger.
 *
 * It's a toolbar (role="toolbar", named by `label`): Tab enters it once and
 * the arrow keys move between its buttons. The count is a status, so a
 * screen reader hears it change. It never takes focus when it appears, so
 * you can keep selecting.
 */

const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"]
  if (!keys.includes(event.key)) return
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not(:disabled)"
    )
  ]
  const at = items.findIndex((item) => item === document.activeElement)
  if (at === -1) return
  event.preventDefault()
  const step = new Map([
    ["ArrowLeft", at - 1],
    ["ArrowRight", at + 1],
    ["Home", 0],
    ["End", items.length - 1]
  ])
  const next = ((step.get(event.key) ?? at) + items.length) % items.length
  items[next]?.focus()
}

// When the rows above re-flow (a change sorts tickets into another group,
// a section collapses), the bar would jump to its new place under them; it
// glides there instead, from where it was, on the morph's curve. A scroll
// moves it too, but that's the page moving, so it's left alone.
function useReflowGlide(lane: React.RefObject<HTMLDivElement | null>) {
  React.useLayoutEffect(() => {
    const element = lane.current
    const parent = element?.parentElement
    if (!element || !parent) return undefined
    let last = element.getBoundingClientRect().top
    const onScroll = () => {
      last = element.getBoundingClientRect().top
    }
    const observer = new ResizeObserver(() => {
      const now = element.getBoundingClientRect().top
      const delta = last - now
      last = now
      if (Math.abs(delta) < 1) return
      element.animate([{ translate: `0 ${delta}px` }, { translate: "0 0" }], {
        duration: transitions.morph.duration * 1000,
        easing: standardEaseCss,
        composite: "add"
      })
    })
    observer.observe(parent)
    for (const sibling of parent.children)
      if (sibling !== element) observer.observe(sibling)
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true
    })
    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", onScroll, { capture: true })
    }
  }, [lane])
}

// Tracks an element's width.
function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = React.useState<number | null>(null)
  React.useLayoutEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const measure = () => setWidth(element.offsetWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width
}

export function SelectionBar({
  label,
  count,
  clearLabel,
  onClear,
  result,
  selectAll,
  className,
  children
}: Readonly<{
  // Names the toolbar: "Actions for 3 selected tickets".
  label: string
  // "3 selected": rolls through TextSwap as it changes.
  count: string
  clearLabel: string
  onClear: () => void
  // What the last change did. While it's set the bar shows it in place of
  // the selection and its fields: "Updated 11 tickets · Undo", or
  // "Couldn't update 3 tickets · Retry · Cancel".
  result?: SelectionBarResult
  // Widens the selection to everything in view, saying how much:
  // "Select all 46". Leave it out once everything is selected.
  selectAll?: Readonly<{ label: string; onSelect: () => void }>
  className?: string
  children: React.ReactNode
}>) {
  // While it leaves, it keeps showing what it showed (not "0 selected").
  const present = useIsPresent()
  const lane = React.useRef<HTMLDivElement>(null)
  const laneWidth = useWidth(lane)
  useReflowGlide(lane)
  const content = React.useRef<HTMLDivElement>(null)
  const fold = useFold(content, laneWidth)
  const bar = React.useRef<HTMLDivElement>(null)
  useSwapResize(bar, result ? "result" : "selection", laneWidth !== null)
  return (
    // It takes its own 40px under the list (spaced by the list's own gap), so
    // even when the list is short it never sits on the last rows; while the
    // list scrolls it stays 24px above the window's bottom.
    // The lane is a size container: its width is the list's, never the
    // bar's, so measuring it says when to fold. Too narrow even folded, the
    // bar wraps onto a second row instead of overflowing.
    <div
      ref={lane}
      className="@container pointer-events-none sticky bottom-6 z-30 flex min-h-10 items-end justify-center"
    >
      {/* The bar waits for the lane's width (measured before paint), so it
          rises already folded or not, instead of rising wide and then
          folding its values away. */}
      {laneWidth !== null && (
        <motion.div
          ref={bar}
          role="toolbar"
          aria-label={label}
          onKeyDown={moveFocus}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          // Its width is simply its content's. Everything inside animates its
          // own size on transitions.morph (values roll, stacks ease icons in
          // and out, "Select all" and folded values grow and shrink), so the
          // bar's edge moves with them, in the same frame, on the same curve.
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={transitions.presence}
          className={cn(
            hoverCardSurfaceClass,
            "pointer-events-auto relative max-w-full overflow-hidden rounded-[18px] whitespace-nowrap",
            liftedSurfaceShadowClass,
            className
          )}
        >
          <FoldedContext value={fold}>
            <AnimatePresence initial={false} mode="popLayout">
              {result ? (
                <motion.div
                  key="result"
                  data-swap="result"
                  // Focus waits here while a result is pending.
                  tabIndex={-1}
                  {...swap}
                  className="flex items-center gap-0.5 p-1 outline-none in-data-swapping:w-max"
                >
                  <Freeze frozen={!present}>
                    <ResultContent result={result} />
                  </Freeze>
                </motion.div>
              ) : (
                <motion.div
                  ref={content}
                  key="selection"
                  data-swap="selection"
                  {...swap}
                  className={cn(
                    "flex items-center gap-0.5 p-1 in-data-swapping:w-max",
                    // Fully folded and still too wide, they wrap onto a second
                    // row, once the rest has folded away (260ms), not while.
                    fold.folded &&
                      "flex-wrap transition-[flex-wrap] [transition-behavior:allow-discrete] delay-[260ms] duration-0 in-data-swapping:flex-nowrap"
                  )}
                >
                  <Freeze frozen={!present}>
                    <output
                      aria-live="polite"
                      className="flex h-8 items-center pr-1 pl-2.5 text-body text-foreground tabular-nums"
                    >
                      <TextSwap>{count}</TextSwap>
                    </output>
                    <Button
                      variant="ghost"
                      size="square-6"
                      aria-label={clearLabel}
                      onClick={onClear}
                    >
                      <X />
                    </Button>
                    <AnimatePresence initial={false}>
                      {selectAll && (
                        <motion.span
                          key="select-all"
                          initial={{ width: 0, opacity: 0 }}
                          // Folded first when short of room (⌘A still
                          // selects all), before the fields' names.
                          animate={
                            fold.selectAllFolded
                              ? { width: 0, opacity: 0 }
                              : { width: "auto", opacity: 1 }
                          }
                          exit={{ width: 0, opacity: 0 }}
                          transition={
                            fold.instant ? { duration: 0 } : transitions.morph
                          }
                          inert={fold.selectAllFolded}
                          className="flex shrink-0 overflow-hidden"
                        >
                          <Button
                            variant="ghost"
                            data-fold-select-all
                            onClick={selectAll.onSelect}
                            className="shrink-0"
                          >
                            {selectAll.label}
                          </Button>
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <SelectionBarSeparator />
                    {children}
                  </Freeze>
                </motion.div>
              )}
            </AnimatePresence>
          </FoldedContext>
          {/* Always there, so a screen reader hears each result as it
              lands (a live region added with its text isn't read). */}
          <span aria-live="polite" className="sr-only">
            {result?.message}
          </span>
        </motion.div>
      )}
    </div>
  )
}

export function SelectionBarSeparator() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
}

type FieldProps = Omit<React.ComponentProps<"button">, "value"> &
  Readonly<{
    // The field's name, for its accessible label ("Status: 2 statuses").
    name: string
    icon?: React.ReactNode
    // What the selection shares, or how many values it holds; or, for a
    // field that's only a menu, its name again ("Status"). Leave it out for
    // an action (More) that only shows its icon.
    value?: string
    // Keys that do the same, after the value; they stay when it folds.
    shortcut?: React.ReactNode
    render?: useRender.RenderProp
  }>

// One field of the selection, or an action. A plain button, so a menu can
// render it as its trigger: <DropdownMenuTrigger render={<SelectionBarField … />} />.
export function SelectionBarField({
  name,
  icon,
  value,
  shortcut,
  render,
  className,
  ...props
}: FieldProps) {
  // Folded (a narrow list) or an action without a value, it shows only its
  // icon; then its tooltip says what it is: "Status: 2 statuses".
  const { folded, instant } = React.use(FoldedContext)
  // A field without an icon has nothing to fold to, so it keeps its value.
  const canFold = icon !== undefined
  const iconOnly = value === undefined || (folded && canFold)
  // A field that is only its name ("Status", with its key) says it once.
  const label =
    value === undefined || value === name ? name : `${name}: ${value}`
  const field = useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(
      {
        type: "button",
        "aria-label": label,
        className: cn(
          "focus-ring inline-flex h-8 max-w-48 min-w-0 shrink-0 cursor-pointer items-center rounded-[16px] px-2.5 text-body text-foreground transition-[background-color,scale,padding] duration-150 ease-out [corner-shape:var(--button-corner)] hover:bg-hover hover:duration-0 active:scale-[0.97] data-[popup-open]:bg-hover [&_svg]:size-3.5 [&_svg]:shrink-0",
          // The padding eases with the value (the morph); hover stays quick.
          "[transition-duration:150ms,150ms,260ms] [transition-timing-function:ease-out,ease-out,var(--ease-standard)]",
          iconOnly && "min-w-8 justify-center px-1.5",
          instant && "transition-none",
          className
        )
      },
      props,
      // Its own content wins: a Select's trigger hands its rendered element
      // a value of its own, which would empty the field.
      {
        children: (
          <>
            {icon}
            {value !== undefined && (
              // Folded it shrinks to nothing but stays, so the bar can still
              // tell how wide it would be (data-fold-value).
              <motion.span
                aria-hidden
                initial={false}
                animate={
                  folded && canFold
                    ? { width: 0, marginLeft: 0, opacity: 0 }
                    : {
                        width: "auto",
                        marginLeft: icon === undefined ? 0 : 6,
                        opacity: 1
                      }
                }
                transition={instant ? { duration: 0 } : transitions.morph}
                className="flex min-w-0 overflow-hidden"
              >
                <span
                  // Only a value that folds is measured for unfolding.
                  data-fold-value={canFold ? "" : undefined}
                  className="block w-max max-w-40 shrink-0 truncate"
                >
                  <TextSwap>{value}</TextSwap>
                </span>
              </motion.span>
            )}
            {shortcut !== undefined && value !== undefined && (
              // The keys never fold: folded, a field is its icon and key.
              <span className="ml-1.5 flex shrink-0">{shortcut}</span>
            )}
          </>
        )
      }
    )
  })
  return (
    <Tooltip>
      <TooltipTrigger render={field} disabled={!iconOnly} />
      <TooltipContent>
        {label}
        {/* The field shows its keys, except an icon-only action. */}
        {shortcut !== undefined && value === undefined && (
          <span className="ml-1.5 inline-flex">{shortcut}</span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export type { SelectionBarResult } from "./selection-bar-result"
