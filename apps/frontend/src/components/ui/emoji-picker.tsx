"use client"

import {
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps,
  EmojiPicker as EmojiPickerPrimitive
} from "frimousse"
import { LoaderIcon, SearchIcon } from "lucide-react"
import type * as React from "react"

import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

function EmojiPicker({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Root> & {
  variant?: "default" | "embedded"
}) {
  return (
    <EmojiPickerPrimitive.Root
      className={cn(
        "isolate flex h-full w-fit flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
        variant === "embedded" && "h-[280px] w-full border border-border",
        className
      )}
      data-slot="emoji-picker"
      {...props}
    />
  )
}

function EmojiPickerSearch({
  className,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Search>) {
  return (
    <div
      className={cn(
        "relative z-10 flex h-9 items-center gap-2 overflow-hidden border-b bg-popover px-3",
        className
      )}
      data-slot="emoji-picker-search-wrapper"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <EmojiPickerPrimitive.Search
        className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        data-slot="emoji-picker-search"
        {...props}
      />
    </div>
  )
}

function EmojiPickerRow({
  children,
  style,
  ...props
}: EmojiPickerListRowProps) {
  return (
    <div
      {...props}
      style={{ ...style, display: "grid" }}
      className="grid scroll-my-1 grid-cols-[repeat(var(--frimousse-list-columns),minmax(0,1fr))] px-1"
      data-slot="emoji-picker-row"
    >
      {children}
    </div>
  )
}

function EmojiPickerEmoji({
  emoji,
  className,
  ...props
}: EmojiPickerListEmojiProps) {
  return (
    <button
      {...props}
      className={cn(
        "flex h-7 w-full items-center justify-center rounded-sm text-base data-[active]:bg-accent",
        className
      )}
      data-slot="emoji-picker-emoji"
    >
      {emoji.emoji}
    </button>
  )
}

function EmojiPickerCategoryHeader({
  category,
  ...props
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <div
      {...props}
      className="bg-popover px-3 pt-3.5 pb-2 text-xs leading-none text-muted-foreground"
      data-slot="emoji-picker-category-header"
    >
      {category.label}
    </div>
  )
}

function EmojiPickerContent({
  className,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Viewport>) {
  return (
    <EmojiPickerPrimitive.Viewport
      className={cn("relative flex-1 outline-hidden", className)}
      data-slot="emoji-picker-viewport"
      {...props}
    >
      <EmojiPickerPrimitive.Loading
        className="absolute inset-0 flex items-center justify-center text-muted-foreground"
        data-slot="emoji-picker-loading"
      >
        <LoaderIcon className="size-4 animate-spin" />
      </EmojiPickerPrimitive.Loading>
      <EmojiPickerPrimitive.Empty
        className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
        data-slot="emoji-picker-empty"
      >
        {m.project_identity_emoji_empty()}
      </EmojiPickerPrimitive.Empty>
      <EmojiPickerPrimitive.List
        className="pb-1 select-none"
        components={{
          Row: EmojiPickerRow,
          Emoji: EmojiPickerEmoji,
          CategoryHeader: EmojiPickerCategoryHeader
        }}
        data-slot="emoji-picker-list"
      />
    </EmojiPickerPrimitive.Viewport>
  )
}

function EmojiPickerFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full max-w-(--frimousse-viewport-width) min-w-0 items-center gap-1 border-t p-2",
        className
      )}
      data-slot="emoji-picker-footer"
      {...props}
    >
      <EmojiPickerPrimitive.ActiveEmoji>
        {({ emoji }) =>
          emoji ? (
            <>
              <div className="flex size-7 flex-none items-center justify-center text-lg">
                {emoji.emoji}
              </div>
              <span className="truncate text-xs text-secondary-foreground">
                {emoji.label}
              </span>
            </>
          ) : (
            <span className="ml-1.5 flex h-7 items-center truncate text-xs text-muted-foreground">
              {m.project_identity_emoji_select_placeholder()}
            </span>
          )
        }
      </EmojiPickerPrimitive.ActiveEmoji>
    </div>
  )
}

export { EmojiPicker, EmojiPickerSearch, EmojiPickerContent, EmojiPickerFooter }
