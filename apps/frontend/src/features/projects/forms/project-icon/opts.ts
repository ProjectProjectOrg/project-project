import { attachmentUrl, type ProjectIconImage } from "@pp/shared"
import { createValidator } from "@tanstack/react-form"
import * as Schema from "effect/Schema"

import {
  CUTOUT_DEFAULT_TOLERANCE,
  CUTOUT_MAX_TOLERANCE
} from "@/features/projects/lib/iconCutout"
import { appliedIconTreatment } from "@/features/projects/lib/iconDraft"
import { appFormOptions } from "@/lib/form"

export const IconSource = Schema.TaggedUnion({
  emoji: {
    emoji: Schema.NonEmptyString,
    objectUrl: Schema.NullOr(Schema.String)
  },
  image: {
    emoji: Schema.String,
    objectUrl: Schema.String
  }
})

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

const iconFormSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    source: IconSource,
    crop: IconCropShape,
    treatment: IconTreatmentShape
  })
)

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

export const iconFormOpts = (
  icon: string,
  iconImage: ProjectIconImage | null,
  orgSlug: string
) =>
  appFormOptions.looseSchema(iconFormSchema, {
    defaultValues: {
      source: {
        _tag: iconImage ? "image" : "emoji",
        emoji: icon,
        objectUrl: iconImage
          ? attachmentUrl(orgSlug, iconImage.sourceAttachmentId)
          : null
      },
      crop: iconImage ? { ...iconImage.crop } : { x: 0.5, y: 0.5, zoom: 1 },
      treatment: appliedIconTreatment(iconImage, CUTOUT_DEFAULT_TOLERANCE)
    },
    validators: [
      {
        run: iconFormSchema,
        triggers: []
      }
    ]
  })
