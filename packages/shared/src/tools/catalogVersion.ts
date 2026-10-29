import { Tool } from "effect/ai"
import * as Hash from "effect/Hash"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"

import { Tools } from "./Tools"

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const fingerprint = (value: unknown) =>
  (Hash.string(encodeJson(value)) >>> 0).toString(16).padStart(8, "0")

export const toolInputVersions = Record.map(Tools.tools, (tool) =>
  fingerprint(Tool.getJsonSchema(tool))
)

export const catalogVersion = fingerprint(toolInputVersions)
