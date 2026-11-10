import type { JiraMigrationRequirements } from "@pp/shared"

import { Button } from "@/components/ui/button"
import { Select, SelectTrigger } from "@/components/ui/select"
import { useRowFilter } from "@/features/jira/hooks/useRowFilter"
import type { JiraImportSetup } from "@/features/jira/lib/draft"
import {
  filterRowIndexes,
  moveAllToBacklog,
  sprintNeedsAttention,
  type JiraSetupCounts
} from "@/features/jira/lib/setup"
import { m } from "@/paraglide/messages"

import { MappingTable, MappingTableRow } from "./MappingTable"
import type { JiraImportForm } from "./opts"
import { SectionToolbar } from "./SectionToolbar"
import { SetupSection } from "./SetupSection"

const backlogValue = "__backlog__"

export function SprintsSection({
  form,
  requirements,
  setup,
  counts,
  open,
  onToggle,
  commit
}: Readonly<{
  form: JiraImportForm
  requirements: JiraMigrationRequirements
  setup: JiraImportSetup
  counts: JiraSetupCounts
  open: boolean
  onToggle: () => void
  commit: () => void
}>) {
  const sprints = counts.sprints
  const choices = setup.activeFutureSprintChoices
  const { filter, setFilter, pinned } = useRowFilter(
    choices.length,
    (index) => {
      const choice = choices[index]
      return choice !== undefined && sprintNeedsAttention(choice)
    }
  )
  const rows = filterRowIndexes(
    requirements.activeFutureSprintChoices.length,
    filter,
    (index) => [
      requirements.activeFutureSprintChoices[index]?.issueKey,
      requirements.activeFutureSprintChoices[index]?.issueSummary
    ],
    pinned
  )

  return (
    <SetupSection
      section="sprints"
      counts={counts}
      setup={setup}
      description={m.jira_import_sprints_description()}
      open={open}
      onToggle={onToggle}
    >
      <SectionToolbar
        filter={filter}
        onFilter={setFilter}
        attention={sprints.attention}
        searchLabel={m.jira_import_sprints_search()}
      >
        {sprints.attention > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              form.setFieldValue(
                "setup.activeFutureSprintChoices",
                moveAllToBacklog(choices)
              )
              commit()
            }}
          >
            {m.jira_import_sprints_all_backlog()}
          </Button>
        ) : null}
      </SectionToolbar>
      <MappingTable
        sourceLabel={m.jira_import_sprints_column_jira()}
        targetLabel={m.jira_import_sprints_column_target()}
        empty={rows.length === 0}
      >
        {rows.map((index) => {
          const choice = requirements.activeFutureSprintChoices[index]
          if (choice === undefined) return null
          return (
            <form.Field
              key={choice.jiraIssueId}
              name={`setup.activeFutureSprintChoices[${index}].jiraSprintId`}
            >
              {(field) => (
                <MappingTableRow
                  attention={field.value === undefined}
                  name={choice.issueSummary}
                  context={choice.issueKey}
                >
                  <Select
                    size="compact"
                    value={
                      field.value === null
                        ? backlogValue
                        : (field.value ?? null)
                    }
                    onValueChange={(value) => {
                      const option = choice.options.find(
                        (candidate) => candidate.jiraSprintId === value
                      )
                      field.handleChange(
                        value === backlogValue
                          ? null
                          : (option?.jiraSprintId ?? field.value)
                      )
                      commit()
                    }}
                    items={[
                      {
                        value: backlogValue,
                        label: m.jira_import_sprints_backlog(),
                        separated: true
                      },
                      ...choice.options.map((option) => ({
                        value: option.jiraSprintId,
                        label:
                          option.state === "active"
                            ? m.jira_import_sprints_active({
                                name: option.name
                              })
                            : option.name
                      }))
                    ]}
                  >
                    <SelectTrigger
                      size="compact"
                      aria-label={choice.issueKey}
                      placeholder={m.jira_import_choose()}
                      className="w-full"
                      selectedLabel={
                        field.value === null
                          ? m.jira_import_sprints_backlog()
                          : choice.options.find(
                              (option) => option.jiraSprintId === field.value
                            )?.name
                      }
                    />
                  </Select>
                </MappingTableRow>
              )}
            </form.Field>
          )
        })}
      </MappingTable>
    </SetupSection>
  )
}
