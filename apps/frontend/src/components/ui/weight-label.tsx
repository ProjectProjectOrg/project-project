import { fontWeights } from "@/lib/fontWeight"
import { cn } from "@/lib/utils"

export function WeightLabel({
  active,
  truncate = false,
  children
}: Readonly<{ active: boolean; truncate?: boolean; children: string }>) {
  return (
    <span
      className={cn("inline-grid", truncate ? "min-w-0" : "whitespace-nowrap")}
    >
      <span
        aria-hidden
        className={cn(
          "invisible col-start-1 row-start-1",
          truncate && "truncate"
        )}
        style={{ fontVariationSettings: fontWeights.semibold }}
      >
        {children}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80",
          truncate && "truncate"
        )}
        style={{
          fontVariationSettings: active
            ? fontWeights.semibold
            : fontWeights.normal
        }}
      >
        {children}
      </span>
    </span>
  )
}
