import {
  activeEstimate,
  ESTIMATE_SIZES,
  estimationUnit,
  isStaleEstimate,
  type Estimate,
  type EstimateUnit,
  type EstimationMode
} from "@pp/shared"
import { Plus, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useId, useState, type FormEvent, type ReactElement } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { Select, SelectTrigger } from "@/components/ui/select"
import {
  ESTIMATE_UNIT_ICON,
  formatEstimate,
  formatEstimateValue,
  parseEstimateMinutes,
  parseEstimatePoints
} from "@/features/tickets/lib/estimateMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { formatWorkDurationLong } from "@/lib/duration"
import { blurSwap } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

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
  className
}: Readonly<{
  ticket: EstimateTicket
  mode: EstimationMode
  onPatch: (patch: TicketEdit) => void
  className?: string
}>) {
  const unit = estimationUnit(mode)
  if (unit === null) return null
  const trigger = estimateTrigger(ticket, mode, className)
  if (unit !== "tshirt") {
    return (
      <EstimateInputPopover
        unit={unit}
        ticket={ticket}
        onPatch={onPatch}
        trigger={trigger}
      />
    )
  }
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
          onPatch({ estimate: { unit, value: size } })
        }
      }}
      contentProps={{ align: "start", className: "w-40", finalFocus: false }}
    >
      <SelectTrigger render={trigger} />
    </Select>
  )
}

function estimateTrigger(
  ticket: EstimateTicket,
  mode: EstimationMode,
  className: string | undefined
): ReactElement {
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
      variant={active === null ? "chip-muted" : "chip"}
      onClick={(e) => e.stopPropagation()}
      aria-label={m.tickets_estimate_aria_label({ label })}
      title={stale !== null ? m.tickets_estimate_stale_hint() : undefined}
      className={className}
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
      <span>{label}</span>
    </Button>
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

const parseTypedEstimate = (
  unit: TypedUnit,
  draft: string
): Estimate | null => {
  if (unit === "time") {
    const minutes = parseEstimateMinutes(draft)
    return minutes === null ? null : { unit, minutes }
  }
  const value = parseEstimatePoints(draft)
  return value === null ? null : { unit, value }
}

const draftFor = (unit: TypedUnit, estimate: Estimate | null): string =>
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
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-60"
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
        variant="popover"
        className="tabular-nums"
      />
      {invalid ? (
        <p id={errorId} role="alert" className="text-caption text-destructive">
          {copy.invalid()}
        </p>
      ) : (
        unit === "time" && (
          <BlurSwapLine
            text={
              parsed?.unit === "time"
                ? formatWorkDurationLong(parsed.minutes * 60)
                : m.tickets_estimate_time_hint()
            }
          />
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
          <Kbd
            aria-hidden
            size="sm"
            className="bg-background/15 text-background"
          >
            ↵
          </Kbd>
        </Button>
      </div>
    </form>
  )
}

function BlurSwapLine({ text }: Readonly<{ text: string }>) {
  return (
    <p
      aria-live="polite"
      className="grid text-caption text-muted-foreground tabular-nums"
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={text}
          variants={blurSwap}
          initial="hidden"
          animate="shown"
          exit="hidden"
          className="col-start-1 row-start-1"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </p>
  )
}
