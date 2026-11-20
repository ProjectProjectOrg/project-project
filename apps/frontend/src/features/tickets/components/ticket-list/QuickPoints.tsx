import { Button } from "@pp/ui/button"
import { FluidHoverHighlight } from "@pp/ui/fluid-hover-highlight"
import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "@pp/ui/hooks/useFluidHover"
import { useRef } from "react"

const QUICK_POINTS = [1, 2, 3, 5, 8, 13] as const

export function QuickPoints({
  current,
  onPick
}: Readonly<{
  current: string
  onPick: (value: (typeof QUICK_POINTS)[number]) => void
}>) {
  const ref = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(ref, { axis: "x" })
  return (
    <div
      ref={ref}
      {...hover.handlers}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          hover.setActiveIndex(null)
      }}
      className="relative flex gap-1"
    >
      <FluidHoverHighlight
        hover={hover}
        className="rounded-md [corner-shape:var(--button-corner)]"
      />
      {QUICK_POINTS.map((value, index) => (
        <QuickPoint
          key={value}
          index={index}
          hover={hover}
          pressed={current === String(value)}
          onClick={() => onPick(value)}
        >
          {value}
        </QuickPoint>
      ))}
    </div>
  )
}

function QuickPoint({
  index,
  hover,
  pressed,
  onClick,
  children
}: Readonly<{
  index: number
  hover: UseFluidHoverReturn
  pressed: boolean
  onClick: () => void
  children: number
}>) {
  const ref = useRef<HTMLButtonElement>(null)
  useRegisterFluidHoverItem(hover.registerItem, index, ref)
  return (
    <Button
      ref={ref}
      type="button"
      variant="toolbar"
      size="square-7"
      aria-pressed={pressed}
      className="tabular-nums"
      onFocus={() => hover.setActiveIndex(index)}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
