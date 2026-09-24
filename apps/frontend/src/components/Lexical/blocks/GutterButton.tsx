import type { BlockLookup } from "@pp/shared"
import { GripVertical } from "lucide-react"
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react"

import { blockChrome, blockTooltip } from "@/components/blocks/blockChrome"
import { BlockIconGlyph } from "@/components/Library/BlockIconGlyph"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export type GutterButtonState = Readonly<{
  grip: boolean
  expanded: boolean
  dragging: boolean
  source: boolean
}>

const keepFocus = (event: ReactMouseEvent) => event.preventDefault()

export function GutterButton({
  nodeKey,
  blockType,
  lookup,
  top,
  left,
  landOrder,
  state,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel
}: Readonly<{
  nodeKey: string
  blockType: string
  lookup: BlockLookup
  top: number
  left: number
  landOrder?: number
  state: GutterButtonState
  onClick: () => void
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: () => void
}>) {
  const chrome = blockChrome(blockType, lookup)
  const { grip, expanded, dragging, source } = state
  return (
    <Tooltip>
      <TooltipTrigger
        disabled={dragging}
        render={
          <Button
            type="button"
            variant="block-grip"
            size="block-grip"
            aria-label={m.editor_block_handle_label({ name: chrome.name })}
            aria-haspopup="menu"
            aria-expanded={expanded}
            data-block-key={nodeKey}
            data-grip={grip ? "" : undefined}
            data-hovered={grip ? "" : undefined}
            className={cn(
              "pointer-events-auto absolute touch-none",
              grip && "cursor-grab",
              dragging && "cursor-grabbing",
              source && "opacity-0",
              landOrder !== undefined && "block-rail-landing"
            )}
            style={{
              top,
              left,
              ...(landOrder === undefined ? {} : { "--flash-order": landOrder })
            }}
            onClick={onClick}
            onMouseDown={keepFocus}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          />
        }
      >
        <span className="relative size-4">
          <BlockIconGlyph
            icon={chrome.icon}
            color={chrome.color}
            className={cn(
              "absolute inset-0 transition-opacity duration-150",
              grip && "opacity-0"
            )}
          />
          <GripVertical
            aria-hidden
            strokeWidth={1.75}
            className={cn(
              "absolute inset-0 size-4 text-muted-foreground transition-opacity duration-150",
              grip ? "opacity-100" : "opacity-0"
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">{blockTooltip(chrome)}</TooltipContent>
    </Tooltip>
  )
}
