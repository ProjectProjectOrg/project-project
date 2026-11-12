import {
  builtinType,
  isBuiltinTypeKey,
  isReservedTypeKey,
  type TypeDraft,
  TypeKey
} from "@pp/shared"
import * as Data from "effect/Data"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

import type * as Markdown from "../markdown/Markdown"
import { decodeTypeFields, isTombstone, parseLibraryFile } from "./LibraryDocs"

export const LEGACY_DEFAULTS_KEY = "templateDefaults"

const LegacyTicketType = Schema.Literals([
  "feat",
  "bug",
  "chore",
  "other",
  "epic"
])
type LegacyTicketType = typeof LegacyTicketType.Type

export type LegacyDefaults = Readonly<
  Partial<Record<LegacyTicketType, string | null>>
>

export type LegacyTemplate = Readonly<{ key: string } & Omit<TypeDraft, "key">>

export type LegacyLayer = Readonly<{
  templates: ReadonlyArray<LegacyTemplate>
  hidden: ReadonlyArray<string>
  unreadable: ReadonlyArray<Markdown.LibraryFile>
  defaults: LegacyDefaults
}>

export type MigrationStep =
  | Readonly<{
      _tag: "type"
      template: string
      from: "org" | "project"
      draft: TypeDraft
    }>
  | Readonly<{ _tag: "raw"; template: string; key: string; content: string }>
  | Readonly<{ _tag: "tombstone"; template: string; key: string }>
  | Readonly<{ _tag: "unhidden"; template: string; key: string }>

const Step = Data.taggedEnum<MigrationStep>()

export type LayerPlan = Readonly<{
  steps: ReadonlyArray<MigrationStep>
  targets: ReadonlyMap<string, ReadonlyArray<string>>
  ownKeys: ReadonlyMap<string, string>
}>

const TICKET_TYPES: ReadonlyArray<LegacyTicketType> = LegacyTicketType.literals

const decodeTicketType = Schema.decodeUnknownOption(LegacyTicketType)
const decodeLegacyKey = Schema.decodeUnknownOption(Schema.NullOr(Schema.String))

const FRONTMATTER = /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/

const LEGACY_TYPE_LINE = /^type:[ \t]*(?:other|"other"|'other')[ \t]*(?=\r?$)/m

export const withoutLegacyTicketType = (content: string): string | null => {
  const match = FRONTMATTER.exec(content)
  if (match === null) return null
  const [whole, open, frontmatter, close] = match
  if (!LEGACY_TYPE_LINE.test(frontmatter)) return null
  const rewritten = frontmatter.replace(LEGACY_TYPE_LINE, "type: null")
  return `${open}${rewritten}${close}${content.slice(whole.length)}`
}

export const EMPTY_LEGACY_LAYER: LegacyLayer = {
  templates: [],
  hidden: [],
  unreadable: [],
  defaults: {}
}

export const legacyDefaultsFrom = (
  data: Record<string, unknown>
): LegacyDefaults => {
  const raw = data[LEGACY_DEFAULTS_KEY]
  if (!Predicate.isObject(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw).flatMap(([type, key]) =>
      Option.isSome(decodeTicketType(type))
        ? Option.match(decodeLegacyKey(key), {
            onNone: () => [],
            onSome: (template) => [[type, template] as const]
          })
        : []
    )
  )
}

export const withoutLegacyDefaults = (
  data: Record<string, unknown>
): Record<string, unknown> => {
  const { [LEGACY_DEFAULTS_KEY]: _defaults, ...rest } = data
  return rest
}

export const legacyLayerFrom = (
  files: ReadonlyArray<Markdown.LibraryFile>,
  defaults: LegacyDefaults
): LegacyLayer => {
  const classified = files.map((file) => {
    const parsed = parseLibraryFile(file)
    if (Option.isNone(parsed)) return { file, hidden: false, template: null }
    if (isTombstone(parsed.value.data))
      return { file, hidden: true, template: null }
    return {
      file,
      hidden: false,
      template: Option.getOrNull(
        Option.map(decodeTypeFields(parsed.value), (fields) => ({
          key: file.key,
          ...fields
        }))
      )
    }
  })
  return {
    templates: classified.flatMap((entry) =>
      entry.template === null ? [] : [entry.template]
    ),
    hidden: classified.flatMap((entry) =>
      entry.hidden ? [entry.file.key] : []
    ),
    unreadable: classified.flatMap((entry) =>
      entry.hidden || entry.template !== null ? [] : [entry.file]
    ),
    defaults
  }
}

export const isEmptyLegacyLayer = (layer: LegacyLayer): boolean =>
  layer.templates.length === 0 &&
  layer.hidden.length === 0 &&
  layer.unreadable.length === 0

const byKey = <A extends Readonly<{ key: string }>>(
  entries: ReadonlyArray<A>
): ReadonlyArray<A> =>
  entries.toSorted((a, b) => a.key.localeCompare(b.key, "en"))

const needsRename = (key: string): boolean =>
  isBuiltinTypeKey(key) || isReservedTypeKey(key)

const firstFree = (key: string, taken: ReadonlySet<string>): string => {
  const candidates = Array.from(
    { length: taken.size + 1 },
    (_, index) => `${key}-${index + 2}`
  )
  return candidates.find((candidate) => !taken.has(candidate)) ?? key
}

const ownKeysFor = (
  layer: LegacyLayer,
  inherited: ReadonlyMap<string, string>
): ReadonlyMap<string, string> => {
  const keys = [
    ...layer.templates.map((template) => template.key),
    ...layer.unreadable.map((file) => file.key)
  ].toSorted()
  const assigned = new Map<string, string>()
  for (const key of keys) {
    const taken = new Set([...keys, ...assigned.values()])
    const preferred = inherited.get(key)
    const keepsPreferred =
      preferred !== undefined && (preferred === key || !taken.has(preferred))
    assigned.set(
      key,
      keepsPreferred
        ? preferred
        : needsRename(key)
          ? firstFree(key, taken)
          : key
    )
  }
  return assigned
}

