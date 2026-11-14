import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { AvatarSource, User } from "@pp/shared"
import type { ComponentType } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { Logo } from "@/components/shell/Logo"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { SettingsSegmented } from "@/components/shell/settings/SettingsTextField"
import { me, updateAvatarSource } from "@/features/auth/atoms/auth"
import {
  GithubMark,
  GoogleMark
} from "@/features/auth/components/ProviderMarks"
import { DissolveAvatar } from "@/features/members/components/DissolveAvatar"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export function Account() {
  const viewer = useAtomValue(me())
  return (
    <AsyncView
      result={viewer}
      contained
      onInitial={() => <SettingsSkeleton rows={3} />}
      onSuccess={({ value }) => <AccountDetails user={value} />}
    />
  )
}

const PROFILE_AVATAR_SIZE = 96

const AVATAR_SOURCES: Readonly<
  Record<
    AvatarSource,
    Readonly<{
      label: () => string
      icon: ComponentType<Readonly<{ className?: string }>>
    }>
  >
> = {
  generated: { label: m.profile_avatar_option_generated, icon: Logo },
  github: { label: m.profile_avatar_option_github, icon: GithubMark },
  google: { label: m.profile_avatar_option_google, icon: GoogleMark }
}

function AccountDetails({ user }: Readonly<{ user: User }>) {
  const update = useAtomSet(updateAvatarSource)
  const updateState = useAtomValue(updateAvatarSource)
  const selected = user.settings.avatarSource
  const canChoose = user.avatarOptions.length > 1 || selected === null

  function choose(next: AvatarSource) {
    if (next === selected) return
    update(next)
  }

  return (
    <SettingsSection>
      <SettingsGroup className="mt-12 overflow-visible">
        <div className="flex flex-col items-center gap-1 px-4 pb-5 text-center">
          <DissolveAvatar
            member={user}
            size={PROFILE_AVATAR_SIZE}
            className="-mt-12 mb-2"
            avatarClassName="bg-card"
          />
          <p className="text-subtitle font-semibold">{user.name}</p>
          <p className="text-caption text-muted-foreground">
            {user.username ? (
              <>
                <span className="font-mono">@{user.username}</span>
                <span className="mx-1.5">·</span>
              </>
            ) : null}
            {user.email}
          </p>
        </div>
        {canChoose ? (
          <SettingsRow
            label={m.profile_avatar_title()}
            description={m.profile_avatar_description()}
            error={mutationErrorText(updateState, () =>
              m.profile_avatar_update_error()
            )}
          >
            <SettingsSegmented
              items={user.avatarOptions.map(({ source }) => ({
                key: source,
                label: AVATAR_SOURCES[source].label(),
                icon: AVATAR_SOURCES[source].icon
              }))}
              value={selected}
              waiting={updateState.waiting}
              onValueChange={choose}
            />
          </SettingsRow>
        ) : null}
        <SettingsRow label={m.profile_user_id_label()}>
          <span className="font-mono text-body text-muted-foreground">
            {user.id}
          </span>
        </SettingsRow>
        <SettingsRow label={m.profile_joined_label()}>
          <span className="text-body text-muted-foreground">
            {user.createdAt.toLocaleDateString(getLocale())}
          </span>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
