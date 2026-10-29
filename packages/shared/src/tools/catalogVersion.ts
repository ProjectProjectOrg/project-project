import { Tool } from "effect/ai"
import * as Hash from "effect/Hash"
import * as Schema from "effect/Schema"

import { Tools } from "./Tools"

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const catalogShape = Object.values(Tools.tools).map((tool) => [
  tool.name,
  Tool.getJsonSchema(tool),
  Schema.toJsonSchemaDocument(tool.successSchema)
])

export const catalogVersion = (Hash.string(encodeJson(catalogShape)) >>> 0)
  .toString(16)
  .padStart(8, "0")
