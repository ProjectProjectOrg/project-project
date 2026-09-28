import {
  StatusIcon as StatusIconSchema,
  type ProjectStatus,
  type StatusIconName
} from "@pp/shared"
import * as Schema from "effect/Schema"

import { Symbol, type SymbolName } from "@/components/icons/Symbol"

const symbols: Readonly<Record<StatusIconName, SymbolName>> = {
  Circle: "circle",
  CircleDot: "smallcircle.filled.circle",
  CircleDashed: "circle.dashed",
  CircleDotDashed: "circle.dotted",
  CircleCheck: "checkmark.circle.fill",
  Loader: "progress.indicator",
  Hourglass: "hourglass",
  Timer: "timer",
  Eye: "eye",
  Search: "magnifyingglass",
  ScanLine: "viewfinder",
  Microscope: "testtube.2",
  ShieldCheck: "checkmark.shield",
  Ban: "nosign",
  AlertCircle: "exclamationmark.circle",
  AlertTriangle: "exclamationmark.triangle",
  Lock: "lock",
  XCircle: "xmark.circle",
  Archive: "archivebox",
  Skull: "exclamationmark.octagon",
  Trash: "trash",
  Lightbulb: "lightbulb",
  Bookmark: "bookmark",
  Inbox: "tray",
  Trophy: "trophy",
  Sparkles: "sparkles",
  Rocket: "paperplane",
  Flame: "flame",
  Award: "rosette",
  Square: "square",
  Triangle: "triangle",
  Hexagon: "hexagon",
  Diamond: "diamond"
}

const isStatusIcon = Schema.is(StatusIconSchema)

const symbolFor = (icon: string) =>
  isStatusIcon(icon) ? symbols[icon] : "circle"

export function StatusIcon({
  status,
  size = 16
}: Readonly<{
  status: Pick<ProjectStatus, "icon" | "color">
  size?: number
}>) {
  return (
    <Symbol name={symbolFor(status.icon)} size={size} color={status.color} />
  )
}
