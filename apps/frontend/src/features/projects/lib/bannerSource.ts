import {
  attachmentUrl,
  attachmentWidthForCss,
  type ProjectBanner,
  type ProjectBannerPreset,
  withAttachmentParams
} from "@pp/shared"

import cliffWalkUrl from "@/assets/project-banners/monet-14620.webp"
import saintLazareUrl from "@/assets/project-banners/monet-16571.webp"
import wheatStacksUrl from "@/assets/project-banners/monet-64818.webp"
import bordigheraUrl from "@/assets/project-banners/monet-81537.webp"
import waterLilyPondUrl from "@/assets/project-banners/monet-87088.webp"
import sunsetUrl from "@/assets/project-banners/monet-sunset.webp"

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
