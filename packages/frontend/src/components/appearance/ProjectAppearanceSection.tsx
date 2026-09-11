import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { lazy, Suspense, useState, type ReactNode } from "react"
import {
  ProjectColor,
  type ProjectBanner,
  type ProjectIconImage
} from "@projectproject/shared"
import { projectKey, updateProjectAtom } from "@/atoms/projects"
import { ColorPicker } from "@/components/ColorPicker"
import { ProjectTile } from "@/components/ProjectTile"
import { Button } from "@/components/ui/button"
import { ProjectIconForm } from "@/forms/project-icon"
import { RenderPreviews } from "@/components/appearance/RenderPreviews"
import { m } from "@/paraglide/messages"

const BannerSettings = lazy(() => import("@/components/ProjectBannerSettings"))

const makeProjectColor = Schema.decodeUnknownSync(ProjectColor)

function AppearanceRow({
  label,
  children,
  action
}: {
  label: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-b-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-3">
        {children}
        {action}
      </div>
    </div>
  )
}

export function ProjectAppearanceSection({
  orgSlug,
  slug,
  name,
  icon,
  iconImage,
  color,
  banner,
  canEdit
}: {
  orgSlug: string
  slug: string
  name: string
  icon: string
  iconImage: ProjectIconImage | null
  color: string
  banner: ProjectBanner | null
  canEdit: boolean
}) {
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateProjectAtom(key))
  const updateState = useAtomValue(updateProjectAtom(key))
  const [editingIcon, setEditingIcon] = useState(false)

  const previews = (
    <RenderPreviews
      orgSlug={orgSlug}
      slug={slug}
      name={name}
      icon={icon}
      iconImage={iconImage}
      color={color}
      waiting={updateState.waiting}
    />
  )

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium">{m.project_appearance_heading()}</h2>

      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex flex-col">
          {editingIcon ? (
            <div className="flex flex-col gap-3 py-3">
              <ProjectIconForm
                orgSlug={orgSlug}
                slug={slug}
                icon={icon}
                iconImage={iconImage}
                onDone={() => setEditingIcon(false)}
              />
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setEditingIcon(false)}
              >
                {m.common_cancel_button()}
              </Button>
            </div>
          ) : (
            <AppearanceRow
              label={m.project_appearance_icon_row()}
              action={
                canEdit ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingIcon(true)}
                  >
                    {m.project_appearance_icon_change()}
                  </Button>
                ) : null
              }
            >
              <ProjectTile
                orgSlug={orgSlug}
                icon={icon}
                iconImage={iconImage}
                color={color}
                size="md"
                seed={slug}
                waiting={updateState.waiting}
              />
            </AppearanceRow>
          )}

          <AppearanceRow label={m.project_appearance_accent_row()}>
            {canEdit ? (
              <ColorPicker
                value={color}
                onChange={(next) => update({ color: makeProjectColor(next) })}
                ariaLabel={m.color_picker_aria_label()}
              />
            ) : (
              <span
                aria-hidden
                className="block size-8 rounded-full border border-border/60 shadow-sm"
                style={{ backgroundColor: color }}
              />
            )}
          </AppearanceRow>

          {canEdit ? (
            <div className="py-3">
              <Suspense fallback={null}>
                <BannerSettings
                  key={key}
                  orgSlug={orgSlug}
                  slug={slug}
                  banner={banner}
                />
              </Suspense>
            </div>
          ) : null}

          {AsyncResult.isFailure(updateState) ? (
            <p role="alert" className="py-2 text-xs text-destructive">
              {m.project_identity_error()}
            </p>
          ) : null}
        </div>

        <div className="hidden lg:block">
          <span className="mb-3 block text-[13px] text-muted-foreground">
            {m.project_appearance_renders_heading()}
          </span>
          {previews}
        </div>

        <details className="lg:hidden">
          <summary className="cursor-pointer text-[13px] text-muted-foreground">
            {m.project_appearance_renders_heading()}
          </summary>
          <div className="pt-3">{previews}</div>
        </details>
      </div>
    </section>
  )
}
