import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
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
import { useAppForm, useFormValues } from "@/lib/form"
import {
  analyseAt,
  appliedIconTreatment,
  buildIconImage,
  compositeToBlob,
  iconPreviewChanged,
  CUTOUT_APPLY_MAX_EDGE
} from "@/lib/iconDraft"
import type { LiveIcon } from "@/components/appearance/IconPreviewTile"
import { StepSummaryRow } from "@/components/appearance/AppearanceCard"
import { IconPreviewTile } from "@/components/appearance/IconPreviewTile"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"
import { CropStep } from "./crop-step"
import { iconFormOpts } from "./opts"
import { SourceStep } from "./source-step"
import { TreatmentStep } from "./treatment-step"
import { draftPreviewUrl, useIconDraft } from "./useIconDraft"

const makeProjectIcon = Schema.decodeUnknownSync(ProjectIcon)

export type IconForm = ReactFormType<ReturnType<typeof iconFormOpts>>

export function ProjectIconForm({
  orgSlug,
  slug,
  icon,
  iconImage,
  accent,
  onDone,
  onLiveChange
}: {
  orgSlug: string
  slug: string
  icon: string
  iconImage: ProjectIconImage | null
  accent: string
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

  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const [step, setStep] = useState(iconImage ? 1 : 0)
  const [treatmentBlocked, setTreatmentBlocked] = useState(false)
  const draft = useIconDraft()
  const reduce = useReducedMotion() ?? false
  const fade = reduce ? { duration: 0 } : transitions.fade
  const fadeIn = reduce ? false : { opacity: 0, y: -4 }
  const fadeOut = { opacity: 0, y: 4 }

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
        kind: iconImage?.type === "full_bleed" ? "full_bleed" : "sticker",
        tolerance:
          iconImage?.type === "sticker" && iconImage.cutoutTolerance !== null
            ? iconImage.cutoutTolerance
            : CUTOUT_DEFAULT_TOLERANCE
      }
    },
    onSubmit: async ({ value }) => {
      if (busy) return
      draft.setRejected(false)
      setTreatmentBlocked(false)
      if (value.source.kind === "emoji") {
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

      let compressed: File
      let rendered: File | null = null
      let classification: Parameters<typeof buildIconImage>[0]["classification"]
      try {
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
        classification = {
          treatment: value.treatment.kind,
          clean,
          transparent,
          tolerance: value.treatment.tolerance
        }
        compressed = await compressImage(file, {
          maxEdge: 1024,
          hasAlpha: transparent,
          quality: 0.85
        })
        if (!mounted.current) return
        if (wantsSticker)
          rendered = transparent
            ? file
            : new File([await compositeToBlob(source, alpha)], "icon.png", {
                type: "image/png"
              })
      } catch {
        if (mounted.current) draft.setRejected(true)
        return
      }
      if (!mounted.current) return
      const uploadedSource = await upload({ file: compressed })
      if (!mounted.current || Exit.isFailure(uploadedSource)) return
      const uploadedRendered = rendered
        ? await upload({ file: rendered })
        : uploadedSource
      if (!mounted.current || Exit.isFailure(uploadedRendered)) return

      const saved = await update({
        iconImage: buildIconImage({
          classification,
          sourceAttachmentId: uploadedSource.value.id,
          renderedAttachmentId: uploadedRendered.value.id,
          crop: value.crop
        })
      })
      if (mounted.current && Exit.isSuccess(saved)) onDone?.()
    }
  })

  const values = useFormValues(form)
  const previewUrl = draft.preview ? draftPreviewUrl(draft.preview) : null

  const thumb = (src: string | null) =>
    src ? (
      <IconPreviewTile
        live={{
          kind: "image",
          src,
          crop: values.crop,
          treatment: values.treatment.kind
        }}
        size={28}
        radius={8}
      />
    ) : (
      <span className="grid size-7 shrink-0 place-items-center rounded-lg corner-squircle bg-muted text-sm leading-none">
        {values.source.emoji}
      </span>
    )

  useEffect(() => {
    if (!iconImage) return
    void draft.primeFrom(attachmentUrl(orgSlug, iconImage.sourceAttachmentId), {
      treatment: iconImage.type === "sticker" ? "sticker" : "full_bleed",
      tolerance:
        iconImage.type === "sticker" && iconImage.cutoutTolerance !== null
          ? iconImage.cutoutTolerance
          : CUTOUT_DEFAULT_TOLERANCE
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iconImage, orgSlug])

  const resolved = draft.preview?.treatment
  useEffect(() => {
    if (resolved && resolved !== form.state.values.treatment.kind)
      form.setFieldValue("treatment.kind", resolved)
  }, [form, resolved, values.source.objectUrl])

  const changed = iconPreviewChanged(
    values,
    { icon, iconImage },
    draft.fileName() !== null,
    CUTOUT_DEFAULT_TOLERANCE
  )

  useEffect(() => {
    if (!onLiveChange) return undefined
    onLiveChange(
      !changed
        ? null
        : values.source.kind === "emoji"
          ? { kind: "emoji", emoji: values.source.emoji }
          : previewUrl
            ? {
                kind: "image",
                src: previewUrl,
                crop: values.crop,
                treatment: values.treatment.kind
              }
            : null
    )
    return () => onLiveChange(null)
  }, [
    onLiveChange,
    changed,
    previewUrl,
    values.crop,
    values.source.kind,
    values.source.emoji,
    values.treatment.kind
  ])

  const sourceDetail =
    values.source.kind === "emoji"
      ? `${m.project_icon_source_emoji_tab()} · ${values.source.emoji}`
      : (draft.fileName() ?? m.project_appearance_icon_custom())

  const removeImage = async () => {
    const saved = await update({ iconImage: null })
    if (mounted.current && Exit.isSuccess(saved)) onDone?.()
  }

  return (
    <form.AppForm>
      {draft.rejected ? (
        <p role="alert" className="px-3 pt-3 text-[13px] text-destructive">
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
              orgSlug={orgSlug}
              busy={busy}
              error={failed}
              onAdvance={() => {
                if (form.state.values.source.kind === "emoji") {
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
