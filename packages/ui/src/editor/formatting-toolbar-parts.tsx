import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar"
import {
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from "react"

import { Popover as PopoverRoot, PopoverContent } from "../components/popover"
import { TooltipGroupTrigger } from "../components/tooltip"
import {
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "../hooks/useFluidHover"
import {
  type BlockKind,
  type TextFormat,
  type ToolbarAlign
} from "./formatting-toolbar-state"

// The toolbar's pieces: its labels, a button with its tooltip, the popover it floats in, and the link input.

export type FormattingToolbarLabels = Readonly<{
  // The toolbar, and its two groups.
  toolbar: string
  text: string
  block: string
  formats: Readonly<Record<TextFormat, string>>
  link: string
  unlink: string
  linkPlaceholder: string
  blocks: Readonly<Record<BlockKind, string>>
}>

export function ToolbarButton({
  label,
  index,
  hover,
  render,
  onPress,
  children
}: Readonly<{
  label: string
  index: number
  hover: UseFluidHoverReturn
  render: ReactElement
  onPress?: () => void
  children: ReactNode
}>) {
  const ref = useRef<HTMLButtonElement>(null)
  useRegisterFluidHoverItem(hover.registerItem, index, ref)
  return (
    <TooltipGroupTrigger
      tooltip={label}
      render={
        <ToolbarPrimitive.Button
          ref={ref}
          render={render}
          aria-label={label}
          onFocus={() => hover.setActiveIndex(index)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onPress}
        />
      }
    >
      {children}
    </TooltipGroupTrigger>
  )
}

export const STAY_ABOVE = {
  side: "none",
  align: "shift",
  fallbackAxisSide: "none"
} as const

export function Popover({
  rect,
  align,
  boundary,
  open,
  onEscape,
  children
}: Readonly<{
  rect: DOMRect | null
  align: ToolbarAlign
  boundary: HTMLElement | null
  open: boolean
  onEscape?: () => void
  children: ReactNode
}>) {
  const anchor = useMemo(
    () => (rect === null ? null : { getBoundingClientRect: () => rect }),
    [rect]
  )
  return (
    <PopoverRoot
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === "escape-key") onEscape?.()
      }}
    >
      <PopoverContent
        anchor={anchor}
        side="top"
        align={align}
        sideOffset={8}
        collisionAvoidance={STAY_ABOVE}
        collisionBoundary={boundary ?? undefined}
        collisionPadding={0}
        initialFocus={false}
        finalFocus={false}
        // The popup's 19px corner is concentric with the 28px buttons inside:
        // their 14px corners plus the 1px hairline and 4px padding.
        className="p-1"
      >
        {children}
      </PopoverContent>
    </PopoverRoot>
  )
}

export function LinkInput({
  labels,
  onApply,
  onCancel
}: Readonly<{
  labels: FormattingToolbarLabels
  onApply: (url: string) => void
  onCancel: () => void
}>) {
  const [url, setUrl] = useState("")
  return (
    <input
      autoFocus
      value={url}
      placeholder={labels.linkPlaceholder}
      aria-label={labels.link}
      onChange={(event) => setUrl(event.target.value)}
      onBlur={onCancel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          onCancel()
          return
        }
        if (event.key !== "Enter") return
        event.preventDefault()
        if (url.trim() === "") onCancel()
        else onApply(url.trim())
      }}
      className="h-7 w-64 bg-transparent px-2 text-body outline-none placeholder:text-muted-foreground"
    />
  )
}
