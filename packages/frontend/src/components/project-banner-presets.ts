import type { ProjectBannerPreset } from "@projectproject/shared"
import {
  bannerPresetSources,
  bannerSource,
  BANNER_ATTACHMENT_WIDTH
} from "@/lib/bannerSource"
import { m } from "@/paraglide/messages"
import type { BannerPrototypeSettings } from "./ProjectBannerPrototypeShader"

export { bannerSource, BANNER_ATTACHMENT_WIDTH }

export type BannerPreset = {
  id: ProjectBannerPreset
  src: string
  label: () => string
  artist: string
  provider: string
  url: string
  x: number
  y: number
}

export const bannerPresets: ReadonlyArray<BannerPreset> = [
  {
    id: "sunset",
    src: bannerPresetSources.sunset,
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
