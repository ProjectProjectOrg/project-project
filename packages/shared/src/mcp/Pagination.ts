import * as Schema from "effect/Schema"

// Shared pagination primitives for MCP tool outputs.
//
// `Pagination` is the input shape (optional cursor + optional bounded limit).
// `Page` wraps any item schema in `{ items, nextCursor }`. Cursors are opaque
// base64url-encoded JSON payloads — handlers decode them to read keyset state.

export const Pagination = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Int.pipe(Schema.between(1, 200))),
})
export type Pagination = typeof Pagination.Type

export const Page = <A, I>(item: Schema.Schema<A, I>) =>
  Schema.Struct({
    items: Schema.Array(item),
    nextCursor: Schema.NullOr(Schema.String),
  })

export interface CursorPayload {
  readonly id: string
  readonly sort: string
}

export const encodeCursor = (p: CursorPayload): string =>
  Buffer.from(JSON.stringify(p), "utf8").toString("base64url")

export const decodeCursor = (s: string): CursorPayload =>
  JSON.parse(Buffer.from(s, "base64url").toString("utf8"))
