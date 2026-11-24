import type { ReactNode } from "react"

import { Badge } from "../components/badge"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent
} from "../components/context-menu"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuConfirmItem
} from "../components/dropdown-menu"
import { ExternalLink, MoreHorizontal, Trash2 } from "../components/icons"
import { cn } from "../lib/utils"
import { m } from "./messages"

export function EmbedMenu({
  children,
  expanded,
  action,
  url,
  openLabel,
  onRemove
}: Readonly<{
  children: ReactNode
  expanded?: boolean
  action: ReactNode
  url?: string
  openLabel: string
  onRemove: () => void
}>) {
  const items = (
    <>
      {action}
      {url && (
        <DropdownMenuItem
          render={
            <a
              aria-label={openLabel}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          <ExternalLink />
          {openLabel}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuConfirmItem
        icon={<Trash2 />}
        label={m.editor_attachment_remove()}
        confirmLabel={m.editor_embed_remove_confirm()}
        busyLabel={m.editor_attachment_removing()}
        describeError={m.editor_embed_remove_confirm}
        onConfirm={onRemove}
      />
    </>
  )
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <span className="group/reveal relative inline-flex max-w-full items-center gap-1" />
        }
      >
        {children}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={m.editor_embed_actions()}
            render={
              <Badge
                size="xs"
                render={
                  <button type="button" aria-label={m.editor_embed_actions()} />
                }
                className={cn(
                  "size-5 justify-center p-0 opacity-0 transition-opacity group-focus-within/reveal:opacity-100 group-hover/reveal:opacity-100 before:absolute before:-inset-0.5 has-[>svg:first-child]:pl-0 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100",
                  expanded
                    ? "absolute -top-2 -right-2 size-8 rounded-[16px]"
                    : "relative"
                )}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">{items}</DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">{items}</ContextMenuContent>
    </ContextMenu>
  )
}
