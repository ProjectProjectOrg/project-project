import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

const PrettyJson = Schema.fromJsonString(Schema.Unknown, { space: 2 })
const encodeJson = Schema.encodeEffect(PrettyJson)

const COLUMN_PREFERENCE = [
  "id",
  "slug",
  "key",
  "title",
  "name",
  "status",
  "role",
  "type"
]

const isPrimitive = (value: unknown) =>
  Predicate.isString(value) ||
  Predicate.isNumber(value) ||
  Predicate.isBoolean(value) ||
  value === null

const cell = (value: unknown) => {
  if (Predicate.isString(value)) return value.replace(/\s+/g, " ")
  if (Predicate.isNumber(value) || Predicate.isBoolean(value)) {
    return `${value}`
  }
  return value === null || value === undefined ? "" : "…"
}

const cellText = (value: unknown) => (Predicate.isString(value) ? value : "")

type Row = Readonly<Record<string, unknown>>

export const tableLayout = (rows: ReadonlyArray<Row>) => {
  const first = rows[0]
  if (first === undefined) return undefined
  const preferred = COLUMN_PREFERENCE.filter((key) => key in first)
  const others = Object.keys(first).filter(
    (key) => !preferred.includes(key) && isPrimitive(first[key])
  )
  const picked = [...preferred, ...others].slice(0, 4)
  const cellsOf = (row: Row) => picked.map((key) => cell(row[key]))
  const widths = picked.map((key, index) =>
    Math.min(
      60,
      Math.max(
        key.length,
        ...rows.map((row) => (cellsOf(row)[index] ?? "").length)
      )
    )
  )
  const line = (values: ReadonlyArray<string>) =>
    values
      .map((value, index) =>
        value.length > (widths[index] ?? 0)
          ? `${value.slice(0, (widths[index] ?? 1) - 1)}…`
          : value.padEnd(widths[index] ?? 0)
      )
      .join("  ")
      .trimEnd()
  return {
    header: line(picked.map((key) => key.toUpperCase())),
    row: (row: Row) => line(cellsOf(row))
  }
}

const table = (rows: ReadonlyArray<Row>) => {
  const layout = tableLayout(rows)
  return layout === undefined
    ? "No results."
    : [layout.header, ...rows.map(layout.row)].join("\n")
}

const flatten = (
  record: Readonly<Record<string, unknown>>,
  prefix = ""
): ReadonlyArray<readonly [string, unknown]> =>
  Object.entries(record).flatMap(([key, value]) =>
    Predicate.isObject(value) && !Array.isArray(value)
      ? flatten(value, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value] as const]
  )

const isValues = (value: unknown): value is ReadonlyArray<unknown> =>
  Array.isArray(value) && value.every(isPrimitive)

const shortCell = (value: unknown) =>
  isValues(value)
    ? value.length === 0
      ? "none"
      : value.map(cell).join(", ")
    : cell(value)

const details = (record: Readonly<Record<string, unknown>>) => {
  const entries = flatten(record)
  const short = entries.filter(
    ([, value]) =>
      isValues(value) ||
      (isPrimitive(value) &&
        !(Predicate.isString(value) && value.includes("\n")))
  )
  const long = entries.filter(
    ([, value]) => Predicate.isString(value) && value.includes("\n")
  )
  const width = Math.max(0, ...short.map(([key]) => key.length))
  const lists = entries.filter(
    (
      entry
    ): entry is readonly [
      string,
      ReadonlyArray<Readonly<Record<string, unknown>>>
    ] => isRows(entry[1]) && entry[1].length > 0
  )
  return [
    ...short.map(
      ([key, value]) => `${`${key}:`.padEnd(width + 2)}${shortCell(value)}`
    ),
    ...lists.map(([key, rows]) => `\n${key}:\n${table(rows)}`),
    ...long.map(([key, value]) => `\n${key}:\n${cellText(value)}`)
  ].join("\n")
}

export const isRows = (
  value: unknown
): value is ReadonlyArray<Readonly<Record<string, unknown>>> =>
  Array.isArray(value) && value.every(Predicate.isObject)

export const human = (value: unknown): string => {
  if (isRows(value)) return table(value)
  if (Predicate.isObject(value)) {
    if ("items" in value && isRows(value.items)) {
      const more =
        "nextCursor" in value && Predicate.isString(value.nextCursor)
          ? `\n\nMore results: pass --cursor ${value.nextCursor}`
          : ""
      return `${table(value.items)}${more}`
    }
    return details(value)
  }
  return cell(value)
}

export const printResult = (value: unknown, json: boolean) =>
  json
    ? Effect.flatMap(encodeJson(value).pipe(Effect.orDie), Console.log)
    : Console.log(human(value))
