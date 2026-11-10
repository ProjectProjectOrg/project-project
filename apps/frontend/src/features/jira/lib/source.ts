import type { JiraProjectChoice, JiraSite } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Random from "effect/Random"

export const makeRequestId = (): string => {
  const [first, second] = Effect.runSync(
    Effect.all([Random.nextInt, Random.nextInt])
  )
  return `jira-${Math.abs(first).toString(36)}-${Math.abs(second).toString(36)}`
}

export type SourceRequest = Readonly<{ key: string; id: string }>

export const sourceRequestFor = (
  previous: SourceRequest | null,
  cloudId: string,
  projectId: string,
  make: () => string = makeRequestId
): SourceRequest => {
  const key = `${cloudId}:${projectId}`
  return previous?.key === key ? previous : { key, id: make() }
}

export const defaultCloudId = (sites: ReadonlyArray<JiraSite>): string =>
  sites.length === 1 ? (sites[0]?.cloudId ?? "") : ""

export const filterJiraProjects = (
  projects: ReadonlyArray<JiraProjectChoice>,
  search: string
): ReadonlyArray<JiraProjectChoice> => {
  const words = search.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  return projects.filter((project) => {
    const haystack = `${project.key} ${project.name}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}
