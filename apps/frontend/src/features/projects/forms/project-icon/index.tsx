import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { attachmentUrl, ProjectIcon, type ProjectIconImage } from "@pp/shared"
import { useMountedRef } from "@pp/ui/hooks/useMountedRef"
import { transitions } from "@pp/ui/lib/springs"
import type { ReactFormType } from "@tanstack/react-form"
import * as Exit from "effect/Exit"
import * as Predicate from "effect/Predicate"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { AnimatePresence, m as motion, useReducedMotion } from "motion/react"
import { useEffect, useEffectEvent, useState } from "react"

import {
  uploadProjectImage,
  uploadProjectImageRequest
} from "@/features/attachments/atoms/attachments"
import {
  projectRequest,
  updateProject
} from "@/features/projects/atoms/projects"
import { StepSummaryRow } from "@/features/projects/components/appearance/AppearanceCard"
import { IconPreviewTile } from "@/features/projects/components/appearance/IconPreviewTile"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { CUTOUT_DEFAULT_TOLERANCE } from "@/features/projects/lib/iconCutout"
import {
  LiveIcon,
  type IconDraftValues,
  prepareIconFiles,
  appliedIconTreatment,
  buildIconImage,
  iconPreviewChanged
} from "@/features/projects/lib/iconDraft"
import { useSave } from "@/hooks/useSave"
import { useAppForm, useFormValues } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { CropStep } from "./CropStep"
import { iconFormOpts } from "./opts"
import { SourceStep } from "./SourceStep"
import { TreatmentStep } from "./TreatmentStep"
import { draftPreviewUrl, useIconDraft } from "./useIconDraft"

const makeProjectIcon = Schema.decodeUnknownSync(ProjectIcon)

export type IconForm = ReactFormType<ReturnType<typeof iconFormOpts>>

function useLiveIcon({
  values,
  icon,
  iconImage,
  fileName,
  previewUrl,
  onLiveChange
}: Readonly<{
  values: IconDraftValues
  icon: string
  iconImage: ProjectIconImage | null
  fileName: string | null
  previewUrl: string | null
  onLiveChange: ((live: LiveIcon | null) => void) | undefined
}>) {
  const changed = iconPreviewChanged(
    values,
    { icon, iconImage },
    fileName !== null,
    CUTOUT_DEFAULT_TOLERANCE
  )

  const pickedEmoji = Predicate.isTagged(values.source, "emoji")
    ? values.source.emoji
    : null

  useEffect(() => {
    if (!onLiveChange) return undefined
    onLiveChange(
      !changed
        ? null
        : pickedEmoji !== null
          ? LiveIcon.emoji({ emoji: pickedEmoji })
          : previewUrl
            ? LiveIcon.image({
                src: previewUrl,
                crop: values.crop,
                treatment: values.treatment.kind
              })
            : null
    )
    return () => onLiveChange(null)
  }, [
    onLiveChange,
    changed,
    previewUrl,
    values.crop,
    pickedEmoji,
    values.treatment.kind
  ])

  return pickedEmoji !== null
    ? `${m.project_icon_source_emoji_tab()} · ${pickedEmoji}`
    : (fileName ?? m.project_appearance_icon_custom())
}

function useProjectIconUpload() {
  const { orgSlug, slug } = useProjectRoute()
  const req = projectRequest(orgSlug, slug)
  const uploadReq = uploadProjectImageRequest(orgSlug, slug)
  const save = useSave(useAtomSet(updateProject(req), { mode: "promiseExit" }))
  const update = save.run
  const upload = useAtomSet(uploadProjectImage(uploadReq), {
    mode: "promiseExit"
  })
  const uploadState = useAtomValue(uploadProjectImage(uploadReq))
  const busy = save.waiting || uploadState.waiting
  const failed = save.error !== null || AsyncResult.isFailure(uploadState)

  const mounted = useMountedRef()

  const draft = useIconDraft()
  const uploadImage = async (
    bitmap: Parameters<typeof prepareIconFiles>[0],
    file: File,
    treatment: IconDraftValues["treatment"],
    crop: IconDraftValues["crop"],
    onUnclean: () => void
  ) => {
    let files: Awaited<ReturnType<typeof prepareIconFiles>>
    try {
      files = await prepareIconFiles(bitmap, file, treatment)
    } catch {
      if (mounted.current) draft.setRejected(true)
      return null
    }
    if (!files) {
      if (mounted.current) {
        draft.markUnclean()
        onUnclean()
      }
      return null
    }
    const { compressed, rendered, classification } = files
    if (!mounted.current) return null
    const uploadedSource = await upload({ file: compressed })
    if (!mounted.current || Exit.isFailure(uploadedSource)) return null
    const uploadedRendered = rendered
      ? await upload({ file: rendered })
      : uploadedSource
    if (!mounted.current || Exit.isFailure(uploadedRendered)) return null

    return update({
      iconImage: buildIconImage({
        classification,
        sourceAttachmentId: uploadedSource.value.id,
        renderedAttachmentId: uploadedRendered.value.id,
        crop
      })
    })
  }
  return { orgSlug, draft, busy, failed, update, mounted, uploadImage }
}

