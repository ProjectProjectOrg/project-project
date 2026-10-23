import type { ReactNode } from "react"

import { Select, SelectTrigger } from "@/components/ui/select"

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
                  value={value ?? null}
                  onValueChange={onChange}
                  items={options.map((option) => ({
                    value: option.value,
                    textValue: option.label(),
                    label: (
                      <MappingLabel icon={renderIcon(option.value)}>
                        {option.label()}
                      </MappingLabel>
                    )
                  }))}
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
                </Select>
              )
            })}
          </MappingRow>
        ))}
      </div>
    </StepFrame>
  )
}
