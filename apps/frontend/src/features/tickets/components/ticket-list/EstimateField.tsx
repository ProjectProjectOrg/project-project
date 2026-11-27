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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { Plus, X } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { KbdShortcut } from "@pp/ui/kbd"
import { cn } from "@pp/ui/lib/utils"
import { PickerFieldValue } from "@pp/ui/picker-field"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import { Reveal } from "@pp/ui/reveal"
import { TextSwap } from "@pp/ui/text-swap"
import { ShortcutTooltip } from "@pp/ui/tooltip"
import {
  useId,
  useState,
  type FormEvent,
  type ReactElement,
  type ComponentProps
} from "react"

import {
  ESTIMATE_UNIT_ICON,
  formatEstimate,
  formatEstimateShort,
  formatEstimateValue,
  parseEstimateMinutes,
  parseEstimatePoints
} from "@/features/tickets/lib/estimateMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { appHotkeys, hotkeyKeys } from "@/lib/appHotkeys"
import { formatWorkDurationLong } from "@/lib/duration"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

import { QuickPoints } from "./QuickPoints"

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

// One width for an estimate with a value on a card, so its chips don't move as
// values come and go: the chip's icon and padding (28px) plus two characters
// (points up to 99, XL) or four (time, as its largest unit: "1.5d"). An empty
// estimate is just its icon.
const twoCharChipWidth = "min-w-[calc(1.75rem+2ch)]"
const timeChipWidth = "min-w-[calc(1.75rem+4ch)]"

// On a row the chip fits its value, and an empty estimate keeps only its
// icon's room, revealed on hover.
export function RowEstimate({
  unit,
  ticket,
  mode,
  ...props
}: Readonly<{
  unit: EstimateUnit
  ticket: EstimateTicket
  mode: EstimationMode
}> &
  ComponentProps<typeof Chip>) {
  const chip = compactEstimateTrigger(
    ticket,
    mode,
    unit,
    {
      "aria-haspopup": unit === "tshirt" ? "menu" : "dialog",
      "data-tooltip": appHotkeys["tickets.estimate"].meta?.name,
      "data-tooltip-keys": hotkeyKeys("tickets.estimate"),
      ...props
    },
    "fit"
  )
  return (
    <span className="flex text-caption">
      {activeEstimate(ticket.estimate, mode) === null ? (
        <Reveal>{chip}</Reveal>
      ) : (
        chip
      )}
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
  return (
    <DropdownMenu>
      <ShortcutTooltip
        hotkey={appHotkeys["tickets.estimate"]}
        keyLabels={keyLabels()}
      >
        <DropdownMenuTrigger render={trigger} />
      </ShortcutTooltip>
      <SizeMenuContent ticket={ticket} onPatch={onPatch} />
    </DropdownMenu>
  )
}

export function SizeMenuContent({
  ticket,
  onPatch,
  anchor,
  finalFocus = false
}: Readonly<{
  ticket: EstimateTicket
  onPatch: (patch: TicketEdit) => void
}> &
  Pick<ComponentProps<typeof DropdownMenuContent>, "anchor" | "finalFocus">) {
  const current =
    ticket.estimate?.unit === "tshirt" ? ticket.estimate.value : null
  return (
    <DropdownMenuContent
      anchor={anchor}
      align="start"
      className="w-40"
      finalFocus={finalFocus}
    >
      <DropdownMenuRadioGroup
        items={ESTIMATE_SIZES.map((value) => ({
          value,
          label: value,
          closeOnClick: true
        }))}
        value={current}
        onValueChange={(size) => {
          if (size !== current) {
            onPatch({ estimate: { unit: "tshirt", value: size } })
          }
        }}
      />
      {ticket.estimate !== null && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onPatch({ estimate: null })}>
            <X className="size-4" strokeWidth={1.75} />
            {m.tickets_estimate_clear()}
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
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
    <PickerFieldValue
      empty={active === null}
      label={label}
      icon={<Icon className="size-3.5" strokeWidth={1.75} />}
      onClick={(e) => e.stopPropagation()}
      aria-label={m.tickets_estimate_aria_label({ label })}
      title={stale !== null ? m.tickets_estimate_stale_hint() : undefined}
    />
  )
}

function compactEstimateTrigger(
  ticket: EstimateTicket,
  mode: EstimationMode,
  unit: EstimateUnit,
  props: ComponentProps<typeof Chip> &
    Readonly<Record<`data-${string}`, string | undefined>> = {},
  width: "steady" | "fit" = "steady"
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
        width === "steady" &&
          active !== null &&
          (unit === "time" ? timeChipWidth : twoCharChipWidth)
      )}
      {...props}
    >
      <Icon strokeWidth={1.75} />
      {active !== null && formatEstimateShort(active)}
    </Chip>
  )
}

export type TypedUnit = Exclude<EstimateUnit, "tshirt">

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
      <EstimatePopoverContent
        unit={unit}
        ticket={ticket}
        onSubmit={(estimate) => {
          onPatch({ estimate })
          setOpen(false)
        }}
      />
    </Popover>
  )
}

export function EstimatePopoverContent({
  unit,
  ticket,
  onSubmit,
  anchor,
  finalFocus
}: Readonly<{
  unit: TypedUnit
  ticket: EstimateTicket
  onSubmit: (estimate: Estimate | null) => void
}> &
  Pick<ComponentProps<typeof PopoverContent>, "anchor" | "finalFocus">) {
  return (
    <PopoverContent
      anchor={anchor}
      finalFocus={finalFocus}
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
        onSubmit={onSubmit}
      />
    </PopoverContent>
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
