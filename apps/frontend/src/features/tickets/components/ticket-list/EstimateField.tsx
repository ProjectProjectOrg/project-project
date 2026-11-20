import {
  activeEstimate,
  ESTIMATE_SIZES,
  estimationUnit,
  isStaleEstimate,
  type Estimate,
  type EstimateUnit,
  type EstimationMode
} from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Chip } from "@pp/ui/chip"
import { Plus, X } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { KbdShortcut } from "@pp/ui/kbd"
import { cn } from "@pp/ui/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import { Reveal } from "@pp/ui/reveal"
import { Select, SelectTrigger } from "@pp/ui/select"
import { TextSwap } from "@pp/ui/text-swap"
import { ShortcutTooltip } from "@pp/ui/tooltip"
import { useId, useState, type FormEvent, type ReactElement } from "react"

import {
  ESTIMATE_UNIT_ICON,
  formatEstimate,
  formatEstimateShort,
  formatEstimateValue,
  parseEstimateMinutes,
  parseEstimatePoints
} from "@/features/tickets/lib/estimateMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { appHotkeys } from "@/lib/appHotkeys"
import { formatWorkDurationLong } from "@/lib/duration"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

import { QuickPoints } from "./QuickPoints"

const NO_ESTIMATE = "__no-estimate"

type EstimateTicket = Readonly<{ estimate: Estimate | null }>

export function EstimateChip({
  ticket,
  mode,
  className
}: Readonly<{
  ticket: EstimateTicket
  mode: EstimationMode
  className?: string
}>) {
  const active = activeEstimate(ticket.estimate, mode)
  if (active === null) return null
  const Icon = ESTIMATE_UNIT_ICON[active.unit]
  const label = formatEstimate(active)
  return (
    <span
      title={m.tickets_estimate_chip_aria_label({ label })}
      aria-label={m.tickets_estimate_chip_aria_label({ label })}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-caption text-muted-foreground tabular-nums",
        className
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
      {formatEstimateValue(active)}
    </span>
  )
}

export function EstimateBadgeTrigger({
  ticket,
  mode,
  onPatch,
  variant = "badge"
}: Readonly<{
  ticket: EstimateTicket
  mode: EstimationMode
  onPatch: (patch: TicketEdit) => void
  variant?: "badge" | "compact"
}>) {
  const unit = estimationUnit(mode)
  if (unit === null) return null
  const trigger =
    variant === "compact"
      ? compactEstimateTrigger(ticket, mode, unit)
      : estimateTrigger(ticket, mode)
  // On a row, an empty estimate waits for the row's hover or focus.
  const reveal =
    variant === "compact" && activeEstimate(ticket.estimate, mode) === null
  const field =
    unit === "tshirt" ? (
      <SizeSelect ticket={ticket} onPatch={onPatch} trigger={trigger} />
    ) : (
      <EstimateInputPopover
        unit={unit}
        ticket={ticket}
        onPatch={onPatch}
        trigger={trigger}
      />
    )
  return reveal ? <Reveal>{field}</Reveal> : field
}

function SizeSelect({
  ticket,
  onPatch,
  trigger
}: Readonly<{
  ticket: EstimateTicket
  onPatch: (patch: TicketEdit) => void
  trigger: ReactElement
}>) {
  const current =
    ticket.estimate?.unit === "tshirt" ? ticket.estimate.value : null
  const sizeOptions = ESTIMATE_SIZES.map((value, index) => ({
    value,
    textValue: value,
    label: value,
    separated: index === ESTIMATE_SIZES.length - 1 && ticket.estimate !== null
  }))
  const clearOptions =
    ticket.estimate === null
      ? []
      : [
          {
            value: NO_ESTIMATE,
            textValue: m.tickets_estimate_clear(),
            label: (
              <>
                <X className="size-4" strokeWidth={1.75} />
                {m.tickets_estimate_clear()}
              </>
            )
          }
        ]
  return (
    <Select
      items={[...sizeOptions, ...clearOptions]}
      value={current}
      onValueChange={(value) => {
        if (value === NO_ESTIMATE) {
          onPatch({ estimate: null })
          return
        }
        const size = ESTIMATE_SIZES.find((entry) => entry === value)
        if (size !== undefined && size !== current) {
          onPatch({ estimate: { unit: "tshirt", value: size } })
        }
      }}
      contentProps={{ align: "start", className: "w-40", finalFocus: false }}
    >
      <ShortcutTooltip
        hotkey={appHotkeys["tickets.estimate"]}
        keyLabels={keyLabels()}
      >
        <SelectTrigger render={trigger} />
      </ShortcutTooltip>
    </Select>
  )
}

function estimateTrigger(ticket: EstimateTicket, mode: EstimationMode) {
  const active = activeEstimate(ticket.estimate, mode)
  const stale = isStaleEstimate(ticket.estimate, mode) ? ticket.estimate : null
  const label =
    active !== null
      ? formatEstimate(active)
      : stale !== null
        ? m.tickets_estimate_stale({ value: formatEstimate(stale) })
        : m.tickets_estimate_empty()
  const Icon = active !== null ? ESTIMATE_UNIT_ICON[active.unit] : Plus
  return (
    <Button
      type="button"
      variant="ghost"
      tone={active === null ? "muted" : "strong"}
      onClick={(e) => e.stopPropagation()}
      aria-label={m.tickets_estimate_aria_label({ label })}
      title={stale !== null ? m.tickets_estimate_stale_hint() : undefined}
    >
      <TextSwap
        className="gap-1.5"
        icon={<Icon className="size-3.5" strokeWidth={1.75} />}
      >
        {label}
      </TextSwap>
    </Button>
  )
}

