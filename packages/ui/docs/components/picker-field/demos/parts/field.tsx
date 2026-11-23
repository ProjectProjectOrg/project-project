import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuList,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { CircleDashed, Flag, Layers, Plus, Zap } from "@pp/ui/icons"
import { KbdShortcut, type KeyLabels } from "@pp/ui/kbd"
import { cn } from "@pp/ui/lib/utils"
import { menuItemDetailClass } from "@pp/ui/menu-styles"
import {
  PickerField,
  PickerFieldOpen,
  PickerFieldValue
} from "@pp/ui/picker-field"
import { ProgressCount } from "@pp/ui/progress-count"
import { useState, type ReactNode } from "react"

import { EPICS, SPRINTS, type DemoSprint } from "./data"

// A ticket's sprint and epic, as the ticket page builds them from
// PickerField and a filterable DropdownMenu.

const KEY_LABELS: KeyLabels = {
  ctrl: "Ctrl",
  meta: "Win",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  space: "Space"
}

const NONE = "none"

type Choice = Readonly<{
  id: string
  name: string
  search: string
  icon: ReactNode
  detail: ReactNode
}>

type FieldProps = Readonly<{
  value: string | null
  onChange: (id: string | null) => void
  onOpen: (name: string) => void
  defaultOpen?: boolean
  // Pins the hover look, for the state grid.
  hovered?: boolean
}>

function Field({
  noun,
  choices,
  emptyLabel,
  emptyIcon,
  noneLabel,
  shortcut,
  value,
  onChange,
  onOpen,
  defaultOpen,
  hovered = false
}: FieldProps &
  Readonly<{
    noun: string
    choices: ReadonlyArray<Choice>
    emptyLabel: string
    emptyIcon: ReactNode
    noneLabel: string
    shortcut: string
  }>) {
  const [query, setQuery] = useState("")
  const current = choices.find((choice) => choice.id === value) ?? null
  const none = {
    value: NONE,
    textValue: noneLabel,
    closeOnClick: true,
    label: (
      <>
        <CircleDashed strokeWidth={1.75} />
        <span className="truncate">{noneLabel}</span>
      </>
    )
  }
  const items = [
    none,
    ...choices.map((choice) => ({
      value: choice.id,
      textValue: choice.search,
      closeOnClick: true,
      label: (
        <>
          {choice.icon}
          <span className="min-w-0 truncate">{choice.name}</span>
          <span data-menu-meta className={menuItemDetailClass}>
            {choice.detail}
          </span>
        </>
      )
    }))
  ]

  return (
    <PickerField>
      <DropdownMenu
        modal={false}
        defaultOpen={defaultOpen}
        filterable={{ value: query, onValueChange: setQuery }}
        onOpenChangeComplete={(open) => {
          if (!open) setQuery("")
        }}
      >
        <DropdownMenuTrigger
          render={
            <PickerFieldValue
              empty={current === null}
              aria-label={`${noun}: ${current?.name ?? emptyLabel}`}
              className={cn("h-7", hovered && "bg-hover text-foreground")}
            >
              {current?.icon ?? emptyIcon}
              <span className="max-w-[24ch] truncate">
                {current?.name ?? emptyLabel}
              </span>
            </PickerFieldValue>
          }
        />
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="w-max max-w-[min(20rem,calc(100vw-2rem))] min-w-60"
        >
          <DropdownMenuInput
            placeholder={`Move to ${noun.toLowerCase()}…`}
            aria-label={`Move to ${noun.toLowerCase()}`}
            shortcut={
              <KbdShortcut keys={shortcut} keyLabels={KEY_LABELS} aria-hidden />
            }
          />
          <DropdownMenuList className="max-h-80">
            <DropdownMenuRadioGroup
              value={value ?? NONE}
              onValueChange={(id) => onChange(id === NONE ? null : id)}
              items={items}
            />
          </DropdownMenuList>
          <DropdownMenuEmpty>No {noun.toLowerCase()} matches</DropdownMenuEmpty>
        </DropdownMenuContent>
      </DropdownMenu>
      {current && (
        <PickerFieldOpen
          label={`Open ${noun.toLowerCase()}`}
          onClick={() => onOpen(current.name)}
          className={hovered ? "opacity-100" : undefined}
        />
      )}
    </PickerField>
  )
}

function SprintGlyph({ sprint }: Readonly<{ sprint: DemoSprint }>) {
  const Icon = sprint.state === "active" ? Zap : Flag
  return (
    <Icon
      className={cn(
        "size-3.5 shrink-0 [[role=menuitemradio]_&]:size-4",
        sprint.state === "active" ? "text-state-info!" : "text-muted-foreground"
      )}
      strokeWidth={1.75}
    />
  )
}

const SPRINT_CHOICES: ReadonlyArray<Choice> = SPRINTS.map((sprint) => ({
  id: sprint.id,
  name: sprint.name,
  search: sprint.name,
  icon: <SprintGlyph sprint={sprint} />,
  detail:
    sprint.range === null
      ? "Upcoming"
      : `${sprint.range} · ${sprint.state === "active" ? "Active" : "Upcoming"}`
}))

const EPIC_CHOICES: ReadonlyArray<Choice> = EPICS.map((epic) => ({
  id: epic.id,
  name: epic.title,
  search: `${epic.id} ${epic.title}`,
  icon: (
    <Layers
      className="size-3.5 shrink-0 [[role=menuitemradio]_&]:size-4"
      strokeWidth={1.75}
    />
  ),
  detail: (
    <ProgressCount
      done={epic.done}
      total={epic.total}
      label={`${epic.done} of ${epic.total} sub-tickets done`}
      tone="inherit"
    />
  )
}))

export function SprintField(props: FieldProps) {
  return (
    <Field
      noun="Sprint"
      choices={SPRINT_CHOICES}
      emptyLabel="No sprint"
      emptyIcon={<CircleDashed className="size-3.5" strokeWidth={1.75} />}
      noneLabel="No sprint"
      shortcut="shift+s"
      {...props}
    />
  )
}

export function EpicField(props: FieldProps) {
  return (
    <Field
      noun="Epic"
      choices={EPIC_CHOICES}
      emptyLabel="Add to epic"
      emptyIcon={<Plus className="size-3.5" strokeWidth={1.75} />}
      noneLabel="No epic"
      shortcut="shift+p"
      {...props}
    />
  )
}

// The ticket aside's Planning section, as the app lays it out.
export function PlanningSection({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <section className="flex w-64 max-w-full flex-col gap-1.5">
      <h3 className="text-caption text-muted-foreground">Planning</h3>
      <div className="-ml-2.5 flex flex-col items-start gap-1">{children}</div>
    </section>
  )
}
