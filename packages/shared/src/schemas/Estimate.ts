import * as Schema from "effect/Schema"

export const EstimationMode = Schema.Literals([
  "off",
  "points",
  "tshirt",
  "time"
])
export type EstimationMode = typeof EstimationMode.Type

export const EstimateUnit = Schema.Literals(["points", "tshirt", "time"])
export type EstimateUnit = typeof EstimateUnit.Type

export const ESTIMATE_MAX_POINTS = 999

export const EstimatePoints = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 1, maximum: ESTIMATE_MAX_POINTS }))
)
export type EstimatePoints = typeof EstimatePoints.Type

export const ESTIMATE_SIZES = ["XS", "S", "M", "L", "XL"] as const
export const EstimateSize = Schema.Literals(ESTIMATE_SIZES)
export type EstimateSize = typeof EstimateSize.Type

export const ESTIMATE_MAX_MINUTES = 999 * 60

export const EstimateMinutes = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 1, maximum: ESTIMATE_MAX_MINUTES }))
)

export const PointsEstimate = Schema.Struct({
  unit: Schema.Literal("points"),
  value: EstimatePoints
})
export type PointsEstimate = typeof PointsEstimate.Type

export const SizeEstimate = Schema.Struct({
  unit: Schema.Literal("tshirt"),
  value: EstimateSize
})
export type SizeEstimate = typeof SizeEstimate.Type

export const TimeEstimate = Schema.Struct({
  unit: Schema.Literal("time"),
  minutes: EstimateMinutes
})
export type TimeEstimate = typeof TimeEstimate.Type

export const Estimate = Schema.Union([
  PointsEstimate,
  SizeEstimate,
  TimeEstimate
])
export type Estimate = typeof Estimate.Type

export const EstimateFilterValue = Schema.Union([
  Schema.Literals(["none", "any", "stale"]),
  EstimateSize
])
export type EstimateFilterValue = typeof EstimateFilterValue.Type

const Count = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))

export const EstimateTotals = Schema.Struct({
  unit: Schema.Literals(["points", "time"]),
  committed: Count,
  done: Count,
  unestimated: Count
})
export type EstimateTotals = typeof EstimateTotals.Type

export const EstimateSizeCounts = Schema.Struct({
  unit: Schema.Literal("tshirt"),
  sizes: Schema.Struct({
    XS: Count,
    S: Count,
    M: Count,
    L: Count,
    XL: Count
  }),
  unestimated: Count
})
export type EstimateSizeCounts = typeof EstimateSizeCounts.Type

export const EstimateSummary = Schema.Union([
  EstimateTotals,
  EstimateSizeCounts
])
export type EstimateSummary = typeof EstimateSummary.Type

export const ClearStaleEstimatesResult = Schema.Struct({
  cleared: Count
})
export type ClearStaleEstimatesResult = typeof ClearStaleEstimatesResult.Type