// One width for an estimate with a value, so a list's estimate column and a
// card's chips don't move as values come and go: the chip's icon and padding
// (28px) plus two characters (points up to 99, XL) or four (time, as its
// largest unit: "1.5d"). An empty estimate is just its icon.
const twoCharChipWidth = "min-w-[calc(1.75rem+2ch)]"
const timeChipWidth = "min-w-[calc(1.75rem+4ch)]"

// A list row reserves that width for the column even while the row has no
// estimate; the empty chip sits at its start, next to the tags.
export const estimateColumnWidth = (unit: EstimateUnit) =>
  unit === "time" ? timeChipWidth : twoCharChipWidth

function compactEstimateTrigger(
  ticket: EstimateTicket,
  mode: EstimationMode,
  unit: EstimateUnit
) {
  const active = activeEstimate(ticket.estimate, mode)
  const label =
    active !== null ? formatEstimate(active) : m.tickets_estimate_empty()
  const Icon = ESTIMATE_UNIT_ICON[unit]
  return (
    <Chip
      interaction="press"
      shape="count"
      onClick={(e) => e.stopPropagation()}
      aria-label={m.tickets_estimate_aria_label({ label })}
      className={cn(
        "tabular-nums",
        active !== null && (unit === "time" ? timeChipWidth : twoCharChipWidth)
      )}
    >
      <Icon strokeWidth={1.75} />
      {active !== null && formatEstimateShort(active)}
    </Chip>
  )
}

type TypedUnit = Exclude<EstimateUnit, "tshirt">

const INPUT_COPY: Readonly<
  Record<
    TypedUnit,
    Readonly<{
      label: () => string
      placeholder: () => string
      invalid: () => string
    }>
  >
> = {
  points: {
    label: m.tickets_estimate_points_label,
    placeholder: m.tickets_estimate_points_placeholder,
    invalid: m.tickets_estimate_points_invalid
  },
  time: {
    label: m.tickets_estimate_time_label,
    placeholder: m.tickets_estimate_time_placeholder,
    invalid: m.tickets_estimate_time_invalid
  }
}

const parseTypedEstimate = (unit: TypedUnit, draft: string) => {
  if (unit === "time") {
    const minutes = parseEstimateMinutes(draft)
    return minutes === null ? null : { unit, minutes }
  }
  const value = parseEstimatePoints(draft)
  return value === null ? null : { unit, value }
}

const draftFor = (unit: TypedUnit, estimate: Estimate | null) =>
  estimate === null || estimate.unit !== unit
    ? ""
    : estimate.unit === "points"
      ? String(estimate.value)
      : formatEstimateValue(estimate)

function EstimateInputPopover({
  unit,
  ticket,
  onPatch,
  trigger
}: Readonly<{
  unit: TypedUnit
  ticket: EstimateTicket
  onPatch: (patch: TicketEdit) => void
  trigger: ReactElement
}>) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ShortcutTooltip
        hotkey={appHotkeys["tickets.estimate"]}
        keyLabels={keyLabels()}
      >
        <PopoverTrigger render={trigger} />
      </ShortcutTooltip>
      <PopoverContent
        align="start"
        sideOffset={6}
        // Points: as wide as the quick-point buttons, so they line up with
        // the field under them.
        className={unit === "points" ? "w-53" : "w-60"}
        onClick={(e) => e.stopPropagation()}
      >
        <EstimateInputForm
          unit={unit}
          initial={draftFor(unit, ticket.estimate)}
          canClear={ticket.estimate !== null}
          onSubmit={(estimate) => {
            onPatch({ estimate })
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function EstimateInputForm({
  unit,
  initial,
  canClear,
  onSubmit
}: Readonly<{
  unit: TypedUnit
  initial: string
  canClear: boolean
  onSubmit: (estimate: Estimate | null) => void
}>) {
  const inputId = useId()
  const errorId = useId()
  const [draft, setDraft] = useState(initial)
  const [invalid, setInvalid] = useState(false)
  const copy = INPUT_COPY[unit]
  const parsed = parseTypedEstimate(unit, draft)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (parsed === null) {
      setInvalid(true)
      return
    }
    onSubmit(parsed)
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-caption text-muted-foreground">
        {copy.label()}
      </label>
      {unit === "points" && (
        <QuickPoints
          current={initial}
          onPick={(value) => onSubmit({ unit: "points", value })}
        />
      )}
      <Input
        id={inputId}
        inputMode={unit === "points" ? "numeric" : undefined}
        value={draft}
        placeholder={copy.placeholder()}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(event) => {
          setDraft(event.target.value)
          setInvalid(false)
        }}
        size="md"
        className="tabular-nums"
      />
      {invalid ? (
        <p id={errorId} role="alert" className="text-caption text-destructive">
          {copy.invalid()}
        </p>
      ) : (
        unit === "time" && (
          <p className="text-caption text-muted-foreground tabular-nums">
            <TextSwap announce wrap>
              {parsed?.unit === "time"
                ? formatWorkDurationLong(parsed.minutes * 60)
                : m.tickets_estimate_time_hint()}
            </TextSwap>
          </p>
        )
      )}
      <div className="flex items-center justify-end gap-1">
        {canClear && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSubmit(null)}
          >
            {m.tickets_estimate_clear_short()}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={draft.trim() === ""}>
          {m.tickets_estimate_time_save()}
          <KbdShortcut aria-hidden size="sm" keys="↵" keyLabels={keyLabels()} />
        </Button>
      </div>
    </form>
  )
}
