import { createValidator } from "@tanstack/react-form"
import * as Schema from "effect/Schema"
import { appFormOptions } from "@/lib/form"

export const BannerSource = Schema.Struct({
  kind: Schema.Literals(["artwork", "upload", "none"]),
  src: Schema.NullOr(Schema.String),
  preset: Schema.NullOr(Schema.String)
})

export const BannerCrop = Schema.Struct({
  x: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  y: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  zoom: Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 4 }))
})

export const bannerSourceSchema = Schema.toStandardSchemaV1(BannerSource)
export const bannerCropSchema = Schema.toStandardSchemaV1(BannerCrop)

export const bannerStepValidator = createValidator({
  triggers: [
    {
      trigger: "change",
      when: ({ groupApi, formApi }) =>
        (groupApi?.state.submissionAttempts ??
          formApi.state.submissionAttempts) > 0
    }
  ]
})

export const bannerFormOpts = (initial: {
  kind: "artwork" | "upload" | "none"
  src: string | null
  preset: string | null
  crop: { x: number; y: number; zoom: number }
}) =>
  appFormOptions({
    defaultValues: {
      source: {
        kind: initial.kind,
        src: initial.src,
        preset: initial.preset
      },
      crop: initial.crop
    },
    validators: [
      {
        run: Schema.toStandardSchemaV1(
          Schema.Struct({ source: BannerSource, crop: BannerCrop })
        ),
        triggers: []
      }
    ]
  })
