import {
  DEFAULT_TICKET_SORT,
  ESTIMATE_MAX_MINUTES,
  ESTIMATE_MAX_POINTS,
  ESTIMATE_SIZES,
  type Estimate,
  type EstimateFilterValue,
  type EstimateSummary,
  type EstimateTotals,
  type EstimateUnit,
  type TicketSort,
  type EstimationMode
} from "@pp/shared"
import { Gauge, Hourglass, Shirt, type IconType } from "@pp/ui/icons"
import * as Match from "effect/Match"

import { formatWorkDuration, parseDurationToSeconds } from "@/lib/duration"
import { m } from "@/paraglide/messages"

export const ESTIMATE_UNIT_ICON: Readonly<Record<EstimateUnit, IconType>> = {
  points: Gauge,
  tshirt: Shirt,
  time: Hourglass
}

export const formatEstimateValue = (estimate: Estimate) =>
  estimate.unit === "time"
    ? formatWorkDuration(estimate.minutes * 60)
    : String(estimate.value)

export const formatEstimate = (estimate: Estimate) =>
  estimate.unit === "points"
    ? m.tickets_estimate_points({ count: estimate.value })
    : formatEstimateValue(estimate)

export const parseEstimateMinutes = (input: string) => {
  const seconds = parseDurationToSeconds(input)
  if (seconds === null) return null
  const minutes = Math.round(seconds / 60)
  return minutes >= 1 && minutes <= ESTIMATE_MAX_MINUTES ? minutes : null
}

export const parseEstimatePoints = (input: string) => {
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

export const estimateFilterValues = (mode: EstimationMode) =>
  Match.value(mode).pipe(
    Match.when("off", () => NO_ESTIMATE_FILTERS),
    Match.when("tshirt", () => SIZE_FILTERS),
    Match.orElse(() => PRESENCE_FILTERS)
  )

export const normalizeEstimateFilter = (
  mode: EstimationMode,
  values: ReadonlyArray<EstimateFilterValue> | undefined
) => {
  const supported = estimateFilterValues(mode)
  const normalized = values?.filter((value) => supported.includes(value))
  return normalized?.length ? normalized : undefined
}

export const normalizeEstimateSort = (
  mode: EstimationMode,
  sort: TicketSort
) => (mode === "off" && sort.key === "estimate" ? DEFAULT_TICKET_SORT : sort)

export const estimateFilterLabel = (value: EstimateFilterValue) => {
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

export const formatEstimateAmount = (
  unit: EstimateTotals["unit"],
  amount: number
) =>
  unit === "points"
    ? m.tickets_estimate_total_points({ total: amount })
    : formatWorkDuration(amount * 60)

export const formatEstimateProgress = (totals: EstimateTotals) => {
  if (totals.unit === "points") {
    return m.tickets_estimate_progress_points({
      done: totals.done,
      committed: totals.committed
    })
  }
  return m.tickets_estimate_progress_time({
    done: formatWorkDuration(totals.done * 60),
    committed: formatWorkDuration(totals.committed * 60)
  })
}

export const isEmptyEstimateSummary = (summary: EstimateSummary) =>
  summary.unestimated === 0 &&
  (summary.unit === "tshirt"
    ? ESTIMATE_SIZES.every((size) => summary.sizes[size] === 0)
    : summary.committed === 0)
