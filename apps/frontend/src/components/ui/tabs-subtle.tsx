"use client"

import { motion, AnimatePresence } from "motion/react"
import {
  useId,
  useRef,
  useState,
  useCallback,
  useEffect,
  createContext,
  useContext,
  forwardRef,
  type ReactNode,
  type HTMLAttributes
} from "react"

import { useProximityHover } from "@/hooks/use-proximity-hover"
import { fontWeights } from "@/lib/font-weight"
import type { IconComponent } from "@/lib/icon-context"
import {
  shapeMap,
  useShape,
  type ShapeClasses,
  type ShapeVariant
} from "@/lib/shape-context"
import type { SizeVariant } from "@/lib/size-context"
import { springs } from "@/lib/springs"
import { cn } from "@/lib/utils"

interface TabsSubtleContextValue {
  registerTab: (index: number, element: HTMLElement | null) => void
  hoveredIndex: number | null
  selectedIndex: number
  onSelect: (index: number) => void
  idPrefix: string
  activeLabel: boolean
  shape: ShapeClasses
  compact: boolean
}

const TabsSubtleContext = createContext<TabsSubtleContextValue | null>(null)

function useTabsSubtle() {
  const ctx = useContext(TabsSubtleContext)
  if (!ctx) throw new Error("useTabsSubtle must be used within a TabsSubtle")
  return ctx
}

interface TabsSubtleProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "onSelect"
> {
  children: ReactNode
  selectedIndex: number
  onSelect: (index: number) => void
  idPrefix?: string
  /** When true, only the selected tab shows its text label. Requires icons on tabs. */
  activeLabel?: boolean
  size?: SizeVariant
  shape?: ShapeVariant
}

