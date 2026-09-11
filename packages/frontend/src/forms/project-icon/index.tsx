import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { useState } from "react"
import { ProjectIcon, type ProjectIconImage } from "@projectproject/shared"
import type { ReactFormType } from "@tanstack/react-form"
import { uploadProjectImageAtom } from "@/atoms/attachments"
import { projectKey, updateProjectAtom } from "@/atoms/projects"
import { compressImage } from "@/lib/imageCompression"
import { hasAlpha } from "@/lib/iconCutout"
import { useAppForm } from "@/lib/form"
import {
  analyseAt,
  buildIconImage,
  compositeToBlob,
  CUTOUT_APPLY_MAX_EDGE
} from "@/lib/iconDraft"
import { CropStep } from "./crop-step"
import { iconFormOpts } from "./opts"
import { SourceStep } from "./source-step"
import { TreatmentStep } from "./treatment-step"
import { useIconDraft } from "./useIconDraft"

const makeProjectIcon = Schema.decodeUnknownSync(ProjectIcon)

export type IconForm = ReactFormType<ReturnType<typeof iconFormOpts>>

export function ProjectIconForm({
  orgSlug,
  slug,
  icon,
  iconImage,
  onDone
}: {
  orgSlug: string
  slug: string
  icon: string
  iconImage: ProjectIconImage | null
  onDone?: () => void
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
      if (!bitmap || !file) return

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

  return (
    <form.AppForm>
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
