import { useAtomValue } from "@effect/atom-react"
import {
  NO_TYPE_FILTER,
  type JiraMigrationDestinationConflict,
  type JiraMigrationDetail,
  type JiraMigrationRequirements,
  type TicketPriority,
  type TypeDefinition
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { blockIconComponent } from "@/features/editor/lib/blockIcons"
import {
  jiraDestinationConflicts,
  jiraDestinationConflictsRequest
} from "@/features/jira/atoms/jiraMigration"
import { StepFrame } from "@/features/jira/components/StepFrame"
import type { JiraImportDraftSave } from "@/features/jira/hooks/useJiraImportDraft"
import { useSyncDraftOnOpen } from "@/features/jira/hooks/useSyncDraftOnOpen"
import { conflictingFields } from "@/features/jira/lib/destination"
import type { JiraImportDraft } from "@/features/jira/lib/draft"
import {
  jiraSetupCounts,
  jiraSetupSectionId,
  sectionAttention,
  visibleSetupSections,
  type JiraSetupCounts,
  type JiraSetupSection
} from "@/features/jira/lib/setup"
import { NoTypeIcon } from "@/features/tickets/components/TypeGlyph"
import { PRIORITY_META } from "@/features/tickets/lib/priorityMeta"
import { useOrgActor } from "@/hooks/useActor"
import { useFormValues } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { DestinationSection } from "./DestinationSection"
import { EnumSection, type EnumOption } from "./EnumSection"
import { setupSchema, validateStep, type JiraImportForm } from "./opts"
import { PeopleSection } from "./PeopleSection"
import { SaveStatus } from "./SaveStatus"
import { SprintsSection } from "./SprintsSection"
import { StatusesSection } from "./StatusesSection"
import { TagsSection } from "./TagsSection"

const typeOptionsOf = (
  types: ReadonlyArray<TypeDefinition>
): ReadonlyArray<EnumOption<string>> => [
  ...types.map((type) => ({
    value: type.key,
    label: () => type.name,
    icon: blockIconComponent(type.icon)
  })),
  { value: NO_TYPE_FILTER, label: m.jira_import_type_none, icon: NoTypeIcon }
]

const typeOptionOf = (type: string | null | undefined): string | undefined =>
  type === null ? NO_TYPE_FILTER : type

const typeOfOption = (value: string): string | null =>
  value === NO_TYPE_FILTER ? null : value

const priorityOptions: ReadonlyArray<EnumOption<TicketPriority>> = [
  {
    value: "high",
    label: m.jira_import_priority_high,
    icon: PRIORITY_META.high.icon
  },
  {
    value: "med",
    label: m.jira_import_priority_medium,
    icon: PRIORITY_META.med.icon
  },
  {
    value: "low",
    label: m.jira_import_priority_low,
    icon: PRIORITY_META.low.icon
  }
]

const scrollToSection = (section: JiraSetupSection) =>
  document
    .getElementById(jiraSetupSectionId(section))
    ?.scrollIntoView({ block: "start", behavior: "smooth" })

export function SetupStep({
  form,
  orgSlug,
  detail,
  requirements,
  types,
  draft,
  focusSection,
  onFocusSection,
  onBack,
  onContinue,
  onReload,
  returnPath
}: Readonly<{
  form: JiraImportForm
  orgSlug: string
  detail: JiraMigrationDetail
  requirements: JiraMigrationRequirements
  types: ReadonlyArray<TypeDefinition>
  draft: JiraImportDraftSave
  focusSection: JiraSetupSection | undefined
  onFocusSection: (section: JiraSetupSection | undefined) => void
  onBack: () => void
  onContinue: () => void
  onReload: () => void
  returnPath: string
}>) {
  const values = useFormValues(form)
  const canInvite = useOrgActor(orgSlug).call("org", "inviteMember")
  const conflictsResult = useAtomValue(
    jiraDestinationConflicts(
      jiraDestinationConflictsRequest(orgSlug, detail.id, detail.revision)
    )
  )
  const conflicts = AsyncResult.isSuccess(conflictsResult)
    ? conflictsResult.value
    : []
  const counts = jiraSetupCounts(
    values.setup,
    requirements,
    conflictingFields(conflicts)
  )
  const sections = visibleSetupSections(requirements)
  const [typeOptions] = useState(() => typeOptionsOf(types))
  const [validator] = useState(() =>
    Schema.toStandardSchemaV1(setupSchema(requirements))
  )
  const [openSections, setOpenSections] = useState<
    ReadonlySet<JiraSetupSection>
  >(
    () =>
      new Set([
        ...sections.filter((section) => sectionAttention(counts, section) > 0),
        ...(focusSection === undefined ? [] : [focusSection])
      ])
  )
  const [continueWhenSaved, setContinueWhenSaved] = useState(false)
  const { saving, failure } = draft
  useEffect(() => {
    if (continueWhenSaved && !saving && failure === null) onContinue()
  }, [continueWhenSaved, saving, failure, onContinue])
  const [initialFocus] = useState(focusSection)
  useEffect(() => {
    if (initialFocus !== undefined) scrollToSection(initialFocus)
  }, [initialFocus])

  const commit = () => draft.persist(form.state.values)
  useSyncDraftOnOpen(form, detail.configuration, draft.persist)
  const [destinationDismissed, setDestinationDismissed] = useState(false)
  const [destinationFlagged, setDestinationFlagged] = useState(false)
  if (counts.destination.attention > 0 && !destinationFlagged)
    setDestinationFlagged(true)
  const isOpen = (section: JiraSetupSection) =>
    openSections.has(section) ||
    (section === "destination" && destinationFlagged && !destinationDismissed)
  const toggle = (section: JiraSetupSection) => {
    const opening = !isOpen(section)
    if (section === "destination") setDestinationDismissed(!opening)
    setOpenSections((previous) => {
      const next = new Set(previous)
      if (opening) next.add(section)
      else next.delete(section)
      return next
    })
    onFocusSection(opening ? section : undefined)
  }
  const revealAttention = () => {
    const needing = sections.filter(
      (section) => sectionAttention(counts, section) > 0
    )
    setOpenSections((previous) => new Set([...previous, ...needing]))
    const first = needing[0]
    if (first !== undefined) scrollToSection(first)
  }

  return (
    <form.FormGroup
      name="setup"
      validators={[validateStep(validator)]}
      onSubmit={() => {
        if (counts.destination.attention > 0) revealAttention()
        else setContinueWhenSaved(true)
      }}
      onSubmitInvalid={revealAttention}
    >
      {(group) => (
        <StepFrame
          title={m.jira_import_setup_title()}
          description={m.jira_import_setup_description()}
          animateHeight={false}
          start={
            <Button variant="ghost" bleed="start" onClick={onBack}>
              {m.jira_import_action_back()}
            </Button>
          }
          end={
            <>
              <SaveStatus
                draft={draft}
                onReload={onReload}
                returnPath={returnPath}
              />
              <Button
                disabled={draft.failure !== null}
                loading={continueWhenSaved}
                onClick={() => void group.handleSubmit()}
              >
                {m.jira_import_action_to_review()}
              </Button>
            </>
          }
        >
          <div className="flex flex-col">
            {sections.map((section) => (
              <SetupSectionView
                key={section}
                section={section}
                form={form}
                requirements={requirements}
                typeOptions={typeOptions}
                values={values}
                counts={counts}
                canInvite={canInvite}
                conflicts={conflicts}
                checking={
                  AsyncResult.isInitial(conflictsResult) ||
                  conflictsResult.waiting
                }
                open={isOpen(section)}
                onToggle={() => toggle(section)}
                commit={commit}
              />
            ))}
          </div>
        </StepFrame>
      )}
    </form.FormGroup>
  )
}

function SetupSectionView({
  section,
  form,
  requirements,
  typeOptions,
  values,
  counts,
  canInvite,
  conflicts,
  checking,
  open,
  onToggle,
  commit
}: Readonly<{
  section: JiraSetupSection
  form: JiraImportForm
  requirements: JiraMigrationRequirements
  typeOptions: ReadonlyArray<EnumOption<string>>
  values: JiraImportDraft
  counts: JiraSetupCounts
  canInvite: boolean
  conflicts: ReadonlyArray<JiraMigrationDestinationConflict>
  checking: boolean
  open: boolean
  onToggle: () => void
  commit: () => void
}>) {
  const common = {
    form,
    requirements,
    setup: values.setup,
    counts,
    open,
    onToggle,
    commit
  }
  switch (section) {
    case "people":
      return <PeopleSection {...common} canInvite={canInvite} />
    case "statuses":
      return <StatusesSection {...common} />
    case "types":
      return (
        <EnumSection
          {...common}
          section="types"
          description={m.jira_import_types_description()}
          searchLabel={m.jira_import_types_search()}
          sourceLabel={m.jira_import_types_column_jira()}
          targetLabel={m.jira_import_types_column_target()}
          options={typeOptions}
          rows={requirements.issueTypes.map((issueType, index) => ({
            key: issueType.jiraIssueTypeId,
            name: issueType.name,
            context: issueType.isSubtask ? m.jira_import_types_subtask() : null,
            count: issueType.issueCount,
            value: typeOptionOf(values.setup.issueTypes[index]?.projectType)
          }))}
          cell={(index, control) => (
            <form.Field name={`setup.issueTypes[${index}].projectType`}>
              {(field) =>
                control(typeOptionOf(field.value), (next) => {
                  field.handleChange(typeOfOption(next))
                  commit()
                })
              }
            </form.Field>
          )}
        />
      )
    case "priorities":
      return (
        <EnumSection
          {...common}
          section="priorities"
          description={m.jira_import_priorities_description()}
          searchLabel={m.jira_import_priorities_search()}
          sourceLabel={m.jira_import_priorities_column_jira()}
          targetLabel={m.jira_import_priorities_column_target()}
          options={priorityOptions}
          rows={requirements.priorities.map((priority, index) => ({
            key: priority.jiraPriorityId,
            name: priority.name,
            count: priority.issueCount,
            value: values.setup.priorities[index]?.projectPriority
          }))}
          cell={(index, control) => (
            <form.Field name={`setup.priorities[${index}].projectPriority`}>
              {(field) =>
                control(field.value, (next) => {
                  field.handleChange(next)
                  commit()
                })
              }
            </form.Field>
          )}
        />
      )
    case "tags":
      return <TagsSection {...common} />
    case "sprints":
      return <SprintsSection {...common} />
    default:
      return (
        <DestinationSection
          {...common}
          conflicts={conflicts}
          checking={checking}
        />
      )
  }
}
