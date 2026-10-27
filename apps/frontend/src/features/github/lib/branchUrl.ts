import type { EditorPreference } from "@pp/shared"

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

export function compareUrl(
  repoSlug: string,
  base: string,
  branch: string
): string {
  return `https://github.com/${repoSlug}/compare/${base}...${branch}?quick_pull=1`
}

export function repoUrl(
  github: Readonly<{ repoOwner: string; repoName: string }>
): string {
  return `https://github.com/${github.repoOwner}/${github.repoName}`
}

export function branchOpensInNewTab(preference: EditorPreference): boolean {
  return preference === "github" || preference === "github_dev"
}
