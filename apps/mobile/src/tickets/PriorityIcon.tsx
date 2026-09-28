import type { TicketPriority } from "@pp/shared"
import Svg, { Rect } from "react-native-svg"
import { useCSSVariable } from "uniwind"

const filledBars: Readonly<Record<TicketPriority, number>> = {
  low: 1,
  med: 2,
  high: 3
}

const bars = [
  { x: 1.5, y: 9, height: 5 },
  { x: 6.5, y: 5.5, height: 8.5 },
  { x: 11.5, y: 2, height: 12 }
] as const

export function PriorityIcon({
  priority,
  size = 16
}: Readonly<{ priority: TicketPriority; size?: number }>) {
  const color = String(useCSSVariable("--color-muted-foreground"))
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      {bars.map((bar, index) => (
        <Rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width={3}
          height={bar.height}
          rx={1}
          fill={color}
          opacity={index < filledBars[priority] ? 1 : 0.28}
        />
      ))}
    </Svg>
  )
}
