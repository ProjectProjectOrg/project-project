import type { JiraMigrationRequirements } from "@pp/shared"
import { Mail, UserPlus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  type SelectOption
} from "@/components/ui/select"
import { useRowFilter } from "@/features/jira/hooks/useRowFilter"
import type { JiraImportSetup } from "@/features/jira/lib/draft"
import {
  applyPeopleSelection,
  changedCount,
  hasActivity,
  invitedEmails,
  inviteValue,
  NEW_INVITE_VALUE,
  peopleSelectValue,
  personActivity,
  type PeopleChoice,
  UNLINKED_VALUE
} from "@/features/jira/lib/people"
import {
  byImpact,
  filterRowIndexes,
  inviteEveryoneWithEmail,
  leaveRestUnlinked,
  linkAllSuggested,
  personNeedsAttention,
  type JiraSetupCounts
} from "@/features/jira/lib/setup"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { m } from "@/paraglide/messages"

import { MappingTable, MappingTableRow, OptionLabel } from "./MappingTable"
import type { JiraImportForm } from "./opts"
import { SectionToolbar } from "./SectionToolbar"
import { SetupSection } from "./SetupSection"

export function PeopleSection({
  form,
  requirements,
  setup,
  counts,
  canInvite,
  open,
  onToggle,
  commit
}: Readonly<{
  form: JiraImportForm
  requirements: JiraMigrationRequirements
  setup: JiraImportSetup
  counts: JiraSetupCounts
  canInvite: boolean
  open: boolean
  onToggle: () => void
  commit: () => void
}>) {
  const people = counts.people
  const identities = setup.identities
  const { filter, setFilter, pinned } = useRowFilter(
    identities.length,
    (index) => {
      const choice = identities[index]
      return choice !== undefined && personNeedsAttention(choice)
    }
  )
  const invitees = invitedEmails(identities)
  const items = personItems(requirements.identityOptions, invitees, canInvite)
  const rows = byImpact(
    filterRowIndexes(
      requirements.identities.length,
      filter,
      (index) => [
        requirements.identities[index]?.displayName,
        requirements.identities[index]?.email
      ],
      pinned
    ),
    (index) => personActivity(requirements.identities[index])
  )
  const suggested = linkAllSuggested(identities, requirements)
  const invited = inviteEveryoneWithEmail(identities, requirements)
  const inviteCount = changedCount(identities, invited)
  const suggestedCount = changedCount(identities, suggested)
  const activity = hasActivity(requirements)
  const replace = (next: ReadonlyArray<PeopleChoice>) => {
    form.setFieldValue("setup.identities", next)
    commit()
  }

  return (
    <SetupSection
      section="people"
      counts={counts}
      setup={setup}
      description={m.jira_import_people_description()}
      open={open}
      onToggle={onToggle}
    >
      <SectionToolbar
        filter={filter}
        onFilter={setFilter}
        attention={people.attention}
        searchLabel={m.jira_import_people_search()}
      >
        <ConfirmButton.Root className="gap-1">
          <ConfirmButton.Idle>
            {suggestedCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => replace(suggested)}
              >
                {m.jira_import_people_link_suggested({
                  count: suggestedCount
                })}
              </Button>
            ) : null}
          </ConfirmButton.Idle>
          {canInvite && inviteCount > 0 ? (
            <ConfirmButton.Trigger variant="ghost" size="sm">
              {m.jira_import_people_invite_all({ count: inviteCount })}
            </ConfirmButton.Trigger>
          ) : null}
          <ConfirmButton.Idle>
            {people.attention > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => replace(leaveRestUnlinked(identities))}
              >
                {m.jira_import_people_leave_rest()}
              </Button>
            ) : null}
          </ConfirmButton.Idle>
          <ConfirmButton.Confirm>
            <ConfirmButton.Action
              tone="neutral"
              prompt={m.jira_import_people_invite_all_prompt({
                count: inviteCount
              })}
              label={m.jira_import_people_invite_all_confirm({
                count: inviteCount
              })}
              onConfirm={() => replace(invited)}
            />
          </ConfirmButton.Confirm>
        </ConfirmButton.Root>
      </SectionToolbar>
      <MappingTable
        sourceLabel={m.jira_import_people_column_jira()}
        targetLabel={m.jira_import_people_column_target()}
        countLabel={activity ? m.jira_import_column_activity() : undefined}
        empty={rows.length === 0}
      >
        {rows.map((index) => {
          const identity = requirements.identities[index]
          if (identity === undefined) return null
          return (
            <form.Field
              key={identity.jiraAccountId}
              name={`setup.identities[${index}]`}
            >
              {(field) => (
                <MappingTableRow
                  attention={personNeedsAttention(field.value)}
                  name={identity.displayName}
                  context={identity.email}
                  count={
                    activity
                      ? m.jira_import_people_activity({
                          tickets:
                            (identity.assignedIssueCount ?? 0) +
                            (identity.reportedIssueCount ?? 0),
                          comments: identity.commentCount ?? 0
                        })
                      : undefined
                  }
                  countTitle={m.jira_import_people_activity_title({
                    assigned: identity.assignedIssueCount ?? 0,
                    reported: identity.reportedIssueCount ?? 0,
                    comments: identity.commentCount ?? 0
                  })}
                >
                  <PersonChoice
                    identity={identity}
                    options={requirements.identityOptions}
                    items={items}
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

function personItems(
  options: JiraMigrationRequirements["identityOptions"],
  invitees: ReadonlyArray<string>,
  canInvite: boolean
): ReadonlyArray<SelectOption<string>> {
  return [
    { value: UNLINKED_VALUE, label: m.jira_import_people_unlinked() },
    ...(canInvite
      ? [
          {
            value: NEW_INVITE_VALUE,
            textValue: m.jira_import_people_invite(),
            label: (
              <OptionLabel icon={<UserPlus className="size-4" />}>
                {m.jira_import_people_invite()}
              </OptionLabel>
            )
          }
        ]
      : []),
    ...invitees.map((email, index) => ({
      value: inviteValue(email),
      textValue: email,
      separated: index === 0,
      label: <InviteeLabel email={email} />
    })),
    ...options.map((option, index) => ({
      value: option.id,
      textValue: option.name,
      separated: index === 0,
      label: (
        <OptionLabel
          icon={
            <MemberAvatar
              member={{
                id: option.id,
                name: option.name,
                email: option.email,
                image: option.imageUrl
              }}
              size={16}
            />
          }
        >
          {option.name}
        </OptionLabel>
      )
    }))
  ]
}

function PersonChoice({
  identity,
  options,
  items,
  choice,
  onChange
}: Readonly<{
  identity: JiraMigrationRequirements["identities"][number]
  options: JiraMigrationRequirements["identityOptions"]
  items: ReadonlyArray<SelectOption<string>>
  choice: PeopleChoice
  onChange: (choice: PeopleChoice) => void
}>) {
  const [editingInvite, setEditingInvite] = useState(false)
  const value = peopleSelectValue(choice)
  const selected = options.find(
    (option) => option.id === choice.projectProjectUserId
  )
  const showInput = value === NEW_INVITE_VALUE || editingInvite
  if (showInput)
    return (
      <Input
        variant="compact"
        type="email"
        autoFocus
        aria-label={m.jira_import_people_invite_email_label({
          name: identity.displayName
        })}
        aria-invalid={value === NEW_INVITE_VALUE && !editingInvite}
        placeholder={m.jira_import_people_invite_placeholder()}
        value={choice.inviteEmail ?? ""}
        onChange={(event) =>
          onChange({ ...choice, inviteEmail: event.currentTarget.value })
        }
        onFocus={() => setEditingInvite(true)}
        onBlur={() => setEditingInvite(false)}
      />
    )
  return (
    <Select
      size="compact"
      value={value}
      onValueChange={(next) => {
        const updated = applyPeopleSelection(choice, next)
        const creating = next === NEW_INVITE_VALUE
        setEditingInvite(creating)
        onChange(
          creating && identity.email
            ? { ...updated, inviteEmail: identity.email }
            : updated
        )
      }}
      items={items}
    >
      <SelectTrigger
        size="compact"
        aria-label={identity.displayName}
        placeholder={m.jira_import_choose()}
        className="w-full"
        selectedLabel={
          value === UNLINKED_VALUE ? (
            m.jira_import_people_unlinked()
          ) : choice.inviteEmail !== undefined ? (
            <InviteeLabel email={choice.inviteEmail.trim().toLowerCase()} />
          ) : selected ? (
            <OptionLabel
              icon={
                <MemberAvatar
                  member={{
                    id: selected.id,
                    name: selected.name,
                    email: selected.email,
                    image: selected.imageUrl
                  }}
                  size={16}
                />
              }
            >
              {selected.name}
            </OptionLabel>
          ) : undefined
        }
      />
    </Select>
  )
}

function InviteeLabel({ email }: Readonly<{ email: string }>) {
  return (
    <OptionLabel icon={<Mail className="size-3.5" strokeWidth={1.75} />}>
      {m.jira_import_people_invitee({ email })}
    </OptionLabel>
  )
}
