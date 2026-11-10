import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Select, SelectTrigger } from "@/components/ui/select"
import { useRowFilter } from "@/features/jira/hooks/useRowFilter"
import type { JiraImportSetup } from "@/features/jira/lib/draft"
import { formatCount } from "@/features/jira/lib/format"
import {
  byImpact,
  filterRowIndexes,
  type JiraSetupCounts
} from "@/features/jira/lib/setup"
import { m } from "@/paraglide/messages"

import { MappingTable, MappingTableRow, OptionLabel } from "./MappingTable"
import { SectionToolbar } from "./SectionToolbar"
import { SetupSection } from "./SetupSection"

export type EnumOption<V extends string> = Readonly<{
  value: V
  label: () => string
  icon: LucideIcon
}>

export type EnumRow<V extends string> = Readonly<{
  key: string
  name: string
  context?: string | null
  count?: number
  value: V | undefined
}>

export type EnumControl<V extends string> = (
  value: V | undefined,
  onChange: (value: V) => void
) => ReactNode

export function EnumSection<V extends string>({
  section,
  counts,
  setup,
  description,
  searchLabel,
  sourceLabel,
  targetLabel,
  rows,
  options,
  open,
  onToggle,
  cell
}: Readonly<{
  section: "types" | "priorities"
  counts: JiraSetupCounts
  setup: JiraImportSetup
  description: string
  searchLabel: string
  sourceLabel: string
  targetLabel: string
  rows: ReadonlyArray<EnumRow<V>>
  options: ReadonlyArray<EnumOption<V>>
  open: boolean
  onToggle: () => void
  cell: (index: number, control: EnumControl<V>) => ReactNode
}>) {
  const attention = counts[section].attention
  const { filter, setFilter, pinned } = useRowFilter(
    rows.length,
    (index) => rows[index]?.value === undefined
  )
  const searchable = rows.length > 8
  const visible = byImpact(
    filterRowIndexes(
      rows.length,
      searchable ? filter : { query: "", attentionOnly: false },
      (index) => [rows[index]?.name, rows[index]?.context],
      pinned
    ),
    (index) => rows[index]?.count
  )
  const counted = rows.some((row) => row.count !== undefined)
  return (
    <SetupSection
      section={section}
      counts={counts}
      setup={setup}
      description={description}
      open={open}
      onToggle={onToggle}
    >
      {searchable ? (
        <SectionToolbar
          filter={filter}
          onFilter={setFilter}
          attention={attention}
          searchLabel={searchLabel}
        />
      ) : null}
      <MappingTable
        sourceLabel={sourceLabel}
        targetLabel={targetLabel}
        countLabel={counted ? m.jira_import_column_tickets() : undefined}
        empty={visible.length === 0}
      >
        {visible.map((index) => {
          const row = rows[index]
          if (row === undefined) return null
          return (
            <MappingTableRow
              key={row.key}
              attention={row.value === undefined}
              name={row.name}
              context={row.context}
              count={counted ? formatCount(row.count) : undefined}
            >
              {cell(index, (value, onChange) => (
                <EnumSelect
                  name={row.name}
                  value={value}
                  options={options}
                  onChange={onChange}
                />
              ))}
            </MappingTableRow>
          )
        })}
      </MappingTable>
    </SetupSection>
  )
}

function EnumSelect<V extends string>({
  name,
  value,
  options,
  onChange
}: Readonly<{
  name: string
  value: V | undefined
  options: ReadonlyArray<EnumOption<V>>
  onChange: (value: V) => void
}>) {
  const selected = options.find((option) => option.value === value)
  return (
    <Select
      size="compact"
      value={value ?? null}
      onValueChange={onChange}
      items={options.map((option) => ({
        value: option.value,
        textValue: option.label(),
        label: (
          <OptionLabel
            icon={<option.icon className="size-3.5" strokeWidth={1.75} />}
          >
            {option.label()}
          </OptionLabel>
        )
      }))}
    >
      <SelectTrigger
        size="compact"
        aria-label={name}
        placeholder={m.jira_import_choose()}
        className="w-full"
        selectedLabel={
          selected ? (
            <OptionLabel
              icon={<selected.icon className="size-3.5" strokeWidth={1.75} />}
            >
              {selected.label()}
            </OptionLabel>
          ) : undefined
        }
      />
    </Select>
  )
}
