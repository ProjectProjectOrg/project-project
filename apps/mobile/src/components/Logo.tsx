import LogoMark from "@pp/theme/brand/logo.svg"
import { useCSSVariable } from "uniwind"

export function Logo({ size }: Readonly<{ size: number }>) {
  const [drawn, drawnMuted] = useCSSVariable([
    "--color-foreground",
    "--color-muted-foreground"
  ])
  return (
    <LogoMark
      width={size}
      height={size}
      drawn={String(drawn)}
      drawnMuted={String(drawnMuted)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  )
}
