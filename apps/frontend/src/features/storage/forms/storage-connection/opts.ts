import type { ConnectStorageInput } from "@pp/shared"
import * as Schema from "effect/Schema"

import { appFormOptions, validateAfterSubmit } from "@/lib/form"

export type StorageConnectionValues = Readonly<{
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  keyPrefix: string
  forcePathStyle: boolean
}>

const Required = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0)
)

const StorageConnectionSchema = Schema.Struct({
  endpoint: Required,
  bucket: Required,
  region: Required,
  accessKeyId: Required,
  secretAccessKey: Required,
  keyPrefix: Schema.String,
  forcePathStyle: Schema.Boolean
})

export const toConnectStorageInput = (
  values: StorageConnectionValues
): ConnectStorageInput => {
  const keyPrefix = values.keyPrefix.trim()
  return {
    endpoint: values.endpoint.trim(),
    bucket: values.bucket.trim(),
    region: values.region.trim(),
    accessKeyId: values.accessKeyId.trim(),
    secretAccessKey: values.secretAccessKey,
    keyPrefix: keyPrefix.length > 0 ? keyPrefix : null,
    forcePathStyle: values.forcePathStyle
  }
}

const defaultValues: StorageConnectionValues = {
  endpoint: "",
  bucket: "",
  region: "auto",
  accessKeyId: "",
  secretAccessKey: "",
  keyPrefix: "",
  forcePathStyle: true
}

export const storageConnectionFormOpts = appFormOptions({
  defaultValues,
  validators: [
    validateAfterSubmit(Schema.toStandardSchemaV1(StorageConnectionSchema))
  ]
})
