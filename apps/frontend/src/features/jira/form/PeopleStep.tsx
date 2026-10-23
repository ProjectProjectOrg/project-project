import type { JiraMigrationRequirements } from "@pp/shared"

import { MemberAvatar } from "@/components/MemberAvatar"
import { Select, SelectTrigger } from "@/components/ui/select"
import { m } from "@/paraglide/messages"

import { MappingLabel, MappingRow } from "./MappingRow"
import type { JiraMigrationForm } from "./opts"
import { StepFrame } from "./StepFrame"

const unlinkedValue = "__unlinked__"

export function PeopleStep({
  form,
  requirements,
  waiting,
  error,
  onBack,
  onNext
}: StepProps) {
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
            <form.Field name={`identities[${index}].projectProjectUserId`}>
              {(field) => {
                const selected = requirements.identityOptions.find(
                  (option) => option.id === field.value
                )
                return (
                  <Select
                    value={
                      field.value === undefined
                        ? null
                        : field.value === null
                          ? unlinkedValue
                          : field.value
                    }
                    onValueChange={(value) =>
                      field.handleChange(value === unlinkedValue ? null : value)
                    }
                    items={[
                      {
                        value: unlinkedValue,
                        label: m.jira_migration_people_dont_link()
                      },
                      ...requirements.identityOptions.map((option) => ({
                        value: option.id,
                        textValue: option.name,
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
                      }))
                    ]}
                  >
                    <SelectTrigger
                      aria-label={identity.displayName}
                      placeholder={m.jira_migration_people_title()}
                      className="w-full"
                      selectedLabel={
                        field.value === null ? (
                          m.jira_migration_people_dont_link()
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
                )
              }}
            </form.Field>
          </MappingRow>
        ))}
      </div>
    </StepFrame>
  )
}

type StepProps = Readonly<{
  form: JiraMigrationForm
  requirements: JiraMigrationRequirements
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}>
