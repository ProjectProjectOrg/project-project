import { createValidator } from "@tanstack/react-form"
import type { IconTreatment } from "@/lib/iconDraft"
import * as Schema from "effect/Schema"
import { appFormOptions } from "@/lib/form"
import {
  CUTOUT_DEFAULT_TOLERANCE,
  CUTOUT_MAX_TOLERANCE
} from "@/lib/iconCutout"

export const IconSource = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("emoji"),
    emoji: Schema.NonEmptyString,
    objectUrl: Schema.NullOr(Schema.String)
  }),
  Schema.Struct({
    kind: Schema.Literal("image"),
    emoji: Schema.String,
    objectUrl: Schema.String
  })
])

export const IconCropShape = Schema.Struct({
  x: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  y: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  zoom: Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 4 }))
})

export const IconTreatmentShape = Schema.Struct({
  kind: Schema.Literals(["sticker", "full_bleed"]),
  tolerance: Schema.Number.check(
    Schema.isBetween({ minimum: 0, maximum: CUTOUT_MAX_TOLERANCE })
  )
})

export const sourceSchema = Schema.toStandardSchemaV1(IconSource)
export const cropSchema = Schema.toStandardSchemaV1(IconCropShape)
export const treatmentSchema = Schema.toStandardSchemaV1(IconTreatmentShape)

export const stepValidator = createValidator({
  triggers: [
    {
      trigger: "change",
      when: ({ groupApi, formApi }) =>
        (groupApi?.state.submissionAttempts ??
          formApi.state.submissionAttempts) > 0
    }
  ]
})

export const iconFormOpts = (icon: string, hasImage: boolean) =>
  appFormOptions({
    defaultValues: {
      source: {
        kind: (hasImage ? "image" : "emoji") as "emoji" | "image",
        emoji: icon,
        objectUrl: null as string | null
      },
      crop: { x: 0.5, y: 0.5, zoom: 1 },
      treatment: {
        kind: "sticker" as IconTreatment,
        tolerance: CUTOUT_DEFAULT_TOLERANCE
      }
    },
    validators: [
      {
        run: Schema.toStandardSchemaV1(
          Schema.Struct({
            source: IconSource,
            crop: IconCropShape,
            treatment: IconTreatmentShape
          })
        ),
        triggers: []
      }
    ]
  })
