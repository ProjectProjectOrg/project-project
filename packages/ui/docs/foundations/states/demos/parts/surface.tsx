import { cn } from "@pp/ui/lib/utils"
import { popupSurfaceClass } from "@pp/ui/menu-styles"
import type { ReactNode } from "react"

// The proposal, scoped to this demo: every surface declares its fill as
// --surface, and the field, hover and press colours step from it. Real
// components read these tokens, so they follow without changes. The
// selectors outrank popupSurfaceClass's own --field overrides.
export const surfaceRuleCss = `
.surface-rule [data-surface] {
  --field: oklch(from var(--surface) calc(min(1, l + 0.02)) c h);
  --field-hover: oklch(from var(--field) calc(l - 0.035) c h);
  --field-focus: oklch(from var(--field) calc(l - 0.02) c h);
  --hover: oklch(from var(--surface) calc(l - 0.035) c h);
  --active: oklch(from var(--surface) calc(l - 0.06) c h);
  --menu-hover: var(--hover);
  --menu-active: var(--active);
}
.dark .surface-rule [data-surface] {
  /* The field's hairline, a step above the surface. As an overlay on the
     field it would land on the surface's own lightness and vanish. */
  --segment-line: oklch(from var(--surface) calc(l + 0.04) c h);
  --field: oklch(from var(--surface) calc(min(l - 0.06, 0.23)) c h);
  --field-hover: oklch(from var(--field) calc(l + 0.035) c h);
  --field-focus: oklch(from var(--field) calc(l + 0.025) c h);
  --hover: oklch(from var(--surface) calc(l + 0.06) c h);
  --active: oklch(from var(--surface) calc(l + 0.1) c h);
}
`

export type SurfaceKind = "page" | "well" | "popup" | "nested"

// A surface as the app draws it. Popups wear the real popup skin (and a
// nested one the raised fill), so "Today" is exactly today's tokens.
export function Surface({
  kind,
  className,
  children
}: Readonly<{ kind: SurfaceKind; className?: string; children: ReactNode }>) {
  const fill = {
    page: "var(--page)",
    well: "var(--card)",
    popup: "var(--tooltip)",
    nested: "var(--tooltip-raised)"
  }[kind]
  return (
    <div
      data-surface={kind}
      style={{ ["--surface" as string]: fill }}
      className={cn(
        kind === "popup" || kind === "nested"
          ? popupSurfaceClass
          : "rounded-[19px] [corner-shape:var(--button-corner)]",
        kind === "nested" && "[--tooltip:var(--tooltip-raised)]",
        kind === "page" && "bg-page",
        kind === "well" && "bg-card",
        "relative z-0",
        className
      )}
    >
      {children}
    </div>
  )
}
