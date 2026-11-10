import { AnimatePresence, motion } from "motion/react"
import {
  createContext,
  use,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode
} from "react"

import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/useFluidHover"
import {
  SelectionBackgrounds,
  useMergeSplitBlocks,
  useSelectionRuns
} from "@/hooks/useMergeSplit"
import { fontWeights } from "@/lib/fontWeight"
import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

const ROW_RADIUS = 16

let pointerFocusRedirect = false

type CheckboxGroupContextValue = Readonly<{
  registerItem: (index: number, element: HTMLElement | null) => void
  activeIndex: number | null
}>

const CheckboxGroupContext = createContext<CheckboxGroupContextValue | null>(
  null
)

function useCheckboxGroup() {
  const context = use(CheckboxGroupContext)
  if (!context)
    throw new Error("CheckboxItem must render inside a CheckboxGroup")
  return context
}

const rowIndexOf = (target: EventTarget) =>
  target instanceof HTMLElement
    ? target
        .closest("[data-fluid-hover-index]")
        ?.getAttribute("data-fluid-hover-index")
    : undefined

function moveFocus(container: HTMLElement | null, e: KeyboardEvent) {
  const items = Array.from(
    container?.querySelectorAll<HTMLElement>("[data-fluid-hover-index]") ?? []
  )
  const current = items.findIndex((item) => item === e.target)
  if (current === -1) return
  const targets: Record<string, number> = {
    ArrowDown: (current + 1) % items.length,
    ArrowUp: (current - 1 + items.length) % items.length,
    Home: 0,
    End: items.length - 1
  }
  const next = targets[e.key]
  if (next === undefined) return
  e.preventDefault()
  items[next]?.focus()
}

type CheckboxGroupProps = Omit<ComponentProps<"div">, "children"> &
  Readonly<{
    children: ReactNode
    checkedIndices: ReadonlySet<number>
  }>

export function CheckboxGroup({
  children,
  checkedIndices,
  className,
  ...props
}: CheckboxGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(containerRef)
  const { activeIndex, setActiveIndex, itemRects, handlers, registerItem } =
    hover
  const runs = useSelectionRuns([...checkedIndices])
  const blocks = useMergeSplitBlocks(runs, itemRects, ROW_RADIUS)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const focusRect = focusedIndex !== null ? itemRects[focusedIndex] : null
  const context = useMemo(
    () => ({ registerItem, activeIndex }),
    [registerItem, activeIndex]
  )

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const index = rowIndexOf(e.target)
    if (index == null) return
    const idx = Number(index)
    setActiveIndex(idx)
    const keyboard =
      !pointerFocusRedirect &&
      e.target instanceof HTMLElement &&
      e.target.matches(":focus-visible")
    setFocusedIndex(keyboard ? idx : null)
  }

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (
      e.relatedTarget instanceof Node &&
      containerRef.current?.contains(e.relatedTarget)
    )
      return
    setFocusedIndex(null)
    setActiveIndex(null)
  }

  return (
    <CheckboxGroupContext value={context}>
      <div
        ref={containerRef}
        role="group"
        onMouseEnter={handlers.onMouseEnter}
        onMouseMove={handlers.onMouseMove}
        onMouseLeave={handlers.onMouseLeave}
        onClick={handlers.onClick}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => moveFocus(containerRef.current, e)}
        className={cn("relative flex flex-col select-none", className)}
        {...props}
      >
        <SelectionBackgrounds blocks={blocks} />
        <FluidHoverHighlight hover={hover} className="rounded-lg" />
        <AnimatePresence>
          {focusRect && (
            <motion.div
              className="pointer-events-none absolute z-20 rounded-[calc(var(--radius-lg)+2px)] border border-focus-ring"
              initial={false}
              animate={{
                left: focusRect.left - 2,
                top: focusRect.top - 2,
                width: focusRect.width + 4,
                height: focusRect.height + 4
              }}
              exit={{ opacity: 0, transition: spring.fast.exit }}
              transition={{ ...spring.fast, opacity: { duration: 0.08 } }}
            />
          )}
        </AnimatePresence>
        {children}
      </div>
    </CheckboxGroupContext>
  )
}

type CheckboxItemProps = Omit<ComponentProps<"div">, "children"> &
  Readonly<{
    label: string
    index: number
    checked: boolean
    onToggle: () => void
    disabled?: boolean
    icon?: ReactNode
    meta?: ReactNode
  }>

export function CheckboxItem({
  label,
  index,
  checked,
  onToggle,
  disabled = false,
  icon,
  meta,
  className,
  ...props
}: CheckboxItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { registerItem, activeIndex } = useCheckboxGroup()
  useRegisterFluidHoverItem(registerItem, index, ref)
  const isActive = activeIndex === index
  const toggle = () => {
    if (!disabled) onToggle()
  }

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    pointerFocusRedirect = true
    e.currentTarget.focus()
    pointerFocusRedirect = false
  }

  return (
    <div
      ref={ref}
      data-fluid-hover-index={index}
      tabIndex={0}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-label={label}
      onClick={toggle}
      onMouseDown={onMouseDown}
      onKeyDown={(e) => {
        if (e.key !== " " && e.key !== "Enter") return
        e.preventDefault()
        toggle()
      }}
      className={cn(
        "relative z-10 flex min-h-8 items-center gap-2 rounded-lg px-2 py-2 text-[13px] outline-none",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className
      )}
      {...props}
    >
      <CheckMark checked={checked} active={isActive} />
      {icon}
      <span className="inline-grid min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span
          aria-hidden
          className="invisible col-start-1 row-start-1 truncate"
          style={{ fontVariationSettings: fontWeights.semibold }}
        >
          {label}
        </span>
        <span
          className={cn(
            "col-start-1 row-start-1 truncate transition-[color,font-variation-settings] duration-80",
            checked || isActive ? "text-foreground" : "text-muted-foreground"
          )}
          style={{
            fontVariationSettings: checked
              ? fontWeights.semibold
              : fontWeights.normal
          }}
        >
          {label}
        </span>
      </span>
      {meta}
    </div>
  )
}

function CheckMark({
  checked,
  active
}: Readonly<{ checked: boolean; active: boolean }>) {
  return (
    <span aria-hidden className="relative size-4 shrink-0">
      <span
        className={cn(
          "absolute inset-0 rounded-[5px] border-[1.5px] border-solid transition-[border-color] duration-80",
          checked
            ? "border-transparent"
            : active
              ? "border-neutral-400 dark:border-neutral-500"
              : "border-border"
        )}
      />
      <AnimatePresence initial={false}>
        {checked && (
          <motion.svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-foreground"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
          >
            <motion.path
              d="M6 12L10 16L18 8"
              initial={{ pathLength: 0 }}
              animate={{
                pathLength: 1,
                transition: { duration: 0.08, ease: "easeOut" }
              }}
              exit={{
                pathLength: 0,
                transition: { duration: 0.04, ease: "easeIn" }
              }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </span>
  )
}
