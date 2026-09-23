import type { ProjectBannerPreset } from "@pp/shared"

import { bannerPresetSources, bannerSource } from "@/lib/bannerSource"
import { m } from "@/paraglide/messages"

import cliff_walkThumbUrl from "./project-banner-monet-14620-thumb.webp"
import saint_lazareThumbUrl from "./project-banner-monet-16571-thumb.webp"
import wheat_stacksThumbUrl from "./project-banner-monet-64818-thumb.webp"
import bordigheraThumbUrl from "./project-banner-monet-81537-thumb.webp"
import water_lily_pondThumbUrl from "./project-banner-monet-87088-thumb.webp"
import sunsetThumbUrl from "./project-banner-monet-sunset-thumb.webp"
import type { BannerPrototypeSettings } from "./ProjectBannerPrototypeShader"

export { bannerSource }

export type BannerPreset = Readonly<{
  id: ProjectBannerPreset
  src: string
  thumbSrc: string
  label: () => string
  artist: string
  provider: string
  url: string
  x: number
  y: number
}>

export const bannerPresets: ReadonlyArray<BannerPreset> = [
  {
    id: "sunset",
    src: bannerPresetSources.sunset,
    thumbSrc: sunsetThumbUrl,
    label: () => m.project_banner_template_sunset(),
    artist: "Claude Monet",
    provider: m.project_banner_template_user_provided(),
    url: "https://x.com/artistmonet",
    x: 0.5,
    y: 0.65
  },
  {
    id: "water_lily_pond",
    src: bannerPresetSources.water_lily_pond,
    thumbSrc: water_lily_pondThumbUrl,
    label: () => m.project_banner_template_water_lily_pond(),
    artist: "Claude Monet",
    provider: "Art Institute of Chicago",
    url: "https://www.artic.edu/artworks/87088",
    x: 0.5,
    y: 0.4
  },
  {
    id: "wheat_stacks",
    src: bannerPresetSources.wheat_stacks,
    thumbSrc: wheat_stacksThumbUrl,
    label: () => m.project_banner_template_wheat_stacks(),
    artist: "Claude Monet",
    provider: "Art Institute of Chicago",
    url: "https://www.artic.edu/artworks/64818",
    x: 0.5,
    y: 0.55
  },
  {
    id: "cliff_walk",
    src: bannerPresetSources.cliff_walk,
    thumbSrc: cliff_walkThumbUrl,
    label: () => m.project_banner_template_cliff_walk(),
    artist: "Claude Monet",
    provider: "Art Institute of Chicago",
    url: "https://www.artic.edu/artworks/14620",
    x: 0.5,
    y: 0.6
  },
  {
    id: "saint_lazare",
    src: bannerPresetSources.saint_lazare,
    thumbSrc: saint_lazareThumbUrl,
    label: () => m.project_banner_template_saint_lazare(),
    artist: "Claude Monet",
    provider: "Art Institute of Chicago",
    url: "https://www.artic.edu/artworks/16571",
    x: 0.5,
    y: 0.5
  },
  {
    id: "bordighera",
    src: bannerPresetSources.bordighera,
    thumbSrc: bordigheraThumbUrl,
    label: () => m.project_banner_template_bordighera(),
    artist: "Claude Monet",
    provider: "Art Institute of Chicago",
    url: "https://www.artic.edu/artworks/81537",
    x: 0.5,
    y: 0.5
  }
]

export const bannerDefaults: BannerPrototypeSettings = {
  pixelSize: 2,
  strength: 0.85,
  color: 0.5,
  fade: 0.8,
  opacity: 1,
  overallOpacity: 0.2,
  height: 160,
  noise: 0.3,
  noiseScale: 5.5,
  zoom: 1,
  x: 0.5,
  y: 0.65
}
