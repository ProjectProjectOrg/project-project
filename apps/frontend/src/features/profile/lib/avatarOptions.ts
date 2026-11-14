import type { AvatarOption, AvatarSource } from "@pp/shared"
import type { ComponentType } from "react"

import { Logo } from "@/components/shell/Logo"
import {
  GithubMark,
  GoogleMark
} from "@/features/auth/components/ProviderMarks"
import { m } from "@/paraglide/messages"

const LABELS: Readonly<Record<AvatarSource, () => string>> = {
  generated: m.profile_avatar_option_generated,
  github: m.profile_avatar_option_github,
  google: m.profile_avatar_option_google
}

const ICONS: Readonly<
  Record<AvatarSource, ComponentType<{ className?: string }>>
> = {
  generated: Logo,
  github: GithubMark,
  google: GoogleMark
}

export const avatarSourceLabel = (source: AvatarSource): string =>
  LABELS[source]()

export const avatarSourceIcon = (
  source: AvatarSource
): ComponentType<{ className?: string }> => ICONS[source]

const PROVIDER_HOSTS: ReadonlyArray<readonly [AvatarSource, string]> = [
  ["github", "avatars.githubusercontent.com"],
  ["google", "googleusercontent.com"]
]

const hostSource = (image: string): AvatarSource | null => {
  const host = URL.canParse(image) ? new URL(image).hostname : ""
  return (
    PROVIDER_HOSTS.find(
      ([, suffix]) => host === suffix || host.endsWith(`.${suffix}`)
    )?.[0] ?? null
  )
}

export const selectedAvatarSource = (
  options: ReadonlyArray<AvatarOption>,
  image: string | null
): AvatarSource | null => {
  const exact = options.find((option) => option.image === image)
  if (exact) return exact.source
  if (image === null) return null
  const source = hostSource(image)
  return options.some((option) => option.source === source) ? source : null
}
