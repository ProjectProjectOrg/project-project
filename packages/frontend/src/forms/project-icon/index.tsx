import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { useEffect, useState } from "react"
import {
  attachmentUrl,
  ProjectIcon,
  type ProjectIconImage
} from "@projectproject/shared"
import type { ReactFormType } from "@tanstack/react-form"
import { uploadProjectImageAtom } from "@/atoms/attachments"
import { projectKey, updateProjectAtom } from "@/atoms/projects"
import { compressImage } from "@/lib/imageCompression"
import { CUTOUT_DEFAULT_TOLERANCE, hasAlpha } from "@/lib/iconCutout"
import { useAppForm } from "@/lib/form"
import {
  analyseAt,
  buildIconImage,
  compositeToBlob,
  CUTOUT_APPLY_MAX_EDGE
} from "@/lib/iconDraft"
import type { LiveIcon } from "@/components/appearance/IconPreviewTile"
import { m } from "@/paraglide/messages"
import { CropStep } from "./crop-step"
import { iconFormOpts } from "./opts"
import { SourceStep } from "./source-step"
import { TreatmentStep } from "./treatment-step"
import { StepSummary } from "./step-summary"
import { useIconDraft } from "./useIconDraft"

const makeProjectIcon = Schema.decodeUnknownSync(ProjectIcon)

export type IconForm = ReactFormType<ReturnType<typeof iconFormOpts>>

export function ProjectIconForm({
  orgSlug,
  slug,
  icon,
  iconImage,
  onDone,
  onLiveChange
}: {
  orgSlug: string
  slug: string
  icon: string
  iconImage: ProjectIconImage | null
  onDone?: () => void
  onLiveChange?: (live: LiveIcon | null) => void
}) {
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateProjectAtom(key), { mode: "promiseExit" })
  const upload = useAtomSet(uploadProjectImageAtom(key), {
    mode: "promiseExit"
  })
  const updateState = useAtomValue(updateProjectAtom(key))
  const uploadState = useAtomValue(uploadProjectImageAtom(key))
  const busy = updateState.waiting || uploadState.waiting
  const failed =
    AsyncResult.isFailure(updateState) || AsyncResult.isFailure(uploadState)

  const [step, setStep] = useState(0)
  const draft = useIconDraft()

  const form = useAppForm({
    ...iconFormOpts(icon, iconImage !== null),
    defaultValues: {
      ...iconFormOpts(icon, iconImage !== null).defaultValues,
      source: {
        kind: iconImage ? ("image" as const) : ("emoji" as const),
        emoji: icon,
        objectUrl: iconImage
          ? attachmentUrl(orgSlug, iconImage.sourceAttachmentId)
          : null
      },
      crop: iconImage ? { ...iconImage.crop } : { x: 0.5, y: 0.5, zoom: 1 },
      treatment: {
        kind: iconImage?.type === "sticker" ? "sticker" : "full_bleed",
        tolerance:
          iconImage?.type === "sticker" && iconImage.cutoutTolerance !== null
            ? iconImage.cutoutTolerance
            : CUTOUT_DEFAULT_TOLERANCE
      }
    },
    onSubmit: async ({ value }) => {
      if (value.source.kind === "emoji") {
        const saved = await update({
          icon: makeProjectIcon(value.source.emoji),
          iconImage: null
        })
        if (Exit.isSuccess(saved)) onDone?.()
        return
      }

      const bitmap = draft.bitmap()
      const file = draft.file()

      if (!bitmap || !file) {
        if (!iconImage) return
        const saved = await update({
          iconImage: { ...iconImage, crop: value.crop }
        })
        if (Exit.isSuccess(saved)) onDone?.()
        return
      }

      const { source, alpha, clean } = analyseAt(
        bitmap,
        CUTOUT_APPLY_MAX_EDGE,
        value.treatment.tolerance
      )
      const transparent = hasAlpha(source)
      const wantsSticker = value.treatment.kind === "sticker"

      if (wantsSticker && !clean) {
        draft.markUnclean()
        return
      }

      let compressed: File
      try {
        compressed = await compressImage(file, {
          maxEdge: 1024,
          hasAlpha: transparent,
          quality: 0.85
        })
      } catch {
        draft.setRejected(true)
        return
      }

      const uploadedSource = await upload({ file: compressed })
      if (Exit.isFailure(uploadedSource)) return

      const uploadedRendered = !wantsSticker
        ? uploadedSource
        : transparent
          ? await upload({ file })
          : await upload({
              file: new File(
                [await compositeToBlob(source, alpha)],
                "icon.png",
                { type: "image/png" }
              )
            })
      if (Exit.isFailure(uploadedRendered)) return

      const saved = await update({
        iconImage: buildIconImage({
          classification: {
            treatment: value.treatment.kind,
            clean,
            transparent,
            tolerance: value.treatment.tolerance
          },
          sourceAttachmentId: uploadedSource.value.id,
          renderedAttachmentId: uploadedRendered.value.id,
          crop: value.crop
        })
      })
      if (Exit.isSuccess(saved)) onDone?.()
    }
  })

  const values = form.state.values
  const previewUrl = draft.preview?.url ?? null

  useEffect(() => {
    if (!onLiveChange) return undefined
    onLiveChange(
      previewUrl
        ? {
            src: previewUrl,
            crop: values.crop,
            treatment: values.treatment.kind
          }
        : null
    )
    return () => onLiveChange(null)
  }, [
    onLiveChange,
    previewUrl,
    values.crop.x,
    values.crop.y,
    values.crop.zoom,
    values.treatment.kind
  ])

  const summaries = [
    {
      label: m.project_icon_step_source_label(),
      value:
        values.source.kind === "emoji"
          ? m.project_icon_summary_emoji({ emoji: values.source.emoji })
          : m.project_icon_summary_image()
    },
    {
      label: m.project_icon_step_crop_label(),
      value: m.project_icon_summary_crop({ zoom: values.crop.zoom.toFixed(2) })
    }
  ]

  return (
    <form.AppForm>
      {summaries.slice(0, step).map((summary, index) => (
        <StepSummary
          key={summary.label}
          label={summary.label}
          value={summary.value}
          onChange={() => setStep(index)}
        />
      ))}

      {step === 0 && (
        <SourceStep
          form={form}
          draft={draft}
          orgSlug={orgSlug}
          onAdvance={() => {
            if (form.state.values.source.kind === "emoji") {
              void form.handleSubmit()
              return
            }
            setStep(1)
          }}
        />
      )}
      {step === 1 && (
        <CropStep
          form={form}
          src={form.state.values.source.objectUrl ?? ""}
          onBack={() => setStep(0)}
          onAdvance={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <TreatmentStep
          form={form}
          draft={draft}
          busy={busy}
          error={failed}
          onBack={() => setStep(1)}
        />
      )}
    </form.AppForm>
  )
}
