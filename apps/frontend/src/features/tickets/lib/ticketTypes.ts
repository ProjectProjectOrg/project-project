import {
  EMPTY_LAYER,
  FALLBACK_BLOCK_ICON,
  isEpicType,
  NO_TYPE_FILTER,
  resolveLibrary,
  type BlockIconName,
  type TypeDefinition,
  type TypeFilter,
  type TypeKey
} from "@pp/shared"

import { m } from "@/paraglide/messages"

export type TicketType = Readonly<{
  key: TypeKey
  name: string
  icon: BlockIconName
  color: string | null
  known: boolean
  hidden: boolean
}>

export type TypeOption = Readonly<{
  value: TypeFilter
  type: TicketType | null
  separated: boolean
}>

export const BUILTIN_TYPE_DEFINITIONS: ReadonlyArray<TypeDefinition> =
  resolveLibrary({ org: EMPTY_LAYER, project: null }, false).types

const typeOfDefinition = (definition: TypeDefinition) =>
  ({
    key: definition.key,
    name: definition.name,
    icon: definition.icon,
    color: definition.color,
    known: true,
    hidden: definition.hidden
  }) satisfies TicketType

const unknownType = (key: TypeKey) =>
  ({
    key,
    name: key,
    icon: FALLBACK_BLOCK_ICON,
    color: null,
    known: false,
    hidden: false
  }) satisfies TicketType

export const resolveType = (
  types: ReadonlyArray<TypeDefinition>,
  key: TypeKey | null
) => {
  if (key === null) return null
  const definition = types.find((type) => type.key === key)
  return definition === undefined
    ? unknownType(key)
    : typeOfDefinition(definition)
}

export const typeName = (type: TicketType | null) =>
  type === null ? m.tickets_type_none() : type.name

export const visibleTypes = (
  types: ReadonlyArray<TypeDefinition>,
  epics: boolean = true
) =>
  types.flatMap((type) =>
    type.hidden || (!epics && isEpicType(type.key))
      ? []
      : [typeOfDefinition(type)]
  )

export const typeOptions = (
  types: ReadonlyArray<TypeDefinition>,
  epics: boolean = true
) => {
  const visible = visibleTypes(types, epics)
  return [
    ...visible.map(
      (type, index) =>
        ({
          value: type.key,
          type,
          separated: index === visible.length - 1
        }) satisfies TypeOption
    ),
    { value: NO_TYPE_FILTER, type: null, separated: false } satisfies TypeOption
  ]
}

export const typeOptionValue = (key: TypeKey | null) =>
  (key ?? NO_TYPE_FILTER) satisfies TypeFilter

export const typeKeyOfOption = (value: TypeFilter) =>
  value === NO_TYPE_FILTER ? null : value

export const offersType = (
  types: ReadonlyArray<TypeDefinition>,
  key: TypeKey | null,
  epics: boolean = true
) => key === null || visibleTypes(types, epics).some((type) => type.key === key)
