import type { JiraMigrationRequirements } from "@projectproject/shared"
import { createElement } from "react"
import { CheckCircle2, CircleDashed, CircleDot } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
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
            source={
              <MappingLabel icon={<SourceStatusIcon status={status} />}>
                {status.name}
              </MappingLabel>
            }
          >
            <form.Field name={`statuses[${index}]`}>
              {(field) => {
                const selected = requirements.statusOptions.find(
                  (option) => option.slug === field.value.projectStatusSlug
                )
                const creating = field.value.createStatus === true
                return (
                  <div className="grid gap-1.5">
                    <Select
                      value={
                        creating
                          ? createStatusValue
                          : (field.value.projectStatusSlug ?? "")
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
                    >
                      <SelectTrigger
                        aria-label={status.name}
                        placeholder={m.jira_migration_status_title()}
                        className="w-full"
                        selectedLabel={
                          creating && status.createOption ? (
                            <StatusOptionLabel
                              option={status.createOption}
                              label={m.jira_migration_status_create({
                                status: status.createOption.label
                              })}
                            />
                          ) : selected ? (
                            <StatusOptionLabel option={selected} />
                          ) : undefined
                        }
                      />
                      <SelectContent>
                        {requirements.statusOptions.map(
                          (option, optionIndex) => (
                            <SelectItem
                              key={option.slug}
                              value={option.slug}
                              index={optionIndex}
                              aria-label={option.label}
                            >
                              <StatusOptionLabel option={option} />
                            </SelectItem>
                          )
                        )}
                        {status.createOption ? (
                          <SelectItem
                            value={createStatusValue}
                            index={requirements.statusOptions.length}
                            aria-label={m.jira_migration_status_create({
                              status: status.createOption.label
                            })}
                          >
                            <StatusOptionLabel
                              option={status.createOption}
                              label={m.jira_migration_status_create({
                                status: status.createOption.label
                              })}
                            />
                          </SelectItem>
                        ) : null}
                      </SelectContent>
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
  label = option.label
}: {
  option: JiraStatusVisual
  label?: string
}) {
  return (
    <MappingLabel
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

function SourceStatusIcon({ status }: { status: JiraSourceStatus }) {
  if (status.createOption) {
    return (
      <NativeStatusIcon
        icon={status.createOption.icon}
        className="size-4"
        color={status.createOption.color}
      />
    )
  }

  const { categoryKey: category } = status
  const Icon =
    category === "done"
      ? CheckCircle2
      : category === "indeterminate"
        ? CircleDot
        : CircleDashed
  const className =
    category === "done"
      ? "text-state-success"
      : category === "indeterminate"
        ? "text-state-info"
        : "text-muted-foreground"
  return <Icon className={`size-4 ${className}`} strokeWidth={1.75} />
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

interface StepProps {
  form: JiraMigrationForm
  requirements: JiraMigrationRequirements
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}
