import * as Schema from "effect/Schema"

export const ReferenceKind = Schema.Literals(["user", "ticket", "link"])
export type ReferenceKind = typeof ReferenceKind.Type

export const ReferenceToFix = Schema.Struct({
  ticketId: Schema.String,
  kind: ReferenceKind,
  target: Schema.String,
  label: Schema.String,
  snippet: Schema.String
})
export type ReferenceToFix = typeof ReferenceToFix.Type

export const ReferencesToFix = Schema.Struct({
  items: Schema.Array(ReferenceToFix)
})
export type ReferencesToFix = typeof ReferencesToFix.Type

export const FixReferenceAction = Schema.TaggedUnion({
  plain: {},
  link: { to: Schema.String.pipe(Schema.check(Schema.isMinLength(1))) }
})
export type FixReferenceAction = typeof FixReferenceAction.Type

export const FixReferenceInput = Schema.Struct({
  kind: ReferenceKind,
  target: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  ticketId: Schema.NullOr(Schema.String),
  action: FixReferenceAction
})
export type FixReferenceInput = typeof FixReferenceInput.Type
