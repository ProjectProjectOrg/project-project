import type { EditorPreference } from "@pp/shared"

import { m } from "@/paraglide/messages"

export const EDITOR_OPTIONS: ReadonlyArray<
  Readonly<{
    key: EditorPreference
    label: () => string
  }>
> = [
  { key: "github", label: m.profile_editor_option_github },
  { key: "github_dev", label: m.profile_editor_option_github_dev },
  { key: "vscode", label: m.profile_editor_option_vscode },
  { key: "cursor", label: m.profile_editor_option_cursor }
]
