import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

import type { StatusPhaseOf } from "../statuses/phase"
import type { TicketStatus } from "../tickets/Ticket"
import {
  ESTIMATE_SIZES,
  Estimate,
  type EstimateFilterValue,
  type EstimateSize,
  type EstimateSummary,
  type EstimateUnit,
  type EstimationMode
} from "./Estimate"

export type EstimatedTicket = Readonly<{
  status: TicketStatus
  estimate: Estimate | null
}>

export const estimationUnit = (mode: EstimationMode) =>
  mode === "off" ? null : mode

export const activeEstimate = (
  estimate: Estimate | null,
  mode: EstimationMode
) => (estimate !== null && estimate.unit === mode ? estimate : null)

export const isStaleEstimate = (
  estimate: Estimate | null,
  mode: EstimationMode
) => estimate !== null && estimate.unit !== mode

export const estimateRank = (estimate: Estimate) =>
  Match.value(estimate).pipe(
    Match.discriminatorsExhaustive("unit")({
      time: (estimate) => estimate.minutes,
      tshirt: (estimate) => ESTIMATE_SIZES.indexOf(estimate.value) + 1,
      points: (estimate) => estimate.value
    })
  )

export const estimateToken = (estimate: Estimate) =>
  estimate.unit === "time" ? `${estimate.minutes}m` : estimate.value

const decodeEstimate = Schema.decodeUnknownOption(Estimate)

export const parseEstimateToken = (token: unknown) => {
  const raw = Predicate.isNumber(token) ? String(token) : token
  if (!Predicate.isString(raw)) return null
  const trimmed = raw.trim()
  const minutes = /^([1-9][0-9]*)m$/.exec(trimmed)
  const candidate = minutes
    ? { unit: "time", minutes: Number(minutes[1]) }
    : /^[1-9][0-9]*$/.test(trimmed)
      ? { unit: "points", value: Number(trimmed) }
      : { unit: "tshirt", value: trimmed }
  return Option.getOrNull(decodeEstimate(candidate))
}

export const matchesEstimateFilter = (
  estimate: Estimate | null,
  values: ReadonlyArray<EstimateFilterValue>,
  mode: EstimationMode
) => {
  const active = activeEstimate(estimate, mode)
  return values.some((value) => {
    switch (value) {
      case "none":
        return active === null
      case "any":
        return active !== null
      case "stale":
        return isStaleEstimate(estimate, mode)
      default:
        return active?.unit === "tshirt" && active.value === value
    }
  })
}

const emptySizes = () =>
  ({
    XS: 0,
    S: 0,
    M: 0,
    L: 0,
    XL: 0
  }) satisfies Record<EstimateSize, number>

export const summarizeEstimates = (
  tickets: ReadonlyArray<EstimatedTicket>,
  unit: EstimateUnit,
  phaseOf: StatusPhaseOf
) => {
  const active = tickets.map((ticket) => ({
    phase: phaseOf(ticket.status),
    estimate: activeEstimate(ticket.estimate, unit)
  }))
  const unestimated = active.filter((t) => t.estimate === null).length
  if (unit === "tshirt") {
    const sizes = emptySizes()
    for (const { estimate } of active) {
      if (estimate?.unit === "tshirt") sizes[estimate.value] += 1
    }
    return { unit, sizes, unestimated } satisfies EstimateSummary
  }
  let committed = 0
  let started = 0
  let done = 0
  for (const ticket of active) {
    if (ticket.estimate === null) continue
    const amount = estimateRank(ticket.estimate)
    committed += amount
    if (ticket.phase === "started") started += amount
    if (ticket.phase === "finished") done += amount
  }
  return {
    unit,
    committed,
    started,
    done,
    unestimated
  } satisfies EstimateSummary
}
