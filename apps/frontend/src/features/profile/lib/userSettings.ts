import type { UpdateUserSettingsInput, User } from "@pp/shared"

export const applySettingsPatch = (
  user: User,
  patch: UpdateUserSettingsInput
): User => {
  const chosen =
    patch.avatarSource === undefined
      ? undefined
      : user.avatarOptions.find(
          (option) => option.source === patch.avatarSource
        )
  return {
    ...user,
    image: chosen === undefined ? user.image : chosen.image,
    settings: {
      avatarSource: patch.avatarSource ?? user.settings.avatarSource,
      editorPreference: patch.editorPreference ?? user.settings.editorPreference
    }
  }
}
