import {
  attachmentUrl,
  type ProjectBanner,
  type ProjectBannerPreset,
  withAttachmentParams
} from "@projectproject/shared"
import sunsetUrl from "@/components/project-banner-monet-sunset.png"
import waterLilyPondUrl from "@/components/project-banner-monet-87088.jpg"
import wheatStacksUrl from "@/components/project-banner-monet-64818.jpg"
import cliffWalkUrl from "@/components/project-banner-monet-14620.jpg"
import saintLazareUrl from "@/components/project-banner-monet-16571.jpg"
import bordigheraUrl from "@/components/project-banner-monet-81537.jpg"

export const BANNER_ATTACHMENT_WIDTH = 1024

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
  banner: ProjectBanner | null
): string | null => {
  if (banner === null) return null
  return banner.type === "preset"
    ? bannerPresetSources[banner.preset]
    : withAttachmentParams(attachmentUrl(orgSlug, banner.attachmentId), {
        width: BANNER_ATTACHMENT_WIDTH
      })
}
