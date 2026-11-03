import {
  GroupKind,
  NATURAL_SORT_DIR,
  SortDir,
  SortKey,
  type ToolName
} from "@pp/shared"
import { Flag } from "effect/cli"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"

export type Shaping = Readonly<{
  hides: ReadonlyArray<string>
  flags: Readonly<Record<string, Flag.Flag<unknown>>>
  build: (raw: Readonly<Record<string, unknown>>) => Record<string, unknown>
}>

const sortFlag = Flag.String("sort").pipe(
  Flag.withDescription(
    `Sort by ${SortKey.literals.map((key) => `\`${key}\``).join(", ")}, with \`:asc\` or \`:desc\` after it (e.g. \`updated:desc\`); each key has a natural direction.`
  ),
  Flag.optional
)

export const parseSort = (value: string) => {
  const [key, dir, ...rest] = value.split(":")
  const keyParsed = SortKey.literals.find((literal) => literal === key)
  const dirParsed =
    dir === undefined ? undefined : SortDir.literals.find((d) => d === dir)
  return keyParsed === undefined ||
    rest.length > 0 ||
    (dir !== undefined && dirParsed === undefined)
    ? undefined
    : { key: keyParsed, dir: dirParsed ?? NATURAL_SORT_DIR[keyParsed] }
}

const kindFlag = Flag.Literals("kind", GroupKind.literals).pipe(
  Flag.withDescription("Group kinds to include. Repeat for several."),
  Flag.atLeast(0)
)

const activeFlag = Flag.Boolean("active").pipe(
  Flag.withDescription(
    "Sprints only: `--active` keeps sprints running now, `--no-active` planned or completed ones."
  ),
  Flag.optional
)

export const groupFilter = (
  kind: ReadonlyArray<string>,
  active: Option.Option<boolean>
) => {
  const filter: Record<string, unknown> = {}
  if (kind.length > 0) filter["kind"] = kind
  if (Option.isSome(active)) filter["active"] = active.value
  return Object.keys(filter).length === 0 ? {} : { filter }
}

const given = (raw: Readonly<Record<string, unknown>>, name: string) => {
  const value = raw[name]
  return Option.isOption(value) ? value : Option.fromNullishOr(value)
}

export const shapings: Partial<Readonly<Record<ToolName, Shaping>>> = {
  list_tickets: {
    hides: ["sort"],
    flags: { sort: sortFlag },
    build: (raw) =>
      Option.match(given(raw, "sort"), {
        onNone: () => ({}),
        onSome: (value) => ({ sort: parseSort(String(value)) ?? value })
      })
  },
  list_groups: {
    hides: ["filter"],
    flags: { kind: kindFlag, active: activeFlag },
    build: (raw) => {
      const kind = raw["kind"]
      return groupFilter(
        Array.isArray(kind) ? kind.map(String) : [],
        Option.filter(given(raw, "active"), Predicate.isBoolean)
      )
    }
  }
}
