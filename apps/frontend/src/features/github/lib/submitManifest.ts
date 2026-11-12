import type { StartGithubAppManifestResponse } from "@pp/shared"

export const submitGithubAppManifest = ({
  action,
  manifest
}: StartGithubAppManifestResponse): void => {
  const form = document.createElement("form")
  form.method = "post"
  form.action = action
  const input = document.createElement("input")
  input.type = "hidden"
  input.name = "manifest"
  input.value = manifest
  form.append(input)
  document.body.append(form)
  form.submit()
}
