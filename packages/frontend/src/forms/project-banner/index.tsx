import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Exit from "effect/Exit"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import {
  ATTACHMENT_MAX_BYTES,
  isRasterImageContentType,
  type ProjectBanner
} from "@projectproject/shared"
import type { ReactFormType } from "@tanstack/react-form"
import { uploadProjectImageAtom } from "@/atoms/attachments"
import {
  projectBannerPreviewAtom,
  projectKey,
  updateProjectAtom
} from "@/atoms/projects"
import {
  bannerDefaults,
  bannerPresets,
  bannerSource
} from "@/components/project-banner-presets"
import { compressBanner, type CompressedBanner } from "@/lib/imageCompression"
import { StepSummaryRow } from "@/components/appearance/AppearanceCard"
import { transitions } from "@/lib/springs"
import { useAppForm } from "@/lib/form"
import { m } from "@/paraglide/messages"
import { BannerCropStep } from "./crop-step"
import { bannerFormOpts } from "./opts"
import { BannerSourceStep } from "./source-step"

export type BannerForm = ReactFormType<ReturnType<typeof bannerFormOpts>>

export function ProjectBannerForm({
  orgSlug,
  slug,
  banner,
  onDone
}: {
  orgSlug: string
  slug: string
  banner: ProjectBanner | null
  onDone?: () => void
}) {
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateProjectAtom(key), { mode: "promiseExit" })
  const upload = useAtomSet(uploadProjectImageAtom(key), {
    mode: "promiseExit"
  })
  const updateState = useAtomValue(updateProjectAtom(key))
  const uploadState = useAtomValue(uploadProjectImageAtom(key))
  const setPreview = useAtomSet(projectBannerPreviewAtom(key))
  const busy = updateState.waiting || uploadState.waiting
  const failed =
    AsyncResult.isFailure(updateState) || AsyncResult.isFailure(uploadState)

  const [step, setStep] = useState(0)
  const [rejected, setRejected] = useState(false)
  const reduce = useReducedMotion() ?? false
  const fade = reduce ? { duration: 0 } : transitions.fade
  const fadeIn = reduce ? false : { opacity: 0, y: -4 }
  const fadeOut = { opacity: 0, y: 4 }
  const fileRef = useRef<File | null>(null)
  const objectUrls = useRef<string[]>([])

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    },
    []
  )

  const applied = bannerSource(orgSlug, banner) ?? null
  const form = useAppForm({
    ...bannerFormOpts({
      kind:
        banner === null
          ? "none"
          : banner.type === "preset"
            ? "artwork"
            : "upload",
      src: applied,
      preset: banner?.type === "preset" ? banner.preset : null,
      crop: {
        x: banner?.crop.x ?? bannerDefaults.x,
        y: banner?.crop.y ?? bannerDefaults.y,
        zoom: banner?.crop.zoom ?? bannerDefaults.zoom
      }
    }),
    onSubmit: async ({ value }) => {
      let next: ProjectBanner | null = null

      if (value.source.kind !== "none") {
        if (fileRef.current) {
          let compressed: CompressedBanner
          try {
            compressed = await compressBanner(fileRef.current, {
              maxEdge: 2560,
              hasAlpha: false,
              quality: 0.82
            })
          } catch {
            setRejected(true)
            return
          }
          const uploaded = await upload({ file: compressed.file })
          if (Exit.isFailure(uploaded)) return
          next = {
            type: "attachment",
            attachmentId: uploaded.value.id,
            crop: value.crop,
            placeholder: compressed.placeholder
          }
        } else {
          const preset = bannerPresets.find(
            (entry) => entry.id === value.source.preset
          )
          if (preset) {
            next = {
              type: "preset",
              preset: preset.id,
              crop: value.crop,
              placeholder: null
            }
          } else if (banner) {
            next = { ...banner, crop: value.crop }
          }
        }
      }

      const saved = await update({ banner: next })
      if (Exit.isSuccess(saved)) {
        setPreview(null)
        onDone?.()
      }
    }
  })

  const values = form.state.values

  useEffect(() => {
    setPreview({
      source: values.source.kind === "none" ? null : values.source.src,
      crop: { ...bannerDefaults, ...values.crop }
    })
    return () => setPreview(null)
  }, [setPreview, values.source.kind, values.source.src, values.crop])

  const preset = bannerPresets.find(
    (entry) => entry.id === values.source.preset
  )
  const sourceDetail = preset
    ? `${preset.label()} · ${preset.artist}`
    : (fileRef.current?.name ?? m.project_appearance_banner_none())

  const removeBanner = () => {
    fileRef.current = null
    form.setFieldValue("source.kind", "none")
    form.setFieldValue("source.src", null)
    form.setFieldValue("source.preset", null)
    void form.handleSubmit()
  }

  return (
    <form.AppForm>
      <AnimatePresence initial={false}>
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
              thumb={
                <span className="block h-7 w-[84px] shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
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
              value={sourceDetail}
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
              orgSlug={orgSlug}
              rejected={rejected}
              onPickFile={(file) => {
                if (
                  !isRasterImageContentType(file.type) ||
                  file.size > ATTACHMENT_MAX_BYTES ||
                  file.size === 0
                ) {
                  setRejected(true)
                  return
                }
                setRejected(false)
                fileRef.current = file
                const url = URL.createObjectURL(file)
                objectUrls.current.push(url)
                form.setFieldValue("source.kind", "upload")
                form.setFieldValue("source.src", url)
                form.setFieldValue("source.preset", null)
                form.setFieldValue("crop.x", 0.5)
                form.setFieldValue("crop.y", 0.5)
                form.setFieldValue("crop.zoom", 1)
                setStep(1)
              }}
              onAdvance={() => {
                if (!values.source.src) return
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
              onRemove={removeBanner}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </form.AppForm>
  )
}
