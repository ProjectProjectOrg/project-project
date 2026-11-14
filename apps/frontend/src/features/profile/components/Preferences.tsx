import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { EditorPreference } from "@pp/shared"
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
import { EDITOR_OPTIONS } from "@/features/profile/lib/editorOptions"
import { m } from "@/paraglide/messages"

function editorHint(preference: EditorPreference): string {
  switch (preference) {
    case "github_dev":
      return m.profile_editor_hint_github_dev()
    case "vscode":
      return m.profile_editor_hint_vscode()
    case "cursor":
      return m.profile_editor_hint_cursor()
    case "github":
    default:
      return m.profile_editor_hint_github()
  }
}

export function Preferences() {
  const viewer = useAtomValue(me())
  return (
    <AsyncView
      result={viewer}
      contained
      onInitial={() => <SettingsSkeleton />}
      onSuccess={({ value }) => (
        <EditorPreferenceRow preference={value.settings.editorPreference} />
      )}
    />
  )
}

function EditorPreferenceRow({
  preference
}: Readonly<{ preference: EditorPreference }>) {
  const update = useAtomSet(updateSettings)
  const updateState = useAtomValue(updateSettings)
  const selected = preference

  function choose(next: EditorPreference) {
    if (next === selected) return
    update({ editorPreference: next })
  }

  return (
    <SettingsSection>
      <SettingsGroup>
        <SettingsRow
          label={m.profile_editor_title()}
          description={editorHint(selected)}
          error={
            Result.isFailure(updateState)
              ? m.profile_editor_update_error()
              : null
          }
        >
          <SettingsSegmented
            items={EDITOR_OPTIONS.map(({ key, label }) => ({
              key,
              label: label()
            }))}
            value={selected}
            waiting={updateState.waiting}
            onValueChange={choose}
          />
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