const TabsSubtle = forwardRef<HTMLDivElement, TabsSubtleProps>(
  (
    {
      children,
      selectedIndex,
      onSelect,
      idPrefix: idPrefixProp,
      activeLabel = false,
      size,
      shape: shapeProp,
      className,
      ...props
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const isMouseInside = useRef(false)
    const generatedId = useId()
    const contextShape = useShape()
    const shape = shapeProp === undefined ? contextShape : shapeMap[shapeProp]
    const compact = size === "compact"
    const idPrefix = idPrefixProp || generatedId

    const {
      activeIndex: hoveredIndex,
      setActiveIndex: setHoveredIndex,
      itemRects: tabRects,
      handlers,
      registerItem,
      measureItems: measureTabs
    } = useProximityHover(containerRef, { axis: "x" })

    // Track tab elements locally so we can observe their individual resizes
    const tabElementsRef = useRef(new Map<number, HTMLElement>())
    const registerTab = useCallback(
      (index: number, element: HTMLElement | null) => {
        registerItem(index, element)
        if (element) {
          tabElementsRef.current.set(index, element)
        } else {
          tabElementsRef.current.delete(index)
        }
      },
      [registerItem]
    )

    useEffect(() => {
      measureTabs()
    }, [measureTabs, children])

    // Observe individual tab buttons for resize (label expand/collapse in activeLabel mode)
    useEffect(() => {
      const elements = tabElementsRef.current
      if (elements.size === 0) return
      const ro = new ResizeObserver(() => measureTabs())
      elements.forEach((el) => ro.observe(el))
      return () => ro.disconnect()
    }, [measureTabs, children])

    // Wrap handlers to track isMouseInside
    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        isMouseInside.current = true
        handlers.onMouseMove(e)
      },
      [handlers]
    )

    const handleMouseLeave = useCallback(() => {
      isMouseInside.current = false
      handlers.onMouseLeave()
    }, [handlers])

    const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

    const selectedRect = tabRects[selectedIndex]
    const hoverRect = hoveredIndex !== null ? tabRects[hoveredIndex] : null
    const focusRect = focusedIndex !== null ? tabRects[focusedIndex] : null
    const isHoveringSelected = hoveredIndex === selectedIndex
    const isHovering = hoveredIndex !== null && !isHoveringSelected

    return (
      <TabsSubtleContext.Provider
        value={{
          registerTab,
          hoveredIndex,
          selectedIndex,
          onSelect,
          idPrefix,
          activeLabel,
          shape,
          compact
        }}
      >
        <div
          ref={(node) => {
            containerRef.current = node
            if (typeof ref === "function") ref(node)
            else if (ref) ref.current = node
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onFocus={(e) => {
            const indexAttr = (e.target as HTMLElement)
              .closest("[data-proximity-index]")
              ?.getAttribute("data-proximity-index")
            if (indexAttr != null) {
              const idx = Number(indexAttr)
              setHoveredIndex(idx)
              setFocusedIndex(
                (e.target as HTMLElement).matches(":focus-visible") ? idx : null
              )
            }
          }}
          onBlur={(e) => {
            if (containerRef.current?.contains(e.relatedTarget)) return
            setFocusedIndex(null)
            if (isMouseInside.current) return
            setHoveredIndex(null)
          }}
          onKeyDown={(e) => {
            const items = Array.from(
              containerRef.current?.querySelectorAll('[role="tab"]') ?? []
            ) as HTMLElement[]
            const currentIdx = items.indexOf(e.target as HTMLElement)
            if (currentIdx === -1) return

            if (
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                e.key
              )
            ) {
              e.preventDefault()
              const next = ["ArrowRight", "ArrowDown"].includes(e.key)
                ? (currentIdx + 1) % items.length
                : (currentIdx - 1 + items.length) % items.length
              items[next].focus()
            } else if (e.key === "Home") {
              e.preventDefault()
              items[0]?.focus()
            } else if (e.key === "End") {
              e.preventDefault()
              items[items.length - 1]?.focus()
            }
          }}
          className={cn(
            "scrollbar-hide relative -my-1 flex max-w-full items-center gap-0.5 overflow-x-auto py-1 select-none",
            className
          )}
          role="tablist"
          {...props}
        >
          {/* Selected pill */}
          {selectedRect && (
            <motion.div
              className={cn(
                "pointer-events-none absolute bg-selected/50 dark:bg-accent/40",
                shape.bg
              )}
              initial={false}
              animate={{
                left: selectedRect.left,
                width: selectedRect.width,
                top: selectedRect.top,
                height: selectedRect.height,
                opacity: isHovering ? 0.8 : 1
              }}
              transition={{
                ...springs.moderate,
                opacity: { duration: 0.08 }
              }}
            />
          )}

          {/* Hover pill */}
          <AnimatePresence>
            {hoverRect && !isHoveringSelected && selectedRect && (
              <motion.div
                className={cn(
                  "pointer-events-none absolute bg-accent/60 dark:bg-accent/30",
                  shape.bg
                )}
                initial={{
                  left: selectedRect.left,
                  width: selectedRect.width,
                  top: selectedRect.top,
                  height: selectedRect.height,
                  opacity: 0
                }}
                animate={{
                  left: hoverRect.left,
                  width: hoverRect.width,
                  top: hoverRect.top,
                  height: hoverRect.height,
                  opacity: 0.4
                }}
                exit={
                  !isMouseInside.current && selectedRect
                    ? {
                        left: selectedRect.left,
                        width: selectedRect.width,
                        top: selectedRect.top,
                        height: selectedRect.height,
                        opacity: 0,
                        transition: {
                          ...springs.moderate,
                          opacity: { duration: 0.06 }
                        }
                      }
                    : { opacity: 0, transition: { duration: 0.06 } }
                }
                transition={{
                  ...springs.fast,
                  opacity: { duration: 0.08 }
                }}
              />
            )}
          </AnimatePresence>

          {/* Focus ring */}
          <AnimatePresence>
            {focusRect && (
              <motion.div
                className={cn(
                  "pointer-events-none absolute z-20 border border-[#6B97FF]",
                  shape.focusRing
                )}
                initial={false}
                animate={{
                  left: focusRect.left - 2,
                  top: focusRect.top - 2,
                  width: focusRect.width + 4,
                  height: focusRect.height + 4
                }}
                exit={{ opacity: 0, transition: { duration: 0.06 } }}
                transition={{
                  ...springs.fast,
                  opacity: { duration: 0.08 }
                }}
              />
            )}
          </AnimatePresence>

          {children}
        </div>
      </TabsSubtleContext.Provider>
    )
  }
)

