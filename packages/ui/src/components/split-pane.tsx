import { useEffect, type ComponentProps } from "react"
import {
  Group,
  Panel as PanelPrimitive,
  Separator,
  useDefaultLayout,
  type LayoutStorage
} from "react-resizable-panels"

import { cn } from "../lib/utils"

// Storage throws in private windows; an unsaved layout is fine there.
const safeStorage: LayoutStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      return
    }
  }
}

type RootProps = Omit<ComponentProps<typeof Group>, "id"> &
  Readonly<{
    id?: string
  }>

function Root({ id, className, ...props }: RootProps) {
  if (id === undefined) return <RootGroup className={className} {...props} />
  return <RememberedRoot id={id} className={className} {...props} />
}

function RememberedRoot({
  id,
  ...props
}: Omit<RootProps, "id"> & Readonly<{ id: string }>) {
  const layout = useDefaultLayout({
    id: `pp-split-pane:${id}`,
    storage: safeStorage,
    onlySaveAfterUserInteractions: true
  })
  return (
    <RootGroup
      id={id}
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
      {...props}
    />
  )
}

// The library re-checks hover only on pointermove; replay one after a release.
const replayPointerAfterRelease = (event: PointerEvent) => {
  if (event.pointerType !== "mouse") return
  const { clientX, clientY } = event
  requestAnimationFrame(() => {
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX,
        clientY,
        pointerType: "mouse",
        isPrimary: true
      })
    )
  })
}

function RootGroup({ className, ...props }: ComponentProps<typeof Group>) {
  useEffect(() => {
    document.addEventListener("pointerup", replayPointerAfterRelease)
    return () =>
      document.removeEventListener("pointerup", replayPointerAfterRelease)
  }, [])
  return (
    <Group
      data-slot="split-pane"
      className={cn("h-full w-full", className)}
      {...props}
    />
  )
}

function Panel({ className, ...props }: ComponentProps<typeof PanelPrimitive>) {
  return (
    <PanelPrimitive
      data-slot="split-pane-panel"
      className={cn("h-full min-w-0", className)}
      {...props}
    />
  )
}

export const splitPaneDividerClass = cn(
  "relative w-px shrink-0 bg-border outline-none",
  "before:absolute before:inset-y-0 before:left-1/2 before:w-0.5 before:-translate-x-1/2 before:bg-[color-mix(in_oklab,var(--border),var(--foreground)_14%)] before:opacity-0 before:transition-opacity before:duration-150 before:ease-standard before:content-['']",
  "data-[separator=hover]:before:opacity-100 data-[separator=hover]:before:duration-0",
  "data-[separator=active]:before:bg-(--ring) data-[separator=active]:before:opacity-100 data-[separator=active]:before:delay-0 data-[separator=active]:before:duration-0",
  "focus-visible:before:bg-(--ring) focus-visible:before:opacity-100 focus-visible:before:delay-0 focus-visible:before:duration-0"
)

function Divider({
  className,
  ...props
}: ComponentProps<typeof Separator> & Readonly<{ "aria-label": string }>) {
  return (
    <Separator
      data-slot="split-pane-divider"
      className={cn(splitPaneDividerClass, className)}
      {...props}
    />
  )
}

export const SplitPane = { Root, Panel, Divider }