export function ProjectIconForm({
  icon,
  iconImage,
  accent,
  onDone,
  onLiveChange
}: {
  icon: string
  iconImage: ProjectIconImage | null
  accent: string
  onDone?: () => void
  onLiveChange?: (live: LiveIcon | null) => void
}) {
  const { orgSlug, draft, busy, failed, update, mounted, uploadImage } =
    useProjectIconUpload()
  const [step, setStep] = useState(iconImage ? 1 : 0)
  const [treatmentBlocked, setTreatmentBlocked] = useState(false)
  const reduce = useReducedMotion() ?? false
  const fade = reduce ? { duration: 0 } : transitions.fade
  const fadeIn = reduce ? false : { opacity: 0, y: -4 }
  const fadeOut = { opacity: 0, y: 4 }

  const form = useAppForm({
    ...iconFormOpts(icon, iconImage, orgSlug),
    onSubmit: async ({ value }) => {
      if (busy) return
      draft.setRejected(false)
      setTreatmentBlocked(false)
      if (Predicate.isTagged(value.source, "emoji")) {
        const saved = await update({
          icon: makeProjectIcon(value.source.emoji),
          iconImage: null
        })
        if (mounted.current && Exit.isSuccess(saved)) onDone?.()
        return
      }

      const bitmap = draft.bitmap()
      const file = draft.file()

      if (!bitmap || !file) {
        if (!iconImage) return
        const applied = appliedIconTreatment(
          iconImage,
          CUTOUT_DEFAULT_TOLERANCE
        )
        if (
          value.treatment.kind !== applied.kind ||
          value.treatment.tolerance !== applied.tolerance
        ) {
          setTreatmentBlocked(true)
          return
        }
        const saved = await update({
          iconImage: { ...iconImage, crop: value.crop }
        })
        if (mounted.current && Exit.isSuccess(saved)) onDone?.()
        return
      }

      const saved = await uploadImage(
        bitmap,
        file,
        value.treatment,
        value.crop,
        () => form.setFieldValue("treatment.kind", "full_bleed")
      )
      if (saved && mounted.current && Exit.isSuccess(saved)) onDone?.()
    }
  })

  const values = useFormValues(form)
  const previewUrl = draft.preview
    ? draftPreviewUrl(draft.preview, values.treatment.kind)
    : null

  const thumb = (src: string | null) =>
    src ? (
      <IconPreviewTile
        live={LiveIcon.image({
          src,
          crop: values.crop,
          treatment: values.treatment.kind
        })}
        size={28}
        radius={8}
      />
    ) : (
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-body leading-none corner-squircle">
        {values.source.emoji}
      </span>
    )

  const primeFrom = useEffectEvent(draft.primeFrom)
  useEffect(() => {
    if (!iconImage) return
    void primeFrom(attachmentUrl(orgSlug, iconImage.sourceAttachmentId), {
      treatment: iconImage.type,
      tolerance: appliedIconTreatment(iconImage, CUTOUT_DEFAULT_TOLERANCE)
        .tolerance
    })
  }, [iconImage, orgSlug])

  const sourceDetail = useLiveIcon({
    values,
    icon,
    iconImage,
    fileName: draft.fileName(),
    previewUrl,
    onLiveChange
  })
  const removeImage = async () => {
    const saved = await update({ iconImage: null })
    if (mounted.current && Exit.isSuccess(saved)) onDone?.()
  }

  return (
    <form.AppForm>
      {draft.rejected ? (
        <p role="alert" className="px-3 pt-3 text-body text-destructive">
          {m.project_icon_file_rejected()}
        </p>
      ) : null}
      <AnimatePresence initial={false} mode="popLayout">
        {step > 0 && (
          <motion.div
            key="source-summary"
            initial={fadeIn}
            animate={{ opacity: 1, y: 0 }}
            exit={fadeOut}
            transition={fade}
          >
            <StepSummaryRow
              shareId="icon-source"
              thumb={thumb(values.source.objectUrl)}
              label={m.project_icon_summary_source_label()}
              value={sourceDetail}
              onChange={() => setStep(0)}
            />
          </motion.div>
        )}
        {step > 1 && (
          <motion.div
            key="crop-summary"
            initial={fadeIn}
            animate={{ opacity: 1, y: 0 }}
            exit={fadeOut}
            transition={fade}
          >
            <StepSummaryRow
              shareId="icon-crop"
              thumb={thumb(previewUrl ?? values.source.objectUrl)}
              label={m.project_icon_summary_crop_label()}
              value={m.project_icon_summary_crop_value({
                zoom: values.crop.zoom.toFixed(2)
              })}
              onChange={() => setStep(1)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="popLayout">
        {step === 0 && (
          <motion.div
            key="source"
            initial={fadeIn}
            animate={{ opacity: 1, y: 0 }}
            exit={fadeOut}
            transition={fade}
          >
            <SourceStep
              form={form}
              draft={draft}
              busy={busy}
              error={failed}
              onAdvance={() => {
                if (Predicate.isTagged(form.state.values.source, "emoji")) {
                  void form.handleSubmit()
                  return
                }
                setStep(1)
              }}
            />
          </motion.div>
        )}
        {step === 1 && (
          <motion.div
            key="crop"
            initial={fadeIn}
            animate={{ opacity: 1, y: 0 }}
            exit={fadeOut}
            transition={fade}
          >
            <CropStep
              form={form}
              src={values.source.objectUrl ?? ""}
              onAdvance={() => setStep(2)}
            />
          </motion.div>
        )}
        {step === 2 && (
          <motion.div
            key="treatment"
            initial={fadeIn}
            animate={{ opacity: 1, y: 0 }}
            exit={fadeOut}
            transition={fade}
          >
            <TreatmentStep
              blocked={treatmentBlocked}
              form={form}
              draft={draft}
              busy={busy}
              error={failed}
              accent={accent}
              onRemove={() => void removeImage()}
              onChangePhoto={() => setStep(0)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </form.AppForm>
  )
}
