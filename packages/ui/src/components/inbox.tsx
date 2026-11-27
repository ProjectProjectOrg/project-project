import {
  createContext,
  use,
  useLayoutEffect,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject
} from "react"

import { cn } from "../lib/utils"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from "./context-menu"
import { Check } from "./icons"
import { itemSurfaceClass } from "./item-link"
import { ListHoverScope, useInListHoverScope } from "./list-row"
import { TextSwap } from "./text-swap"
import { HoverSide } from "./tooltip"

function Header({ className, ...props }: ComponentProps<"header">) {
  return (
    <header
      data-slot="inbox-header"
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 pr-2 pl-6",
        className
      )}
      {...props}
    />
  )
}

function Heading({
  count,
  countLabel,
  className,
  children,
  ...props
}: ComponentProps<"h2"> & Readonly<{ count?: number; countLabel?: string }>) {
  return (
    <h2
      className={cn(
        "flex min-w-0 flex-1 items-baseline gap-2 text-title font-semibold",
        className
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      {count !== undefined && count > 0 && (
        <span
          aria-label={countLabel}
          className="flex text-caption font-normal text-muted-foreground tabular-nums"
        >
          <TextSwap>{String(count)}</TextSwap>
        </span>
      )}
    </h2>
  )
}

function HeaderActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 items-center gap-1", className)}
      {...props}
    />
  )
}

function List({
  className,
  children
}: Readonly<{ className?: string; children: ReactNode }>) {
  return (
    <ListHoverScope className={cn("flex flex-col gap-3 px-2", className)}>
      {children}
    </ListHoverScope>
  )
}

function Group({
  label,
  className,
  children
}: Readonly<{ label: ReactNode; className?: string; children: ReactNode }>) {
  return (
    <section data-slot="inbox-group" className={cn("grid gap-1", className)}>
      <h3 className="px-4 pb-0.5 text-micro text-muted-foreground">{label}</h3>
      {children}
    </section>
  )
}

const MenuPresenceContext = createContext<((present: boolean) => void) | null>(
  null
)

type RowProps = Omit<ComponentProps<"div">, "ref"> &
  Readonly<{
    ref?: RefObject<HTMLDivElement | null>
    unread?: boolean
    selected?: boolean
  }>

function Row({
  unread = false,
  selected = false,
  className,
  children,
  ref,
  ...props
}: RowProps) {
  const inHoverScope = useInListHoverScope()
  const [hasMenu, setHasMenu] = useState(false)
  const row = (
    <div
      ref={ref}
      data-slot="inbox-row"
      data-unread={unread || undefined}
      data-selected={selected || undefined}
      {...props}
      className={cn(
        "group/inbox-row group/reveal relative isolate grid min-h-14 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 rounded-[20px] py-2 pr-3 pl-4 text-left outline-none [corner-shape:var(--button-corner)]",
        itemSurfaceClass,
        "transition-colors has-[[data-item-link]:focus-visible]:duration-0 not-data-selected:has-[[data-item-link]:focus-visible]:surface-lit",
        "data-selected:bg-(--surface) data-selected:[--surface:color-mix(in_srgb,var(--surface-rest),var(--ink)_var(--mix-active))]",
        "[&>[data-item-link]]:before:absolute [&>[data-item-link]]:before:inset-x-0 [&>[data-item-link]]:before:-inset-y-0.5 [&>[data-item-link]]:before:content-['']",
        !inHoverScope &&
          "not-in-data-keyboard-navigation:hover:surface-lit not-data-selected:data-[popup-open]:surface-lit",
        className
      )}
    />
  )
  return (
    <HoverSide side="bottom">
      <MenuPresenceContext value={setHasMenu}>
        <ContextMenu disabled={!hasMenu}>
          <ContextMenuTrigger render={row}>
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1 size-1.5 -translate-y-1/2 scale-40 rounded-full bg-foreground opacity-0 transition-[scale,opacity] duration-150 ease-standard group-data-unread/inbox-row:scale-100 group-data-unread/inbox-row:opacity-100"
            />
            {children}
          </ContextMenuTrigger>
        </ContextMenu>
      </MenuPresenceContext>
    </HoverSide>
  )
}

function Avatar({
  reason,
  className,
  children
}: Readonly<{ reason?: ReactNode; className?: string; children: ReactNode }>) {
  return (
    <span
      className={cn(
        "pointer-events-none relative row-span-2 flex size-7",
        className
      )}
    >
      {children}
      {reason !== undefined && (
        <span
          aria-hidden
          className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-(--surface) text-foreground transition-colors [&_svg]:size-[11px]"
        >
          {reason}
        </span>
      )}
    </span>
  )
}

function Message({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-1.5 text-body", className)}
      {...props}
    />
  )
}

function Text({ className, children, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("group/inbox-text min-w-0 flex-1 truncate", className)}
      {...props}
    >
      {children}
    </span>
  )
}

function Actor({ className, children, ...props }: ComponentProps<"span">) {
  return (
    <>
      <span
        className={cn(
          "text-foreground group-data-unread/inbox-row:font-semibold group-has-[[data-kind=said]]/inbox-text:after:content-[':']",
          className
        )}
        {...props}
      >
        {children}
      </span>{" "}
    </>
  )
}

function Summary({
  kind = "said",
  className,
  ...props
}: ComponentProps<"span"> & Readonly<{ kind?: "said" | "event" }>) {
  return (
    <span
      data-kind={kind}
      className={cn(
        "text-muted-foreground",
        kind === "said" && "group-data-unread/inbox-row:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function Mention({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="inbox-mention"
      className={cn("text-state-info-ink", className)}
      {...props}
    />
  )
}

function Count({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "shrink-0 text-caption text-muted-foreground tabular-nums",
        className
      )}
      {...props}
    />
  )
}

function Time({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "min-w-8 shrink-0 text-right text-caption text-muted-foreground tabular-nums",
        className
      )}
      {...props}
    />
  )
}

function Ticket({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "col-start-2 flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground [&>[data-slot=ticket-key]]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function Title({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("min-w-0 truncate", className)} {...props} />
}

function Resolved({ className, children, ...props }: ComponentProps<"span">) {
  return (
    <>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 text-state-success-ink",
          className
        )}
        {...props}
      >
        <Check className="size-3" strokeWidth={2} />
        {children}
      </span>
      <span aria-hidden>·</span>
    </>
  )
}

function RowContextMenu({
  className,
  children
}: Readonly<{ className?: string; children: ReactNode }>) {
  const setPresent = use(MenuPresenceContext)
  useLayoutEffect(() => {
    setPresent?.(true)
    return () => setPresent?.(false)
  }, [setPresent])
  return (
    <ContextMenuContent className={className}>{children}</ContextMenuContent>
  )
}

export const Inbox = {
  Header,
  Heading,
  HeaderActions,
  List,
  Group,
  Row,
  Avatar,
  Message,
  Text,
  Actor,
  Summary,
  Mention,
  Count,
  Time,
  Ticket,
  Title,
  Resolved,
  ContextMenu: RowContextMenu
}

export type { RowProps as InboxRowProps }
