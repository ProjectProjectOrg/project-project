import {
  attachmentUrl,
  attachmentWidthForCss,
  type ProjectBanner,
  type ProjectBannerPreset,
  withAttachmentParams
} from "@pp/shared"

import cliffWalkUrl from "@/components/project-banner-monet-14620.jpg"
import saintLazareUrl from "@/components/project-banner-monet-16571.jpg"
import wheatStacksUrl from "@/components/project-banner-monet-64818.jpg"
import bordigheraUrl from "@/components/project-banner-monet-81537.jpg"
import waterLilyPondUrl from "@/components/project-banner-monet-87088.jpg"
import sunsetUrl from "@/components/project-banner-monet-sunset.png"

export const bannerPresetSources = {
  sunset: sunsetUrl,
  water_lily_pond: waterLilyPondUrl,
  wheat_stacks: wheatStacksUrl,
  cliff_walk: cliffWalkUrl,
  saint_lazare: saintLazareUrl,
  bordighera: bordigheraUrl
} satisfies Record<ProjectBannerPreset, string>

export const bannerSource = (
  orgSlug: string,
  banner: ProjectBanner | null,
  cssWidth?: number
): string | null => {
  if (banner === null) return null
  if (banner.type === "preset") return bannerPresetSources[banner.preset]
  const url = attachmentUrl(orgSlug, banner.attachmentId)
  if (cssWidth === undefined) return url
  return withAttachmentParams(url, {
    width: attachmentWidthForCss(
      cssWidth,
      typeof window === "undefined" ? 1 : window.devicePixelRatio
    )
  })
}
