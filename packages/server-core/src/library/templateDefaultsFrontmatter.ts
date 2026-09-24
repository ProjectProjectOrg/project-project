import {
  TemplateKey,
  TicketType,
  type PartialTemplateDefaults
} from "@pp/shared"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

const TEMPLATE_DEFAULTS_KEY = "templateDefaults"

const decodeTicketType = Schema.decodeUnknownOption(TicketType)
const decodeDefaultTemplate = Schema.decodeUnknownOption(
  Schema.NullOr(TemplateKey)
)

export const templateDefaultsFrom = (
  data: Record<string, unknown>
): PartialTemplateDefaults => {
  const raw = data[TEMPLATE_DEFAULTS_KEY]
  if (!Predicate.isObject(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw).flatMap(([type, key]) =>
      Option.isSome(decodeTicketType(type))
        ? Option.match(decodeDefaultTemplate(key), {
            onNone: () => [],
            onSome: (template) => [[type, template] as const]
          })
        : []
    )
  )
}

export const withTemplateDefaults = (
  frontmatter: Record<string, unknown>,
  defaults: PartialTemplateDefaults
): Record<string, unknown> => {
  const { [TEMPLATE_DEFAULTS_KEY]: _previous, ...rest } = frontmatter
  return Object.keys(defaults).length === 0
    ? rest
    : { ...rest, [TEMPLATE_DEFAULTS_KEY]: defaults }
}
