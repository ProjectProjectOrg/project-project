import type { ReactNode } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"

import { MappingLabel, MappingRow } from "./MappingRow"
import { StepFrame } from "./StepFrame"

type Option<V extends string> = Readonly<{ value: V; label: () => string }>

type Row<V extends string> = Readonly<{
  key: string
  name: string
  suggested: V
}>

type FieldSlot<V extends string> = Readonly<{
  value: V | undefined
  onChange: (value: V) => void
}>

/** A step that maps each Jira value (issue type, priority) onto one of a
 *  fixed set of project values. The caller owns the typed `form.Field`, so
 *  each step keeps its own field path; this renders everything around it. */
export function EnumMappingStep<V extends string>({
  title,
  description,
  rows,
  options,
  renderIcon,
  renderField,
  waiting,
  error,
  onBack,
  onNext
}: Readonly<{
  title: string
  description: string
  rows: ReadonlyArray<Row<V>>
  options: ReadonlyArray<Option<V>>
  renderIcon: (value: V) => ReactNode
  renderField: (
    index: number,
    render: (slot: FieldSlot<V>) => ReactNode
  ) => ReactNode
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}>) {
  const optionFor = (value: string | undefined) =>
    options.find((option) => option.value === value)

  return (
    <StepFrame
      title={title}
      description={description}
      waiting={waiting}
      error={error}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="divide-y divide-border">
        {rows.map((row, index) => (
          <MappingRow
            key={row.key}
            source={
              <MappingLabel icon={renderIcon(row.suggested)}>
                {row.name}
              </MappingLabel>
            }
          >
            {renderField(index, ({ value, onChange }) => {
              const selected = optionFor(value)
              return (
                <Select
                  value={value ?? ""}
                  onValueChange={(next) => {
                    const option = optionFor(next ?? undefined)
                    if (option) onChange(option.value)
                  }}
                >
                  <SelectTrigger
                    aria-label={row.name}
                    placeholder={title}
                    className="w-full"
                    selectedLabel={
                      selected ? (
                        <MappingLabel icon={renderIcon(selected.value)}>
                          {selected.label()}
                        </MappingLabel>
                      ) : undefined
                    }
                  />
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        aria-label={option.label()}
                      >
                        <MappingLabel icon={renderIcon(option.value)}>
                          {option.label()}
                        </MappingLabel>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            })}
          </MappingRow>
        ))}
      </div>
    </StepFrame>
  )
}
