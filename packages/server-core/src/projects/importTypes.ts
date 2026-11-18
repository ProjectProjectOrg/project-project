import {
  TypeDraft,
  LIBRARY_KEY_MAX_LENGTH,
  isBuiltinTypeKey,
  type Library
} from "@pp/shared"
import * as Schema from "effect/Schema"

import { parseMarkdownFile } from "../markdown/fileContent"
import type { ImportedFile } from "./importTransform"

const decodeType = Schema.decodeUnknownSync(TypeDraft)

export const importedTypes = (files: ReadonlyArray<ImportedFile>) =>
  files.flatMap((file) => {
    const match = /^types\/([a-z0-9_-]+)\.md$/.exec(file.path)
    if (match === null) return []
    const { data, content } = parseMarkdownFile(file.content)
    if (data.hidden === true) return []
    return [decodeType({ ...data, key: match[1], body: content })]
  })

export const planImportedTypes = (
  types: ReadonlyArray<TypeDraft>,
  destination: Library["types"]
) => {
  const keys = new Set(destination.map((type) => type.key.toString()))
  const names = new Set(destination.map((type) => type.name))
  return types.map((type) => {
    let suffix = 1
    let key: string = type.key
    let name = type.name
    if (!isBuiltinTypeKey(key)) {
      while (keys.has(key) || names.has(name)) {
        suffix++
        const ending = String(suffix)
        key = `${type.key.slice(0, LIBRARY_KEY_MAX_LENGTH - ending.length)}${ending}`
        name = `${type.name.slice(0, 60 - ending.length)}${ending}`
      }
    }
    keys.add(key)
    names.add(name)
    return { sourceKey: type.key, key, name }
  })
}
