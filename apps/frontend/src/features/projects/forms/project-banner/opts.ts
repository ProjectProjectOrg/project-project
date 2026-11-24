import type { ProjectBanner } from "@pp/shared"
import { createValidator } from "@tanstack/react-form"
import * as Schema from "effect/Schema"

import { bannerDefaults } from "@/features/projects/lib/bannerPresets"
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

export const bannerFormOpts = (
  banner: ProjectBanner | null,
  src: string | null
) => {
  const source: typeof BannerSource.Type = {
    kind:
      banner === null
        ? "none"
        : banner.type === "preset"
          ? "artwork"
          : "upload",
    src,
    preset: banner?.type === "preset" ? banner.preset : null
  }
  return appFormOptions({
    defaultValues: {
      source,
      crop: {
        ...(banner?.crop ?? {
          x: bannerDefaults.x,
          y: bannerDefaults.y,
          zoom: bannerDefaults.zoom
        })
      }
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
}
