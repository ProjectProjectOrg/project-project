import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  ATTACHMENT_MAX_BYTES,
  isRasterImageContentType,
  type ProjectBanner
} from "@pp/shared"
import { useMountedRef } from "@pp/ui/hooks/useMountedRef"
import { transitions } from "@pp/ui/lib/springs"
import type { ReactFormType } from "@tanstack/react-form"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { AnimatePresence, m as motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"

import {
  uploadProjectImage,
  uploadProjectImageRequest
} from "@/features/attachments/atoms/attachments"
import {
  projectBannerPreview,
  projectRequest,
  updateProject
} from "@/features/projects/atoms/projects"
import { StepSummaryRow } from "@/features/projects/components/appearance/AppearanceCard"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { bannerPreviewChanged } from "@/features/projects/lib/bannerFrame"
import {
  bannerDefaults,
  bannerPresets,
  bannerSource
} from "@/features/projects/lib/bannerPresets"
import {
  compressBanner,
  type CompressedBanner
} from "@/features/projects/lib/imageCompression"
import { useSave } from "@/hooks/useSave"
import { useAppForm, useFormValues } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { BannerCropStep } from "./CropStep"
import { bannerFormOpts, type BannerSource, type BannerCrop } from "./opts"
import { BannerSourceStep } from "./SourceStep"

export type BannerForm = ReactFormType<ReturnType<typeof bannerFormOpts>>

function bannerSourceDetail(
  source: typeof BannerSource.Type,
  file: File | null
) {
  const preset = bannerPresets.find((entry) => entry.id === source.preset)
  return preset
    ? `${preset.label()} · ${preset.artist}`
    : (file?.name ??
        (source.src
          ? m.project_appearance_banner_custom()
          : m.project_appearance_banner_none()))
}

function croppedBanner(
  banner: ProjectBanner | null,
  selected: string | null,
  crop: typeof BannerCrop.Type
) {
  const preset = bannerPresets.find((entry) => entry.id === selected)
  if (preset)
    return {
      type: "preset",
      preset: preset.id,
      crop,
      placeholder: null
    } satisfies ProjectBanner
  return banner ? { ...banner, crop } : null
}

export function ProjectBannerForm({
  banner,
  onDone
}: {
  banner: ProjectBanner | null
  onDone?: () => void
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = projectRequest(orgSlug, slug)
  const uploadReq = uploadProjectImageRequest(orgSlug, slug)
  const save = useSave(useAtomSet(updateProject(req), { mode: "promiseExit" }))
  const update = save.run
  const upload = useAtomSet(uploadProjectImage(uploadReq), {
    mode: "promiseExit"
  })
  const uploadState = useAtomValue(uploadProjectImage(uploadReq))
  const setPreview = useAtomSet(
    projectBannerPreview(projectRequest(orgSlug, slug))
  )
  const busy = save.waiting || uploadState.waiting
  const failed = save.error !== null || AsyncResult.isFailure(uploadState)

  const [step, setStep] = useState(banner ? 1 : 0)
  const [rejected, setRejected] = useState(false)
  const reduce = useReducedMotion() ?? false
  const fade = reduce ? { duration: 0 } : transitions.fade
  const fadeIn = reduce ? false : { opacity: 0, y: -4 }
  const fadeOut = { opacity: 0, y: 4 }
  const mounted = useMountedRef()
  const [file, setFile] = useState<File | null>(null)
  const objectUrls = useRef<string[]>([])

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    },
    []
  )

  const applied = bannerSource(orgSlug, banner) ?? null
  const form = useAppForm({
    ...bannerFormOpts(banner, applied),
    onSubmit: async ({ value }) => {
      setRejected(false)
      let next: ProjectBanner | null = null

      if (value.source.kind !== "none") {
        if (value.source.kind === "upload" && file) {
          let compressed: CompressedBanner
          try {
            compressed = await compressBanner(file, {
              maxEdge: 2560,
              hasAlpha: false,
              quality: 0.82
            })
          } catch {
            if (mounted.current) setRejected(true)
            return
          }
          if (!mounted.current) return
          const uploaded = await upload({ file: compressed.file })
          if (!mounted.current || Exit.isFailure(uploaded)) return
          next = {
            type: "attachment",
            attachmentId: uploaded.value.id,
            crop: value.crop,
            placeholder: compressed.placeholder
          }
        } else {
          next = croppedBanner(banner, value.source.preset, value.crop)
        }
      }

      if (!mounted.current) return
      const saved = await update({ banner: next })
      if (mounted.current && Exit.isSuccess(saved)) {
        setPreview(null)
        onDone?.()
      }
    }
  })

  const values = useFormValues(form)

  useEffect(() => {
    const preview = {
      source: values.source.kind === "none" ? null : values.source.src,
      crop: { ...bannerDefaults, ...values.crop }
    }
    setPreview(
      bannerPreviewChanged(preview, applied, banner?.crop ?? bannerDefaults)
        ? preview
        : null
    )
    return () => setPreview(null)
  }, [
    setPreview,
    applied,
    banner?.crop,
    values.source.kind,
    values.source.src,
    values.crop
  ])

  const removeBanner = () => {
    setFile(null)
    form.setFieldValue("source.kind", "none")
    form.setFieldValue("source.src", null)
    form.setFieldValue("source.preset", null)
    void form.handleSubmit()
  }

  return (
    <form.AppForm>
      <AnimatePresence initial={false} mode="popLayout">
        {step > 0 && (
          <motion.div
            key="banner-source-summary"
            initial={fadeIn}
            animate={{ opacity: 1, y: 0 }}
            exit={fadeOut}
            transition={fade}
          >
            <StepSummaryRow
              shareId="banner-source"
              thumbShareId={
                values.source.preset
                  ? `banner-preset-${values.source.preset}`
                  : undefined
              }
              thumb={
                <span className="block h-7 w-21 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
                  {values.source.src ? (
                    <img
                      src={values.source.src}
                      alt=""
                      className="size-full object-cover"
                      style={{
                        objectPosition: `${values.crop.x * 100}% ${values.crop.y * 100}%`
                      }}
                    />
                  ) : null}
                </span>
              }
              label={m.project_banner_summary_source_label()}
              value={bannerSourceDetail(values.source, file)}
              onChange={() => setStep(0)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="popLayout">
        {step === 0 && (
          <motion.div
            key="banner-source"
            initial={fadeIn}
            animate={{ opacity: 1, y: 0 }}
            exit={fadeOut}
            transition={fade}
          >
            <BannerSourceStep
              form={form}
              rejected={rejected}
              onPickPreset={() => {
                setFile(null)
              }}
              onPickFile={(file) => {
                if (
                  !isRasterImageContentType(file.type) ||
                  file.size > ATTACHMENT_MAX_BYTES ||
                  file.size === 0
                ) {
                  setRejected(true)
                  return false
                }
                setRejected(false)
                setFile(file)
                const url = URL.createObjectURL(file)
                objectUrls.current.push(url)
                form.setFieldValue("source.kind", "upload")
                form.setFieldValue("source.src", url)
                form.setFieldValue("source.preset", null)
                form.setFieldValue("crop.x", 0.5)
                form.setFieldValue("crop.y", 0.5)
                form.setFieldValue("crop.zoom", 1)
                return true
              }}
              onAdvance={() => {
                if (!form.state.values.source.src) return
                setStep(1)
              }}
            />
          </motion.div>
        )}
        {step === 1 && (
          <motion.div
            key="banner-crop"
            initial={fadeIn}
            animate={{ opacity: 1, y: 0 }}
            exit={fadeOut}
            transition={fade}
          >
            <BannerCropStep
              form={form}
              src={values.source.src ?? ""}
              busy={busy}
              error={failed}
              rejected={rejected}
              onRemove={removeBanner}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </form.AppForm>
  )
}
