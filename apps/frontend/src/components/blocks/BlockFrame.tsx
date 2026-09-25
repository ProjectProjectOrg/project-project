import type { ReactNode } from "react"

import { BlockIconGlyph } from "@/components/Library/BlockIconGlyph"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip"
import { m } from "@/paraglide/messages"

import { blockChrome, blockTooltip, useBlockLookup } from "./blockChrome"

export function BlockFrame({
  blockType,
  sync = false,
  blank = false,
  children
}: Readonly<{
  blockType: string
  sync?: boolean
  blank?: boolean
  children: ReactNode
}>) {
  const chrome = blockChrome(blockType, useBlockLookup())
  return (
    <div
      className={sync ? "ticket-block group/reveal" : "ticket-block"}
      data-block-type={blockType}
      data-sync={sync ? "" : undefined}
      data-blank={blank ? "" : undefined}
    >
      <div className="ticket-block-body">
        {children}
        {blank && (
          <p className="text-sm text-muted-foreground">
            {m.editor_block_not_filled_in()}
          </p>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="ticket-block-icon"
              role="img"
              aria-label={blockTooltip(chrome)}
            />
          }
        >
          <BlockIconGlyph icon={chrome.icon} color={chrome.color} />
        </TooltipTrigger>
        <TooltipContent side="left">{blockTooltip(chrome)}</TooltipContent>
      </Tooltip>
    </div>
  )
}
