import { useAtomValue } from "@effect/atom-react"
import type { User } from "@pp/shared"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { me } from "@/features/auth/atoms/auth"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
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
  return (
    <SettingsSection>
      <SettingsGroup className="mt-12 overflow-visible">
        <div className="flex flex-col items-center gap-1 px-4 pb-5 text-center">
          <MemberAvatar
            member={user}
            size={PROFILE_AVATAR_SIZE}
            className="-mt-12 mb-2 bg-card"
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
