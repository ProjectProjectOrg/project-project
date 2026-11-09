import type { JiraMigrationRequirements } from "@pp/shared"
import { Mail, UserPlus } from "lucide-react"
import { useState } from "react"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  type SelectOption
} from "@/components/ui/select"
import {
  applyPeopleSelection,
  invitedEmails,
  inviteValue,
  NEW_INVITE_VALUE,
  peopleSelectValue,
  type PeopleChoice,
  UNLINKED_VALUE
} from "@/features/jira/lib/people"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { useOrgActor } from "@/hooks/useActor"
import { useFormValues } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { MappingLabel, MappingRow } from "./MappingRow"
import type { JiraMigrationForm } from "./opts"
import { StepFrame } from "./StepFrame"

export function PeopleStep({
  form,
  orgSlug,
  requirements,
  waiting,
  error,
  onBack,
  onNext
}: StepProps) {
  const canInvite = useOrgActor(orgSlug).call("org", "inviteMember")
  const invitees = invitedEmails(useFormValues(form).identities)

  const memberItems = requirements.identityOptions.map(
    (option, index): SelectOption<string> => ({
      value: option.id,
      textValue: option.name,
      separated: index === 0,
      label: (
        <MappingLabel
          icon={
            <MemberAvatar
              member={{
                name: option.name,
                email: option.email,
                image: option.imageUrl
              }}
              size={20}
            />
          }
        >
          {option.name}
        </MappingLabel>
      )
    })
  )
  const inviteeItems = invitees.map(
    (email, index): SelectOption<string> => ({
      value: inviteValue(email),
      textValue: email,
      separated: index === 0,
      label: <InviteeLabel email={email} />
    })
  )
  const items: ReadonlyArray<SelectOption<string>> = [
    { value: UNLINKED_VALUE, label: m.jira_migration_people_dont_link() },
    ...(canInvite
      ? [
          {
            value: NEW_INVITE_VALUE,
            textValue: m.jira_migration_people_invite(),
            label: (
              <MappingLabel icon={<UserPlus className="size-4" />}>
                {m.jira_migration_people_invite()}
              </MappingLabel>
            )
          }
        ]
      : []),
    ...inviteeItems,
    ...memberItems
  ]

  return (
    <StepFrame
      title={m.jira_migration_people_title()}
      description={m.jira_migration_people_description()}
      waiting={waiting}
      error={error}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="divide-y divide-border">
        {requirements.identities.map((identity, index) => (
          <MappingRow
            key={identity.jiraAccountId}
            source={
              <MappingLabel
                icon={
                  <MemberAvatar
                    member={{
                      name: identity.displayName
                    }}
                    size={20}
                  />
                }
              >
                {identity.displayName}
              </MappingLabel>
            }
          >
            <form.Field name={`identities[${index}]`}>
              {(field) => (
                <PersonChoice
                  identity={identity}
                  options={requirements.identityOptions}
                  items={items}
                  choice={field.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </MappingRow>
        ))}
      </div>
    </StepFrame>
  )
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
  return (
    <div className="flex flex-col gap-1.5">
      <Select
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
          aria-label={identity.displayName}
          placeholder={m.jira_migration_people_title()}
          className="w-full"
          selectedLabel={
            value === UNLINKED_VALUE ? (
              m.jira_migration_people_dont_link()
            ) : value === NEW_INVITE_VALUE ? (
              m.jira_migration_people_invite()
            ) : choice.inviteEmail !== undefined ? (
              <InviteeLabel email={choice.inviteEmail.trim().toLowerCase()} />
            ) : selected ? (
              <MappingLabel
                icon={
                  <MemberAvatar
                    member={{
                      name: selected.name,
                      email: selected.email,
                      image: selected.imageUrl
                    }}
                    size={20}
                  />
                }
              >
                {selected.name}
              </MappingLabel>
            ) : undefined
          }
        />
      </Select>
      {showInput ? (
        <Input
          type="email"
          autoFocus
          aria-label={m.jira_migration_people_invite_email_label({
            name: identity.displayName
          })}
          placeholder={m.jira_migration_people_invite_placeholder()}
          value={choice.inviteEmail ?? ""}
          onChange={(event) =>
            onChange({ ...choice, inviteEmail: event.target.value })
          }
          onFocus={() => setEditingInvite(true)}
          onBlur={() => setEditingInvite(false)}
        />
      ) : null}
    </div>
  )
}

function InviteeLabel({ email }: Readonly<{ email: string }>) {
  return (
    <MappingLabel icon={<Mail className="size-4" />}>
      {m.jira_migration_people_invitee({ email })}
    </MappingLabel>
  )
}

type StepProps = Readonly<{
  form: JiraMigrationForm
  orgSlug: string
  requirements: JiraMigrationRequirements
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}>
