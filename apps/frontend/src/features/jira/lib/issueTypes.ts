import {
  isEpicType,
  type JiraMigrationRequirements,
  type TypeDefinition,
  type TypeKey
} from "@pp/shared"

const normalized = (value: string) => value.trim().toLowerCase()

export const jiraTypeOptions = (
  types: ReadonlyArray<TypeDefinition>
): ReadonlyArray<TypeDefinition> => types.filter((type) => !type.hidden)

const typeAliases = new Map([["feature", "feat"]])

const matchIssueType = (
  name: string,
  types: ReadonlyArray<TypeDefinition>
): TypeKey | undefined => {
  const wanted = normalized(name)
  const alias = typeAliases.get(wanted)
  return types.find(
    (type) =>
      type.key === wanted ||
      type.key === alias ||
      normalized(type.name) === wanted
  )?.key
}

export const suggestedIssueType = (
  issueType: JiraMigrationRequirements["issueTypes"][number],
  types: ReadonlyArray<TypeDefinition>
): TypeKey | null => {
  const offered = (key: TypeKey | null) =>
    key !== null && types.some((type) => type.key === key)
  const suggested = issueType.suggestedProjectType
  if (isEpicType(suggested) && offered(suggested)) return suggested
  const matched = matchIssueType(issueType.name, types)
  if (matched !== undefined && !isEpicType(matched)) return matched
  return offered(suggested) ? suggested : null
}

export const offeredOrUnset = (
  type: TypeKey | null,
  types: ReadonlyArray<TypeDefinition>
): TypeKey | null | undefined =>
  type === null || types.some((definition) => definition.key === type)
    ? type
    : undefined
