import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

export const SystemProjectRole = Schema.Literals(["feedback"])
export type SystemProjectRole = typeof SystemProjectRole.Type

const SYSTEM_KEY = "system"

const decodeSystemRole = Schema.decodeUnknownOption(SystemProjectRole)

export const systemRoleFrom = (
  data: Record<string, unknown>
): Option.Option<SystemProjectRole> => decodeSystemRole(data[SYSTEM_KEY])

export const withSystemRole = (
  frontmatter: Record<string, unknown>,
  role: Option.Option<SystemProjectRole>
): Record<string, unknown> => {
  const { [SYSTEM_KEY]: _previous, ...rest } = frontmatter
  return Option.match(role, {
    onNone: () => rest,
    onSome: (value) => ({ ...rest, [SYSTEM_KEY]: value })
  })
}
