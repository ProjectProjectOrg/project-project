import * as Arr from "effect/Array"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"

export type Resources = Readonly<
  Record<string, Schema.Literals<ReadonlyArray<string>>>
>

const grantsSchema = <S extends Resources>(resources: S) =>
  Schema.Record(Schema.String, Schema.Array(Schema.String))
    .check(Schema.isPropertyNames(Schema.Literals(Record.keys(resources))))
    .pipe(
      Schema.decodeTo(
        Schema.Struct(
          Struct.map(Struct.map(resources, Schema.Array), Schema.optionalKey)
        )
      )
    )

export type GrantsSchema<S extends Resources> = ReturnType<
  typeof grantsSchema<S>
>

export type Grants<S extends Resources> = GrantsSchema<S>["Type"]

export type Connector = "AND" | "OR"

export type Role<S extends Resources> = Readonly<{
  grants: Grants<S>
  can: (request: Grants<S>, connector?: Connector) => boolean
}>

export type Statement<S extends Resources> = Readonly<{
  resources: S
  schema: GrantsSchema<S>
  all: Grants<S>
  role: (grants: Grants<S>) => Role<S>
}>

type AnyGrants = Readonly<Record<string, ReadonlyArray<string> | undefined>>

const permissions = (grants: AnyGrants) =>
  Arr.flatMap(Record.toEntries(grants), ([resource, actions = []]) =>
    Arr.map(actions, (action) => ({ resource, action }))
  )

const can = (grants: AnyGrants, request: AnyGrants, connector: Connector) => {
  const granted = permissions(grants)
  const requested = permissions(request)
  const isGranted = (permission: (typeof requested)[number]) =>
    Arr.contains(granted, permission)
  return (
    Arr.isReadonlyArrayNonEmpty(requested) &&
    (connector === "OR"
      ? Arr.some(requested, isGranted)
      : Arr.every(requested, isGranted))
  )
}

const makeRole = <S extends Resources>(grants: Grants<S>): Role<S> => ({
  grants,
  can: (request, connector = "AND") => can(grants, request, connector)
})

export const make = <S extends Resources>(resources: S): Statement<S> => {
  const schema = grantsSchema(resources)
  const decodeGrants = Schema.decodeSync(schema)
  return {
    resources,
    schema,
    all: decodeGrants(Record.map(resources, (actions) => actions.literals)),
    role: makeRole
  }
}
