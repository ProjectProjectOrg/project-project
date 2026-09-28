import * as Schema from "effect/Schema"

export const appProtocolVersion = 1

export const InstanceDescriptor = Schema.Struct({
  instanceId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  logo: Schema.NullOr(Schema.String),
  serverVersion: Schema.NonEmptyString,
  protocolVersion: Schema.Int
})
export type InstanceDescriptor = typeof InstanceDescriptor.Type
