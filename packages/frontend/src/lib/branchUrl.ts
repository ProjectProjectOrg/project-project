import type { EditorPreference } from "@projectproject/shared"

function cloneUrl(repoSlug: string): string {
  return `https://github.com/${repoSlug}.git`
}

export function branchUrl(
  preference: EditorPreference,
  repoSlug: string,
  branch: string
): string {
  switch (preference) {
    case "github_dev":
      return `https://github.dev/${repoSlug}/tree/${branch}`
    case "vscode":
      return `vscode://vscode.git/clone?url=${encodeURIComponent(cloneUrl(repoSlug))}`
    case "cursor":
      return `cursor://vscode.git/clone?url=${encodeURIComponent(cloneUrl(repoSlug))}`
    case "github":
    default:
      return `https://github.com/${repoSlug}/tree/${branch}`
  }
}

export function branchOpensInNewTab(preference: EditorPreference): boolean {
  return preference === "github" || preference === "github_dev"
}
