import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { AvatarSource, User } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { SettingsSegmented } from "@/components/shell/settings/SettingsTextField"
import { me, updateSettings } from "@/features/auth/atoms/auth"
import { DissolveAvatar } from "@/features/members/components/DissolveAvatar"
import {
  avatarSourceIcon,
  avatarSourceLabel,
  selectedAvatarSource
} from "@/features/profile/lib/avatarOptions"
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

function AccountDetails({ user }: Readonly<{ user: User }>) {
  const update = useAtomSet(updateSettings)
  const updateState = useAtomValue(updateSettings)
  const selected =
    user.settings.avatarSource ??
    selectedAvatarSource(user.avatarOptions, user.image)
  const canChoose = user.avatarOptions.length > 1 || selected === null

  function choose(next: AvatarSource) {
    if (next === selected) return
    update({ avatarSource: next })
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
            error={
              Result.isFailure(updateState)
                ? m.profile_avatar_update_error()
                : null
            }
          >
            <SettingsSegmented
              items={user.avatarOptions.map(({ source }) => ({
                key: source,
                label: avatarSourceLabel(source),
                icon: avatarSourceIcon(source)
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
