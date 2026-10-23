import type { JiraMigrationRequirements } from "@pp/shared"
import { CircleHelp } from "lucide-react"
import { createElement } from "react"

import { Select, SelectTrigger } from "@/components/ui/select"
import { getStatusIcon } from "@/lib/status-icons"
import { m } from "@/paraglide/messages"

import { MappingLabel, MappingRow } from "./MappingRow"
import type { JiraMigrationForm } from "./opts"
import { StepFrame } from "./StepFrame"

const createStatusValue = "__create_status__"

export function StatusStep({
  form,
  requirements,
  waiting,
  error,
  onBack,
  onNext
}: StepProps) {
  return (
    <StepFrame
      title={m.jira_migration_status_title()}
      description={m.jira_migration_status_description()}
      waiting={waiting}
      error={error}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="divide-y divide-border">
        {requirements.statuses.map((status, index) => (
          <MappingRow
            key={status.jiraStatusId}
            source={<MappingLabel>{status.name}</MappingLabel>}
          >
            <form.Field name={`statuses[${index}]`}>
              {(field) => {
                const selected = requirements.statusOptions.find(
                  (option) => option.slug === field.value.projectStatusSlug
                )
                const creating = field.value.createStatus === true
                return (
                  <div className="grid min-w-0 gap-1.5">
                    <Select
                      value={
                        creating
                          ? createStatusValue
                          : (field.value.projectStatusSlug ?? null)
                      }
                      onValueChange={(value) => {
                        if (
                          value === createStatusValue &&
                          status.createOption
                        ) {
                          field.handleChange({
                            jiraStatusId: field.value.jiraStatusId,
                            projectStatusSlug: status.createOption.slug,
                            createStatus: true
                          })
                          return
                        }
                        const option = requirements.statusOptions.find(
                          (candidate) => candidate.slug === value
                        )
                        if (option) {
                          field.handleChange({
                            jiraStatusId: field.value.jiraStatusId,
                            projectStatusSlug: option.slug,
                            createStatus: undefined
                          })
                        }
                      }}
                      items={[
                        ...requirements.statusOptions.map((option) => ({
                          value: option.slug,
                          textValue: option.label,
                          label: <StatusOptionLabel option={option} wrap />
                        })),
                        ...(status.createOption
                          ? [
                              {
                                value: createStatusValue,
                                textValue: m.jira_migration_status_create({
                                  status: status.createOption.label
                                }),
                                label: (
                                  <CreateStatusOptionLabel
                                    option={status.createOption}
                                    wrap
                                  />
                                )
                              }
                            ]
                          : [])
                      ]}
                      contentProps={{
                        className: "max-w-[min(24rem,calc(100vw-1rem))]"
                      }}
                    >
                      <SelectTrigger
                        aria-label={status.name}
                        placeholder={m.jira_migration_status_title()}
                        className="w-full"
                        selectedLabel={
                          creating && status.createOption ? (
                            <CreateStatusOptionLabel
                              option={status.createOption}
                            />
                          ) : selected ? (
                            <StatusOptionLabel option={selected} />
                          ) : undefined
                        }
                      />
                    </Select>
                    {creating && status.categoryKey === "done" ? (
                      <p className="text-xs leading-5 text-state-warning">
                        {m.jira_migration_status_create_done_warning()}
                      </p>
                    ) : null}
                  </div>
                )
              }}
            </form.Field>
          </MappingRow>
        ))}
      </div>
    </StepFrame>
  )
}

type JiraSourceStatus = JiraMigrationRequirements["statuses"][number]
type JiraStatusVisual =
  | JiraMigrationRequirements["statusOptions"][number]
  | NonNullable<JiraSourceStatus["createOption"]>

function StatusOptionLabel({
  option,
  label = option.label,
  wrap = false
}: {
  option: JiraStatusVisual
  label?: string
  wrap?: boolean
}) {
  return (
    <MappingLabel
      wrap={wrap}
      icon={
        <NativeStatusIcon
          icon={option.icon}
          className="size-4"
          color={option.color}
        />
      }
    >
      {label}
    </MappingLabel>
  )
}

function CreateStatusOptionLabel({
  option,
  wrap = false
}: {
  option: JiraStatusVisual
  wrap?: boolean
}) {
  return (
    <MappingLabel
      wrap={wrap}
      icon={
        <CircleHelp
          className="size-4"
          strokeWidth={1.75}
          style={{ color: option.color }}
        />
      }
    >
      {m.jira_migration_status_create({ status: option.label })}
    </MappingLabel>
  )
}

function NativeStatusIcon({
  icon,
  color,
  className
}: {
  icon: string
  color: string
  className: string
}) {
  return createElement(getStatusIcon(icon), {
    className,
    strokeWidth: 1.75,
    style: { color }
  })
}

type StepProps = Readonly<{
  form: JiraMigrationForm
  requirements: JiraMigrationRequirements
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}>
