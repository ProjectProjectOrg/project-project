import type { JiraMigrationRequirements } from "@pp/shared"

import { MemberAvatar } from "@/components/MemberAvatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
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
                        ? ""
                        : field.value === null
                          ? unlinkedValue
                          : field.value
                    }
                    onValueChange={(value) =>
                      field.handleChange(value === unlinkedValue ? null : value)
                    }
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
                    <SelectContent>
                      <SelectItem value={unlinkedValue} index={0}>
                        {m.jira_migration_people_dont_link()}
                      </SelectItem>
                      {requirements.identityOptions.map(
                        (option, optionIndex) => (
                          <SelectItem
                            key={option.id}
                            value={option.id}
                            index={optionIndex + 1}
                            aria-label={option.name}
                          >
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
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
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
