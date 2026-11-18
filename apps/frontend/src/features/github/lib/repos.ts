import type {
  GithubConnection,
  GithubOrgIntegrationStatus,
  UpdateGithubInstallationInput
} from "@pp/shared"

type ProjectRepos = Readonly<{
  github: GithubConnection | null
  githubRepos: ReadonlyArray<GithubConnection>
}>

export const connectedRepos = (detail: ProjectRepos) =>
  detail.githubRepos.length > 0
    ? detail.githubRepos
    : detail.github === null
      ? []
      : [detail.github]

export const ticketRepo = (
  detail: ProjectRepos,
  repoId: string | null | undefined
) =>
  repoId == null
    ? detail.github
    : (connectedRepos(detail).find((repo) => repo.repoId === repoId) ?? null)

export const repoSlug = (
  repo: Readonly<{ repoOwner: string; repoName: string }>
) => `${repo.repoOwner}/${repo.repoName}`

export const connectedRepoIdsKey = (detail: ProjectRepos) =>
  connectedRepos(detail)
    .map((repo) => repo.repoId)
    .toSorted()
    .join(",")

export const branchListRepoId = (
  repos: ReadonlyArray<GithubConnection>,
  repo: GithubConnection
) => (repos.length > 1 ? repo.repoId : undefined)

const withRepos = <Detail extends ProjectRepos>(
  detail: Detail,
  repos: ReadonlyArray<GithubConnection>
) => ({ ...detail, github: repos[0] ?? null, githubRepos: repos })

export const withConnectedRepo = <Detail extends ProjectRepos>(
  detail: Detail,
  repo: GithubConnection
) => {
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
) =>
  withRepos(
    detail,
    connectedRepos(detail).filter((repo) => repo.repoId !== repoId)
  )

export const withConfirmedRepo = <Detail extends ProjectRepos>(
  detail: Detail,
  confirmed: ProjectRepos,
  repoId: string
) => {
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
) =>
  (installations.length === 0
    ? "not_connected"
    : installations.some((installation) => installation.status === "broken")
      ? "broken"
      : "active") satisfies GithubOrgIntegrationStatus["status"]

export const withoutGithubApp = (
  status: GithubOrgIntegrationStatus,
  appId: string
) => {
  const installations = status.installations.filter(
    (installation) => installation.appId !== appId
  )
  return {
    status: integrationStatus(installations),
    apps: status.apps.filter((app) => app.id !== appId),
    installations
  } satisfies GithubOrgIntegrationStatus
}

export const withoutGithubInstallation = (
  status: GithubOrgIntegrationStatus,
  installationId: string
) => {
  const installations = status.installations.filter(
    (installation) => installation.id !== installationId
  )
  return {
    ...status,
    status: integrationStatus(installations),
    installations
  } satisfies GithubOrgIntegrationStatus
}

export const withInstallationAccess = (
  status: GithubOrgIntegrationStatus,
  installationId: string,
  access: UpdateGithubInstallationInput
) => ({
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
) => {
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
) =>
  slugs.includes(slug)
    ? slugs.filter((current) => current !== slug)
    : [...slugs, slug]