TabsSubtle.displayName = "TabsSubtle"

interface TabsSubtleItemProps extends HTMLAttributes<HTMLButtonElement> {
  icon?: IconComponent
  label: string
  index: number
  count?: number
}

const TabsSubtleItem = forwardRef<HTMLButtonElement, TabsSubtleItemProps>(
  ({ icon: Icon, label, index, count, className, ...props }, ref) => {
    const internalRef = useRef<HTMLButtonElement>(null)
    const {
      registerTab,
      hoveredIndex,
      selectedIndex,
      onSelect,
      idPrefix,
      activeLabel,
      shape,
      compact
    } = useTabsSubtle()

    useEffect(() => {
      registerTab(index, internalRef.current)
      return () => registerTab(index, null)
    }, [index, registerTab])

    const isSelected = selectedIndex === index
    const isActive = hoveredIndex === index || isSelected
    const collapseLabel = activeLabel && !!Icon
    const showLabel = !collapseLabel || isSelected

    const labelContent = (
      <span className="inline-grid text-[13px] whitespace-nowrap">
        <span
          className="invisible col-start-1 row-start-1"
          style={{ fontVariationSettings: fontWeights.semibold }}
          aria-hidden="true"
        >
          {label}
        </span>
        <span
          className={cn(
            "col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80",
            isActive ? "text-foreground" : "text-muted-foreground"
          )}
          style={{
            fontVariationSettings: isSelected
              ? fontWeights.semibold
              : fontWeights.normal
          }}
        >
          {label}
        </span>
      </span>
    )

    return (
      <button
        ref={(node) => {
          internalRef.current = node
          if (typeof ref === "function") ref(node)
          else if (ref) ref.current = node
        }}
        data-proximity-index={index}
        id={`${idPrefix}-tab-${index}`}
        role="tab"
        aria-selected={isSelected}
        aria-controls={`${idPrefix}-panel-${index}`}
        aria-label={collapseLabel && !showLabel ? label : undefined}
        tabIndex={isSelected ? 0 : -1}
        onClick={() => onSelect(index)}
        className={cn(
          "relative z-10 flex cursor-pointer items-center border-none bg-transparent outline-none",
          compact ? "h-7 px-2.5" : "px-3 py-2",
          collapseLabel ? (compact ? "h-7" : "h-8") : "gap-2",
          shape.bg,
          className
        )}
        {...props}
      >
        {Icon && (
          <Icon
            size={16}
            strokeWidth={isActive ? 2 : 1.5}
            className={cn(
              "shrink-0 transition-[color,stroke-width] duration-80",
              isActive ? "text-foreground" : "text-muted-foreground"
            )}
          />
        )}
        {collapseLabel ? (
          <AnimatePresence initial={false}>
            {showLabel && (
              <motion.span
                key="label"
                className="overflow-hidden"
                initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                animate={{ width: "auto", opacity: 1, marginLeft: 8 }}
                exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                transition={{
                  ...springs.fast,
                  opacity: { duration: 0.06 }
                }}
              >
                {labelContent}
              </motion.span>
            )}
          </AnimatePresence>
        ) : (
          labelContent
        )}
        {count === undefined ? null : (
          <span className="text-xs text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </button>
    )
  }
)

TabsSubtleItem.displayName = "TabsSubtleItem"

interface TabsSubtlePanelProps extends HTMLAttributes<HTMLDivElement> {
  index: number
  selectedIndex: number
  idPrefix: string
  children: ReactNode
}

const TabsSubtlePanel = forwardRef<HTMLDivElement, TabsSubtlePanelProps>(
  ({ index, selectedIndex, idPrefix, children, className, ...props }, ref) => {
    const isSelected = selectedIndex === index

    return (
      <div
        ref={ref}
        id={`${idPrefix}-panel-${index}`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${index}`}
        hidden={!isSelected}
        tabIndex={-1}
        className={cn("outline-none", className)}
        {...props}
      >
        {isSelected && children}
      </div>
    )
  }
)

TabsSubtlePanel.displayName = "TabsSubtlePanel"

export { TabsSubtle, TabsSubtleItem, TabsSubtlePanel }
export default TabsSubtle
