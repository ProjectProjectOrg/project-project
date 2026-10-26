import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { EditorPreference } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { useEffect, useState } from "react"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSegmented } from "@/components/shell/settings/SettingsTextField"
import { me, updateEditorPreference } from "@/features/auth/atoms/auth"
import { m } from "@/paraglide/messages"

const EDITOR_OPTIONS: ReadonlyArray<{
  key: EditorPreference
  label: () => string
}> = [
  { key: "github", label: m.profile_editor_option_github },
  { key: "github_dev", label: m.profile_editor_option_github_dev },
  { key: "vscode", label: m.profile_editor_option_vscode },
  { key: "cursor", label: m.profile_editor_option_cursor }
]

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
  if (!Result.isSuccess(viewer)) return null
  return <EditorPreferenceRow preference={viewer.value.editorPreference} />
}

function EditorPreferenceRow({
  preference
}: Readonly<{ preference: EditorPreference }>) {
  const update = useAtomSet(updateEditorPreference, {
    mode: "promiseExit"
  })
  const updateState = useAtomValue(updateEditorPreference)
  const [selected, setSelected] = useState(preference)

  useEffect(() => setSelected(preference), [preference])

  function choose(next: EditorPreference) {
    if (next === selected) return
    setSelected(next)
    void update(next).then((exit) => {
      if (Exit.isFailure(exit)) setSelected(preference)
    })
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
