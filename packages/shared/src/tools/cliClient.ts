export const cliOAuthClient = {
  id: "projectproject-cli",
  name: "PP CLI",
  redirectUri: "http://127.0.0.1/callback",
  resourcePath: "/api/v1/tools"
} as const

export const cliRelease = {
  repository: "ProjectProjectOrg/project-project",
  installScriptPath: "/api/cli/install.sh",
  catalogVersionHeader: "pp-catalog-version"
} as const
