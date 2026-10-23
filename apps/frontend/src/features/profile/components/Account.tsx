import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { me } from "@/features/auth/atoms/auth"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export function Account() {
  const viewer = useAtomValue(me())
  if (!Result.isSuccess(viewer)) return null
  const user = viewer.value

  return (
    <SettingsSection>
      <SettingsGroup>
        <SettingsRow
          icon={<MemberAvatar member={user} size={40} />}
          label={user.name}
          description={
            <>
              {user.username ? (
                <>
                  <span className="font-mono">@{user.username}</span>
                  <span className="mx-1.5">·</span>
                </>
              ) : null}
              {user.email}
            </>
          }
        />
        <SettingsRow label={m.profile_user_id_label()}>
          <span className="font-mono text-[13px] text-muted-foreground">
            {user.id}
          </span>
        </SettingsRow>
        <SettingsRow label={m.profile_joined_label()}>
          <span className="text-[13px] text-muted-foreground">
            {user.createdAt.toLocaleDateString(getLocale())}
          </span>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
