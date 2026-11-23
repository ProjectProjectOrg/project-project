import { cn } from "@pp/ui/lib/utils"
import { popupSurfaceClass } from "@pp/ui/menu-styles"
import type { ReactNode } from "react"

export type SurfaceKind = "page" | "well" | "popup" | "nested"

// A surface as the app draws it. Popups wear the real popup skin (and a
// nested one the raised fill); the page and the card well paint with
// surface-page and surface-card, as the app's page and settings groups do.
export function Surface({
  kind,
  className,
  children
}: Readonly<{ kind: SurfaceKind; className?: string; children: ReactNode }>) {
  return (
    <div
      className={cn(
        kind === "popup" || kind === "nested"
          ? popupSurfaceClass
          : "rounded-[19px] [corner-shape:var(--button-corner)]",
        kind === "nested" && "[--tooltip:var(--tooltip-raised)]",
        kind === "page" && "surface-page",
        kind === "well" && "surface-card",
        "relative z-0",
        className
      )}
    >
      {children}
    </div>
  )
}
