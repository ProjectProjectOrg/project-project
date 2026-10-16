import {
  DEFAULT_TICKET_SORT,
  ESTIMATE_MAX_MINUTES,
  ESTIMATE_MAX_POINTS,
  ESTIMATE_SIZES,
  type Estimate,
  type EstimateFilterValue,
  type EstimateSummary,
  type EstimateUnit,
  type TicketSort,
  type EstimationMode
} from "@pp/shared"
import * as Match from "effect/Match"
import { Gauge, Hourglass, Shirt, type LucideIcon } from "lucide-react"

import { formatWorkDuration, parseDurationToSeconds } from "@/lib/duration"
import { m } from "@/paraglide/messages"

export const ESTIMATE_UNIT_ICON: Readonly<Record<EstimateUnit, LucideIcon>> = {
  points: Gauge,
  tshirt: Shirt,
  time: Hourglass
}

export const formatEstimateValue = (estimate: Estimate): string =>
  estimate.unit === "time"
    ? formatWorkDuration(estimate.minutes * 60)
    : String(estimate.value)

export const formatEstimate = (estimate: Estimate): string =>
  estimate.unit === "points"
    ? m.tickets_estimate_points({ count: estimate.value })
    : formatEstimateValue(estimate)

export const parseEstimateMinutes = (input: string): number | null => {
  const seconds = parseDurationToSeconds(input)
  if (seconds === null) return null
  const minutes = Math.round(seconds / 60)
  return minutes >= 1 && minutes <= ESTIMATE_MAX_MINUTES ? minutes : null
}

export const parseEstimatePoints = (input: string): number | null => {
  const trimmed = input.trim()
  if (!/^[1-9][0-9]*$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value <= ESTIMATE_MAX_POINTS ? value : null
}

const NO_ESTIMATE_FILTERS: ReadonlyArray<EstimateFilterValue> = []
const SIZE_FILTERS: ReadonlyArray<EstimateFilterValue> = [
  "none",
  ...ESTIMATE_SIZES
]
const PRESENCE_FILTERS: ReadonlyArray<EstimateFilterValue> = ["none", "any"]

export const estimateFilterValues = (
  mode: EstimationMode
): ReadonlyArray<EstimateFilterValue> =>
  Match.value(mode).pipe(
    Match.when("off", () => NO_ESTIMATE_FILTERS),
    Match.when("tshirt", () => SIZE_FILTERS),
    Match.orElse(() => PRESENCE_FILTERS)
  )

export const normalizeEstimateFilter = (
  mode: EstimationMode,
  values: ReadonlyArray<EstimateFilterValue> | undefined
): ReadonlyArray<EstimateFilterValue> | undefined => {
  const supported = estimateFilterValues(mode)
  const normalized = values?.filter((value) => supported.includes(value))
  return normalized?.length ? normalized : undefined
}

export const normalizeEstimateSort = (
  mode: EstimationMode,
  sort: TicketSort
): TicketSort =>
  mode === "off" && sort.key === "estimate" ? DEFAULT_TICKET_SORT : sort

export const estimateFilterLabel = (value: EstimateFilterValue): string => {
  switch (value) {
    case "none":
      return m.tickets_filters_estimate_none()
    case "any":
      return m.tickets_filters_estimate_any()
    case "stale":
      return m.tickets_filters_estimate_stale()
    default:
      return value
  }
}

const formatTotal = (unit: "points" | "time", amount: number): string =>
  unit === "points" ? String(amount) : formatWorkDuration(amount * 60)

export const formatEstimateSummary = (
  summary: EstimateSummary
): string | null => {
  const parts: Array<string> = []
  if (summary.unit === "tshirt") {
    for (const size of ESTIMATE_SIZES) {
      const count = summary.sizes[size]
      if (count > 0) parts.push(m.tickets_estimate_size_count({ count, size }))
    }
  } else if (summary.committed > 0) {
    const done = formatTotal(summary.unit, summary.done)
    const committed = formatTotal(summary.unit, summary.committed)
    parts.push(
      summary.unit === "points"
        ? m.tickets_estimate_totals_points({ done, committed })
        : m.tickets_estimate_totals_time({ done, committed })
    )
  }
  if (summary.unestimated > 0) {
    parts.push(m.tickets_estimate_unestimated({ count: summary.unestimated }))
  }
  return parts.length > 0 ? parts.join(" · ") : null
}
