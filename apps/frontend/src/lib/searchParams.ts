import * as UrlParams from "effect/http/UrlParams"
import * as Schema from "effect/Schema"

const FlatSearch = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Array(Schema.String), Schema.Undefined])
)
const decodeFlatSearch = Schema.decodeUnknownSync(FlatSearch)

export function parseSearch(
  search: string
): ReturnType<typeof UrlParams.toReadonlyRecord> {
  return UrlParams.toReadonlyRecord(
    UrlParams.fromInput(new URLSearchParams(search))
  )
}

export function stringifySearch(search: unknown): string {
  const query = UrlParams.toString(decodeFlatSearch(search))
  return query === "" ? "" : `?${query}`
}
