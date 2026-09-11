import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import {
  ProjectColor,
  type ProjectBanner,
  type ProjectIconImage
} from "@projectproject/shared"
import {
  projectKey as makeProjectKey,
  updateProjectAtom
} from "@/atoms/projects"
import { ColorPicker } from "@/components/ColorPicker"
import { ProjectIconDisplay } from "@/components/ProjectIconDisplay"
import {
  AppearanceCard,
  AppearanceRow,
  EditorHeader
} from "@/components/appearance/AppearanceCard"
import type { LiveIcon } from "@/components/appearance/IconPreviewTile"
import { RenderPreviews } from "@/components/appearance/RenderPreviews"
import {
  bannerSource,
  bannerPresets
} from "@/components/project-banner-presets"
import { Button } from "@/components/ui/button"
import { ProjectBannerForm } from "@/forms/project-banner"
import { ProjectIconForm } from "@/forms/project-icon"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

const makeProjectColor = Schema.decodeUnknownSync(ProjectColor)

export function ProjectAppearanceSection({
  orgSlug,
  slug,
  name,
  projectKey,
  icon,
  iconImage,
  color,
  banner,
  canEdit
}: {
  orgSlug: string
  slug: string
  name: string
  projectKey: string
  icon: string
  iconImage: ProjectIconImage | null
  color: string
  banner: ProjectBanner | null
  canEdit: boolean
}) {
  const key = makeProjectKey(orgSlug, slug)
  const update = useAtomSet(updateProjectAtom(key))
  const updateState = useAtomValue(updateProjectAtom(key))
  const [editing, setEditing] = useState<"icon" | "banner" | null>(null)
  const [live, setLive] = useState<LiveIcon | null>(null)

  const reduce = useReducedMotion() ?? false
  const morph = reduce ? { duration: 0 } : transitions.layout
  const fade = reduce ? { duration: 0 } : transitions.fade
  const fadeIn = reduce ? false : { opacity: 0 }
  const fadeOut = { opacity: 0 }

  const bannerPreset = bannerPresets.find(
    (entry) => banner?.type === "preset" && entry.id === banner.preset
  )
  const bannerThumb = bannerSource(orgSlug, banner) ?? null

  const changeAction = (target: "icon" | "banner") =>
    canEdit ? (
      <Button variant="tertiary" size="sm" onClick={() => setEditing(target)}>
        {m.project_appearance_change()}
      </Button>
    ) : null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-medium">
        {m.project_appearance_heading()}
      </h2>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <motion.div layout transition={morph} className="flex flex-col gap-2.5">
          <AppearanceCard>
            <AnimatePresence initial={false} mode="wait">
              {editing === "icon" ? (
                <motion.div
                  key="icon-editor"
                  initial={fadeIn}
                  animate={{ opacity: 1 }}
                  exit={fadeOut}
                  transition={fade}
                >
                  <EditorHeader
                    title={m.project_appearance_icon_row()}
                    onCancel={() => {
                      setEditing(null)
                      setLive(null)
                    }}
                  />
                  <ProjectIconForm
                    orgSlug={orgSlug}
                    slug={slug}
                    icon={icon}
                    iconImage={iconImage}
                    accent={color}
                    onDone={() => {
                      setEditing(null)
                      setLive(null)
                    }}
                    onLiveChange={setLive}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="icon-row"
                  initial={fadeIn}
                  animate={{ opacity: 1 }}
                  exit={fadeOut}
                  transition={fade}
                >
                  <AppearanceRow
                    thumb={
                      <span className="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] corner-squircle">
                        <ProjectIconDisplay
                          orgSlug={orgSlug}
                          icon={icon}
                          iconImage={iconImage}
                          size={40}
                        />
                      </span>
                    }
                    label={m.project_appearance_icon_row()}
                    detail={
                      iconImage
                        ? m.project_appearance_icon_custom()
                        : m.project_appearance_icon_emoji_only()
                    }
                    action={changeAction("icon")}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </AppearanceCard>

          <AppearanceCard>
            <AppearanceRow
              thumb={
                <span
                  aria-hidden
                  className="size-10 shrink-0 rounded-[14px] corner-squircle"
                  style={{ backgroundColor: color }}
                />
              }
              label={m.project_appearance_accent_row()}
              detail={color.toUpperCase()}
              action={
                canEdit ? (
                  <ColorPicker
                    value={color}
                    onChange={(next) =>
                      update({ color: makeProjectColor(next) })
                    }
                    ariaLabel={m.color_picker_aria_label()}
                  />
                ) : null
              }
            />
          </AppearanceCard>

          <AppearanceCard>
            <AnimatePresence initial={false} mode="wait">
              {editing === "banner" ? (
                <motion.div
                  key="banner-editor"
                  initial={fadeIn}
                  animate={{ opacity: 1 }}
                  exit={fadeOut}
                  transition={fade}
                >
                  <EditorHeader
                    title={m.project_appearance_banner_row()}
                    onCancel={() => setEditing(null)}
                  />
                  <ProjectBannerForm
                    key={key}
                    orgSlug={orgSlug}
                    slug={slug}
                    banner={banner}
                    onDone={() => setEditing(null)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="banner-row"
                  initial={fadeIn}
                  animate={{ opacity: 1 }}
                  exit={fadeOut}
                  transition={fade}
                >
                  <AppearanceRow
                    thumb={
                      <span className="block h-10 w-[88px] shrink-0 overflow-hidden rounded-md bg-muted">
                        {bannerThumb ? (
                          <img
                            src={bannerThumb}
                            alt=""
                            className="size-full object-cover"
                            style={{
                              objectPosition: `${(banner?.crop.x ?? 0.5) * 100}% ${(banner?.crop.y ?? 0.5) * 100}%`
                            }}
                          />
                        ) : null}
                      </span>
                    }
                    label={m.project_appearance_banner_row()}
                    detail={
                      bannerPreset
                        ? `${bannerPreset.label()} · ${bannerPreset.artist}`
                        : banner
                          ? m.project_appearance_icon_custom()
                          : m.project_appearance_banner_none()
                    }
                    action={changeAction("banner")}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </AppearanceCard>

          {AsyncResult.isFailure(updateState) ? (
            <p role="alert" className="text-[13px] text-destructive">
              {m.project_identity_error()}
            </p>
          ) : null}
        </motion.div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[13px] text-muted-foreground">
              {m.project_appearance_renders_heading()}
            </span>
            <span className="text-xs text-muted-foreground">
              {m.project_appearance_renders_live()}
            </span>
          </div>
          <div className="hidden lg:block">
            <RenderPreviews
              orgSlug={orgSlug}
              slug={slug}
              name={name}
              projectKey={projectKey}
              icon={icon}
              iconImage={iconImage}
              banner={banner}
              live={live}
              waiting={updateState.waiting}
            />
          </div>
          <details className="lg:hidden">
            <summary className="cursor-pointer text-[13px] text-muted-foreground">
              {m.project_appearance_renders_heading()}
            </summary>
            <div className="pt-3">
              <RenderPreviews
                orgSlug={orgSlug}
                slug={slug}
                name={name}
                projectKey={projectKey}
                icon={icon}
                iconImage={iconImage}
                banner={banner}
                live={live}
              />
            </div>
          </details>
        </div>
      </div>
    </section>
  )
}