const effectiveDefaults = (
  own: LegacyDefaults,
  fallback: LegacyDefaults,
  active: ReadonlySet<string>
): LegacyDefaults =>
  Object.fromEntries(
    TICKET_TYPES.map((type) => {
      const key = type in own ? (own[type] ?? null) : (fallback[type] ?? null)
      return [type, key !== null && active.has(key) ? key : null] as const
    })
  )

const typesDefaultingTo = (
  defaults: LegacyDefaults,
  key: string
): ReadonlyArray<LegacyTicketType> =>
  TICKET_TYPES.filter((type) => defaults[type] === key)

const asTypeDefinition = (
  template: LegacyTemplate,
  typeKey: string,
  from: "org" | "project"
): ReadonlyArray<MigrationStep> => {
  const builtin = builtinType(typeKey)
  return builtin === undefined
    ? []
    : [
        Step.type({
          template: template.key,
          from,
          draft: {
            key: builtin.key,
            name: builtin.name,
            icon: builtin.icon,
            color: builtin.color,
            description: template.description,
            priority: template.priority,
            tags: template.tags,
            body: template.body
          }
        })
      ]
}

const asOwnType = (
  template: LegacyTemplate,
  ownKey: string,
  from: "org" | "project"
): MigrationStep =>
  Step.type({
    template: template.key,
    from,
    draft: { ...template, key: TypeKey.make(ownKey) }
  })

type TemplatePlan = Readonly<{
  template: string
  steps: ReadonlyArray<MigrationStep>
}>

const planTemplate = (
  template: LegacyTemplate,
  defaults: LegacyDefaults,
  ownKey: string,
  from: "org" | "project"
): TemplatePlan => {
  const types = typesDefaultingTo(defaults, template.key)
  const definitions = types.flatMap((type) =>
    asTypeDefinition(template, type, from)
  )
  const standsAlone = definitions.length === 0 || types.includes("other")
  return {
    template: template.key,
    steps: [
      ...definitions,
      ...(standsAlone ? [asOwnType(template, ownKey, from)] : [])
    ]
  }
}

export const stepKey = (step: MigrationStep): string =>
  Match.value(step).pipe(
    Match.tag("type", (typed) => typed.draft.key),
    Match.orElse((other) => other.key)
  )

const targetsOf = (
  plans: ReadonlyArray<TemplatePlan>
): ReadonlyMap<string, ReadonlyArray<string>> =>
  new Map(plans.map((plan) => [plan.template, plan.steps.map(stepKey)]))

const rawSteps = (
  layer: LegacyLayer,
  ownKeys: ReadonlyMap<string, string>
): ReadonlyArray<TemplatePlan> =>
  byKey(layer.unreadable).map((file) => ({
    template: file.key,
    steps: [
      Step.raw({
        template: file.key,
        key: ownKeys.get(file.key) ?? file.key,
        content: file.content
      })
    ]
  }))

const templateKeys = (layer: LegacyLayer): ReadonlySet<string> =>
  new Set(layer.templates.map((template) => template.key))

const orgDefaults = (org: LegacyLayer): LegacyDefaults =>
  effectiveDefaults(org.defaults, {}, templateKeys(org))

export const planOrgLayer = (org: LegacyLayer): LayerPlan => {
  const ownKeys = ownKeysFor(org, new Map())
  const defaults = orgDefaults(org)
  const plans = [
    ...byKey(org.templates).map((template) =>
      planTemplate(
        template,
        defaults,
        ownKeys.get(template.key) ?? template.key,
        "org"
      )
    ),
    ...rawSteps(org, ownKeys)
  ]
  return {
    steps: plans.flatMap((plan) => plan.steps),
    targets: targetsOf(plans),
    ownKeys
  }
}

export const planProjectLayer = (
  project: LegacyLayer,
  org: LegacyLayer,
  orgPlan: LayerPlan
): LayerPlan => {
  const ownKeys = ownKeysFor(project, orgPlan.ownKeys)
  const own = templateKeys(project)
  const inherited = org.templates.filter(
    (template) =>
      !own.has(template.key) && !project.hidden.includes(template.key)
  )
  const inheritedDefaults = orgDefaults(org)
  const defaults = effectiveDefaults(
    project.defaults,
    inheritedDefaults,
    new Set([...own, ...inherited.map((template) => template.key)])
  )
  const ownPlans = [
    ...byKey(project.templates).map((template) =>
      planTemplate(
        template,
        defaults,
        ownKeys.get(template.key) ?? template.key,
        "project"
      )
    ),
    ...rawSteps(project, ownKeys)
  ]
  const repointed = byKey(inherited).flatMap((template) =>
    typesDefaultingTo(defaults, template.key)
      .filter((type) => inheritedDefaults[type] !== template.key)
      .flatMap((type) => asTypeDefinition(template, type, "org"))
  )
  const definitions = [...ownPlans.flatMap((plan) => plan.steps), ...repointed]
  const defined = new Set(definitions.map(stepKey))
  const tombstones = project.hidden
    .toSorted()
    .flatMap((template) =>
      (orgPlan.targets.get(template) ?? []).map((key) =>
        builtinType(key) === undefined
          ? Step.tombstone({ template, key })
          : Step.unhidden({ template, key })
      )
    )
    .filter((step) => !defined.has(stepKey(step)))
  return {
    steps: [...definitions, ...tombstones],
    targets: targetsOf(ownPlans),
    ownKeys
  }
}
