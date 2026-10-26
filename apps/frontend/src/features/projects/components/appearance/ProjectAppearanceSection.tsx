import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  ProjectColor,
  type ProjectBanner,
  type ProjectIconImage
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"

import { SettingsSection } from "@/components/shell/settings/SettingsSection"
import { AutoHeight } from "@/components/ui/auto-height"
import { Button } from "@/components/ui/button"
import { ColorPicker } from "@/components/ui/color-picker"
import {
  projectKey as makeProjectKey,
  projectRequest,
  updateProject
} from "@/features/projects/atoms/projects"
import {
  AppearanceCard,
  AppearanceRow,
  EditorHeader
} from "@/features/projects/components/appearance/AppearanceCard"
import type { LiveIcon } from "@/features/projects/components/appearance/IconPreviewTile"
import { RenderPreviews } from "@/features/projects/components/appearance/RenderPreviews"
import { CroppedImage } from "@/features/projects/components/CroppedImage"
import { ProjectIconDisplay } from "@/features/projects/components/ProjectIconDisplay"
import { ProjectBannerForm } from "@/features/projects/forms/project-banner"
import { ProjectIconForm } from "@/features/projects/forms/project-icon"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  bannerDefaults,
  bannerSource,
  bannerPresets
} from "@/features/projects/lib/bannerPresets"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

const makeProjectColor = Schema.decodeUnknownSync(ProjectColor)

export function ProjectAppearanceSection({
  name,
  projectKey,
  icon,
  iconImage,
  color,
  banner,
  canEdit
}: {
  name: string
  projectKey: string
  icon: string
  iconImage: ProjectIconImage | null
  color: string
  banner: ProjectBanner | null
  canEdit: boolean
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = projectRequest(orgSlug, slug)
  const update = useAtomSet(updateProject(req))
  const updateState = useAtomValue(updateProject(req))
  const [editing, setEditing] = useState<"icon" | "banner" | null>(null)
  const [live, setLive] = useState<LiveIcon | null>(null)
  const [pickingColor, setPickingColor] = useState(false)

  const reduce = useReducedMotion() ?? false
  const fade = reduce ? { duration: 0 } : transitions.fade
  const fadeIn = reduce ? false : { opacity: 0 }
  const fadeOut = { opacity: 0 }

  const bannerPreset = bannerPresets.find(
    (entry) => banner?.type === "preset" && entry.id === banner.preset
  )
  const bannerThumb = bannerSource(orgSlug, banner) ?? null

  const changeAffordance = canEdit ? (
    <Button
      render={<span />}
      variant="tertiary"
      size="sm"
      className="motion-safe:active:scale-100"
    >
      {m.project_appearance_change()}
    </Button>
  ) : null

  const openEditor = (target: "icon" | "banner") =>
    canEdit ? () => setEditing(target) : undefined

  return (
    <SettingsSection title={m.project_appearance_heading()}>
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2.5">
          <AppearanceCard>
            <AutoHeight>
              <AnimatePresence initial={false} mode="popLayout">
                {editing === "icon" ? (
                  <motion.div
                    key="icon-editor"
                    initial={fadeIn}
                    animate={{ opacity: 1 }}
                    exit={fadeOut}
                    transition={fade}
                  >
                    <EditorHeader
                      shareId="icon"
                      title={m.project_appearance_icon_row()}
                      onCancel={() => {
                        setEditing(null)
                        setLive(null)
                      }}
                    />
                    <ProjectIconForm
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
                      shareId="icon"
                      label={m.project_appearance_icon_row()}
                      detail={
                        iconImage
                          ? m.project_appearance_icon_custom()
                          : m.project_appearance_icon_emoji_only()
                      }
                      action={changeAffordance}
                      onActivate={openEditor("icon")}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </AutoHeight>
          </AppearanceCard>

          <AppearanceCard className={pickingColor ? "z-20" : undefined}>
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
                    onOpenChange={setPickingColor}
                  />
                ) : null
              }
            />
          </AppearanceCard>

          <AppearanceCard>
            <AutoHeight>
              <AnimatePresence initial={false} mode="popLayout">
                {editing === "banner" ? (
                  <motion.div
                    key="banner-editor"
                    initial={fadeIn}
                    animate={{ opacity: 1 }}
                    exit={fadeOut}
                    transition={fade}
                  >
                    <EditorHeader
                      shareId="banner"
                      title={m.project_appearance_banner_row()}
                      onCancel={() => setEditing(null)}
                    />
                    <ProjectBannerForm
                      key={makeProjectKey(orgSlug, slug)}
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
                        <span className="relative block h-10 w-[88px] shrink-0 overflow-hidden rounded-md bg-active">
                          {bannerThumb ? (
                            <CroppedImage
                              src={bannerThumb}
                              crop={banner?.crop ?? bannerDefaults}
                              containerAspect={88 / 40}
                            />
                          ) : null}
                        </span>
                      }
                      shareId="banner"
                      thumbShareId="banner-result"
                      label={m.project_appearance_banner_row()}
                      detail={
                        bannerPreset
                          ? `${bannerPreset.label()} · ${bannerPreset.artist}`
                          : banner
                            ? m.project_appearance_banner_custom()
                            : m.project_appearance_banner_none()
                      }
                      action={changeAffordance}
                      onActivate={openEditor("banner")}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </AutoHeight>
          </AppearanceCard>

          {AsyncResult.isFailure(updateState) ? (
            <p role="alert" className="text-[13px] text-destructive">
              {m.project_identity_error()}
            </p>
          ) : null}
        </div>

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
              name={name}
              projectKey={projectKey}
              icon={icon}
              iconImage={iconImage}
              color={color}
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
                name={name}
                projectKey={projectKey}
                icon={icon}
                iconImage={iconImage}
                color={color}
                banner={banner}
                live={live}
                waiting={updateState.waiting}
              />
            </div>
          </details>
        </div>
      </div>
    </SettingsSection>
  )
}
