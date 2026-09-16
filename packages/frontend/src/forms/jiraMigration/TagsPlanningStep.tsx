import type { JiraMigrationRequirements } from "@projectproject/shared"
import { Rows3, Tag } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
import { m } from "@/paraglide/messages"
import type { JiraMigrationForm } from "./opts"
import { MappingLabel, MappingRow } from "./MappingRow"
import { StepFrame } from "./StepFrame"

const backlogValue = "__backlog__"

export function TagsPlanningStep({
  form,
  requirements,
  waiting,
  error,
  onBack,
  onNext
}: StepProps) {
  return (
    <StepFrame
      title={m.jira_migration_planning_title()}
      description={m.jira_migration_planning_description()}
      waiting={waiting}
      error={error}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="space-y-7">
        {requirements.tags.length > 0 ? (
          <div className="divide-y divide-border">
            {requirements.tags.map((tag, index) => (
              <MappingRow
                key={`${tag.source.kind}:${tag.source.value}`}
                source={
                  <MappingLabel
                    icon={<Tag className="size-4" strokeWidth={1.75} />}
                  >
                    {tag.source.value}
                  </MappingLabel>
                }
                detail={tag.source.kind}
              >
                <form.Field name={`tags[${index}].destinationTagName`}>
                  {(field) => (
                    <Input
                      aria-label={m.jira_migration_tag_destination_label()}
                      value={field.value}
                      placeholder={m.jira_migration_tag_destination_label()}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.currentTarget.value)
                      }
                    />
                  )}
                </form.Field>
              </MappingRow>
            ))}
          </div>
        ) : null}

        {requirements.activeFutureSprintChoices.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold">
              {m.jira_migration_planning_conflicts_title()}
            </h3>
            <div className="mt-2 divide-y divide-border">
              {requirements.activeFutureSprintChoices.map((choice, index) => (
                <MappingRow
                  key={choice.jiraIssueId}
                  source={
                    <MappingLabel
                      icon={<Rows3 className="size-4" strokeWidth={1.75} />}
                    >
                      {choice.issueSummary}
                    </MappingLabel>
                  }
                  detail={choice.issueKey}
                >
                  <form.Field
                    name={`activeFutureSprintChoices[${index}].jiraSprintId`}
                  >
                    {(field) => (
                      <Select
                        value={
                          field.value === null
                            ? backlogValue
                            : (field.value ?? "")
                        }
                        onValueChange={(value) => {
                          if (value === backlogValue) {
                            field.handleChange(null)
                            return
                          }
                          const option = choice.options.find(
                            (candidate) => candidate.jiraSprintId === value
                          )
                          if (option) field.handleChange(option.jiraSprintId)
                        }}
                      >
                        <SelectTrigger
                          aria-label={choice.issueKey}
                          placeholder={m.jira_migration_planning_choose_sprint()}
                          className="w-full"
                          selectedLabel={
                            field.value === null
                              ? m.jira_migration_backlog()
                              : choice.options.find(
                                  (option) =>
                                    option.jiraSprintId === field.value
                                )?.name
                          }
                        />
                        <SelectContent>
                          <SelectItem value={backlogValue} index={0}>
                            {m.jira_migration_backlog()}
                          </SelectItem>
                          {choice.options.map((option, optionIndex) => (
                            <SelectItem
                              key={option.jiraSprintId}
                              value={option.jiraSprintId}
                              index={optionIndex + 1}
                            >
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </form.Field>
                </MappingRow>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </StepFrame>
  )
}

interface StepProps {
  form: JiraMigrationForm
  requirements: JiraMigrationRequirements
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}
