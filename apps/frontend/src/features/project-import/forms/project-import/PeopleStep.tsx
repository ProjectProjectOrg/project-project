import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { OrgMember, ProjectImportPerson } from "@pp/shared"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { Select, SelectTrigger } from "@pp/ui/select"

import { AsyncView } from "@/components/shell/AsyncView"
import { MappingLabel, MappingRow } from "@/components/shell/MappingRow"
import { StepFrame } from "@/components/shell/wizard/StepFrame"
import { orgMembers, orgRequest } from "@/features/organizations/atoms/orgs"
import { m } from "@/paraglide/messages"

import type { ProjectImportForm } from "./opts"

const unlinkedValue = "__unlinked__"

export function PeopleStep({
  form,
  orgSlug,
  people,
  waiting,
  onNext
}: Readonly<{
  form: ProjectImportForm
  orgSlug: string
  people: ReadonlyArray<ProjectImportPerson>
  waiting: boolean
  onNext: () => void
}>) {
  const membersAtom = orgMembers(orgRequest(orgSlug))
  const members = useAtomValue(membersAtom)
  const refreshMembers = useAtomRefresh(membersAtom)

  return (
    <StepFrame
      title={m.project_import_people_title()}
      description={m.project_import_people_description()}
      waiting={waiting}
      error={null}
      showBack={false}
      onBack={() => {}}
      onNext={onNext}
    >
      {people.length === 0 ? (
        <p className="text-body text-muted-foreground">
          {m.project_import_people_empty()}
        </p>
      ) : (
        <AsyncView
          result={members}
          reset={refreshMembers}
          contained
          onInitial={() => <div className="h-28 w-full skeleton rounded-xl" />}
          onSuccess={({ value }) => (
            <div className="divide-y divide-border">
              {people.map((person, index) => (
                <PersonRow
                  key={person.id}
                  form={form}
                  index={index}
                  person={person}
                  members={value.members}
                />
              ))}
            </div>
          )}
        />
      )}
    </StepFrame>
  )
}

function PersonRow({
  form,
  index,
  person,
  members
}: Readonly<{
  form: ProjectImportForm
  index: number
  person: ProjectImportPerson
  members: ReadonlyArray<OrgMember>
}>) {
  return (
    <MappingRow
      source={
        <MappingLabel icon={<MemberAvatar member={person} size={20} />}>
          {person.name}
        </MappingLabel>
      }
      detail={person.email}
    >
      <form.Field name={`people[${index}].userId`}>
        {(field) => {
          const selected = members.find(
            (member) => member.userId === field.value
          )
          return (
            <Select
              value={field.value ?? unlinkedValue}
              onValueChange={(value) =>
                field.handleChange(value === unlinkedValue ? null : value)
              }
              items={[
                {
                  value: unlinkedValue,
                  label: m.project_import_people_dont_link()
                },
                ...members.map((member) => ({
                  value: member.userId,
                  textValue: member.name,
                  label: <MemberLabel member={member} />
                }))
              ]}
            >
              <SelectTrigger
                aria-label={person.name}
                placeholder={m.project_import_people_dont_link()}
                className="w-full"
                selectedLabel={
                  selected ? (
                    <MemberLabel member={selected} />
                  ) : (
                    m.project_import_people_dont_link()
                  )
                }
              />
            </Select>
          )
        }}
      </form.Field>
    </MappingRow>
  )
}

function MemberLabel({ member }: Readonly<{ member: OrgMember }>) {
  return (
    <MappingLabel
      icon={
        <MemberAvatar member={{ ...member, id: member.userId }} size={20} />
      }
    >
      {member.name}
    </MappingLabel>
  )
}
