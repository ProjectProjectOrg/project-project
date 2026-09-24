import type { BlockLookup } from "@pp/shared"
import type { MouseEvent as ReactMouseEvent } from "react"

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

const keepFocus = (event: ReactMouseEvent) => event.preventDefault()

export function GutterButton({
  nodeKey,
  blockType,
  lookup,
  top,
  left,
  landOrder
}: Readonly<{
  nodeKey: string
  blockType: string
  lookup: BlockLookup
  top: number
  left: number
  landOrder?: number
}>) {
  const chrome = blockChrome(blockType, lookup)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="block-grip"
            size="block-grip"
            aria-label={m.editor_block_handle_label({ name: chrome.name })}
            data-block-key={nodeKey}
            className={cn(
              "pointer-events-auto absolute",
              landOrder !== undefined && "block-rail-landing"
            )}
            style={{
              top,
              left,
              ...(landOrder === undefined ? {} : { "--flash-order": landOrder })
            }}
            onMouseDown={keepFocus}
          />
        }
      >
        <span className="relative size-4">
          <BlockIconGlyph
            icon={chrome.icon}
            color={chrome.color}
            className="absolute inset-0"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">{blockTooltip(chrome)}</TooltipContent>
    </Tooltip>
  )
}
