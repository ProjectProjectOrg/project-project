import { Tool } from "effect/ai"
import * as Hash from "effect/Hash"
import * as Predicate from "effect/Predicate"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"

import { Tools } from "./Tools"

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const fingerprint = (value: unknown) =>
  (Hash.string(encodeJson(value)) >>> 0).toString(16).padStart(8, "0")

export const withoutDescriptions = (schema: unknown): unknown =>
  Array.isArray(schema)
    ? schema.map(withoutDescriptions)
    : Predicate.isObject(schema)
      ? Object.fromEntries(
          Object.entries(schema)
            .filter(([key]) => key !== "description")
            .map(([key, value]) => [key, withoutDescriptions(value)])
        )
      : schema

export const toolInputVersions = Record.map(Tools.tools, (tool) =>
  fingerprint(withoutDescriptions(Tool.getJsonSchema(tool)))
)

export const catalogVersion = fingerprint(toolInputVersions)
