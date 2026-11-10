import type { JiraMigrationRequirements } from "@pp/shared"
import { Plus } from "lucide-react"
import { createElement } from "react"

import { Button } from "@/components/ui/button"
import { Select, SelectTrigger } from "@/components/ui/select"
import { useRowFilter } from "@/features/jira/hooks/useRowFilter"
import type { JiraImportSetup, StatusChoice } from "@/features/jira/lib/draft"
import { formatCount } from "@/features/jira/lib/format"
import { jiraCategoryLabel } from "@/features/jira/lib/sections"
import {
  byImpact,
  filterRowIndexes,
  jiraStatusesToKeep,
  keepJiraStatuses,
  statusNeedsAttention,
  type JiraSetupCounts
} from "@/features/jira/lib/setup"
import { getStatusIcon } from "@/features/statuses/lib/statusIcons"
import { m } from "@/paraglide/messages"

import { MappingTable, MappingTableRow, OptionLabel } from "./MappingTable"
import type { JiraImportForm } from "./opts"
import { SectionToolbar } from "./SectionToolbar"
import { SetupSection } from "./SetupSection"

const createValue = "__create_status__"

export function StatusesSection({
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
  const statuses = counts.statuses
  const { filter, setFilter, pinned } = useRowFilter(
    setup.statuses.length,
    (index) => {
      const choice = setup.statuses[index]
      return choice !== undefined && statusNeedsAttention(choice)
    }
  )
  const keepable = jiraStatusesToKeep(setup.statuses, requirements)
  const rows = byImpact(
    filterRowIndexes(
      requirements.statuses.length,
      filter,
      (index) => [
        requirements.statuses[index]?.name,
        jiraCategoryLabel(requirements.statuses[index]?.categoryKey ?? null)
      ],
      pinned
    ),
    (index) => requirements.statuses[index]?.issueCount
  )
  const counted = requirements.statuses.some(
    (status) => status.issueCount !== undefined
  )

  return (
    <SetupSection
      section="statuses"
      counts={counts}
      setup={setup}
      description={m.jira_import_statuses_description()}
      open={open}
      onToggle={onToggle}
    >
      <SectionToolbar
        filter={filter}
        onFilter={setFilter}
        attention={statuses.attention}
        searchLabel={m.jira_import_statuses_search()}
      >
        {keepable > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              form.setFieldValue(
                "setup.statuses",
                keepJiraStatuses(setup.statuses, requirements)
              )
              commit()
            }}
          >
            {m.jira_import_statuses_keep_jira()}
          </Button>
        ) : null}
      </SectionToolbar>
      <MappingTable
        sourceLabel={m.jira_import_statuses_column_jira()}
        targetLabel={m.jira_import_statuses_column_target()}
        countLabel={counted ? m.jira_import_column_tickets() : undefined}
        empty={rows.length === 0}
      >
        {rows.map((index) => {
          const status = requirements.statuses[index]
          if (status === undefined) return null
          return (
            <form.Field
              key={status.jiraStatusId}
              name={`setup.statuses[${index}]`}
            >
              {(field) => (
                <MappingTableRow
                  attention={statusNeedsAttention(field.value)}
                  name={status.name}
                  context={jiraCategoryLabel(status.categoryKey)}
                  count={counted ? formatCount(status.issueCount) : undefined}
                >
                  <StatusChoiceSelect
                    status={status}
                    options={requirements.statusOptions}
                    choice={field.value}
                    onChange={(next) => {
                      field.handleChange(next)
                      commit()
                    }}
                  />
                </MappingTableRow>
              )}
            </form.Field>
          )
        })}
      </MappingTable>
    </SetupSection>
  )
}

function StatusChoiceSelect({
  status,
  options,
  choice,
  onChange
}: Readonly<{
  status: JiraMigrationRequirements["statuses"][number]
  options: JiraMigrationRequirements["statusOptions"]
  choice: StatusChoice
  onChange: (choice: StatusChoice) => void
}>) {
  const creating = choice.createStatus === true
  const selected = options.find(
    (option) => option.slug === choice.projectStatusSlug
  )
  const createLabel =
    status.createOption === null
      ? null
      : m.jira_import_statuses_create({ status: status.createOption.label })
  return (
    <Select
      size="compact"
      value={creating ? createValue : (choice.projectStatusSlug ?? null)}
      onValueChange={(value) => {
        if (value === createValue && status.createOption !== null) {
          onChange({
            jiraStatusId: choice.jiraStatusId,
            projectStatusSlug: status.createOption.slug,
            createStatus: true
          })
          return
        }
        const option = options.find((candidate) => candidate.slug === value)
        if (option)
          onChange({
            jiraStatusId: choice.jiraStatusId,
            projectStatusSlug: option.slug
          })
      }}
      items={[
        ...options.map((option, index) => ({
          value: option.slug,
          textValue: option.label,
          separated: createLabel !== null && index === options.length - 1,
          label: (
            <OptionLabel icon={<StatusGlyph icon={option.icon} />}>
              {option.label}
            </OptionLabel>
          )
        })),
        ...(createLabel === null
          ? []
          : [
              {
                value: createValue,
                textValue: createLabel,
                label: (
                  <OptionLabel
                    icon={<Plus className="size-3.5" strokeWidth={1.75} />}
                  >
                    {createLabel}
                  </OptionLabel>
                )
              }
            ])
      ]}
    >
      <SelectTrigger
        size="compact"
        aria-label={status.name}
        placeholder={m.jira_import_choose()}
        className="w-full"
        selectedLabel={
          creating && createLabel !== null ? (
            <OptionLabel
              icon={<Plus className="size-3.5" strokeWidth={1.75} />}
            >
              {createLabel}
            </OptionLabel>
          ) : selected ? (
            <OptionLabel icon={<StatusGlyph icon={selected.icon} />}>
              {selected.label}
            </OptionLabel>
          ) : undefined
        }
      />
    </Select>
  )
}

function StatusGlyph({ icon }: Readonly<{ icon: string }>) {
  return createElement(getStatusIcon(icon), {
    className: "size-3.5",
    strokeWidth: 1.75
  })
}
