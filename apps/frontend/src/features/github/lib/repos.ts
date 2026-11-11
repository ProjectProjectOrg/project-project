import type {
  GithubConnection,
  GithubOrgIntegrationStatus,
  UpdateGithubInstallationInput
} from "@pp/shared"

type ProjectRepos = Readonly<{
  github: GithubConnection | null
  githubRepos: ReadonlyArray<GithubConnection>
}>

export const connectedRepos = (
  detail: ProjectRepos
): ReadonlyArray<GithubConnection> =>
  detail.githubRepos.length > 0
    ? detail.githubRepos
    : detail.github === null
      ? []
      : [detail.github]

export const ticketRepo = (
  detail: ProjectRepos,
  repoId: string | null | undefined
): GithubConnection | null =>
  connectedRepos(detail).find((repo) => repo.repoId === repoId) ?? detail.github

export const repoSlug = (
  repo: Readonly<{ repoOwner: string; repoName: string }>
): string => `${repo.repoOwner}/${repo.repoName}`

export const connectedRepoIdsKey = (detail: ProjectRepos): string =>
  connectedRepos(detail)
    .map((repo) => repo.repoId)
    .toSorted()
    .join(",")

export const branchListRepoId = (
  repos: ReadonlyArray<GithubConnection>,
  repo: GithubConnection
): string | undefined => (repos.length > 1 ? repo.repoId : undefined)

const withRepos = <Detail extends ProjectRepos>(
  detail: Detail,
  repos: ReadonlyArray<GithubConnection>
): Detail => ({ ...detail, github: repos[0] ?? null, githubRepos: repos })

export const withConnectedRepo = <Detail extends ProjectRepos>(
  detail: Detail,
  repo: GithubConnection
): Detail => {
  const repos = connectedRepos(detail)
  return withRepos(
    detail,
    repos.some((current) => current.repoId === repo.repoId)
      ? repos.map((current) =>
          current.repoId === repo.repoId ? repo : current
        )
      : [...repos, repo]
  )
}

export const withoutConnectedRepo = <Detail extends ProjectRepos>(
  detail: Detail,
  repoId: string
): Detail =>
  withRepos(
    detail,
    connectedRepos(detail).filter((repo) => repo.repoId !== repoId)
  )

export const withConfirmedRepo = <Detail extends ProjectRepos>(
  detail: Detail,
  confirmed: ProjectRepos,
  repoId: string
): Detail => {
  const repo = connectedRepos(confirmed).find(
    (current) => current.repoId === repoId
  )
  const connected = connectedRepos(detail).some(
    (current) => current.repoId === repoId
  )
  return repo === undefined || !connected
    ? detail
    : withConnectedRepo(detail, repo)
}

const integrationStatus = (
  installations: GithubOrgIntegrationStatus["installations"]
): GithubOrgIntegrationStatus["status"] =>
  installations.length === 0
    ? "not_connected"
    : installations.some((installation) => installation.status === "broken")
      ? "broken"
      : "active"

export const withoutGithubApp = (
  status: GithubOrgIntegrationStatus,
  appId: string
): GithubOrgIntegrationStatus => {
  const installations = status.installations.filter(
    (installation) => installation.appId !== appId
  )
  return {
    status: integrationStatus(installations),
    apps: status.apps.filter((app) => app.id !== appId),
    installations
  }
}

export const withoutGithubInstallation = (
  status: GithubOrgIntegrationStatus,
  installationId: string
): GithubOrgIntegrationStatus => {
  const installations = status.installations.filter(
    (installation) => installation.id !== installationId
  )
  return { ...status, status: integrationStatus(installations), installations }
}

export const withInstallationAccess = (
  status: GithubOrgIntegrationStatus,
  installationId: string,
  access: UpdateGithubInstallationInput
): GithubOrgIntegrationStatus => ({
  ...status,
  installations: status.installations.map((installation) =>
    installation.id === installationId
      ? { ...installation, ...access }
      : installation
  )
})

export const withConfirmedInstallation = (
  status: GithubOrgIntegrationStatus,
  confirmed: GithubOrgIntegrationStatus,
  installationId: string
): GithubOrgIntegrationStatus => {
  const installation = confirmed.installations.find(
    (current) => current.id === installationId
  )
  return installation === undefined
    ? status
    : {
        ...status,
        installations: status.installations.map((current) =>
          current.id === installationId ? installation : current
        )
      }
}

export const toggledProjectSlug = <Slug extends string>(
  slugs: ReadonlyArray<Slug>,
  slug: Slug
): ReadonlyArray<Slug> =>
  slugs.includes(slug)
    ? slugs.filter((current) => current !== slug)
    : [...slugs, slug]
