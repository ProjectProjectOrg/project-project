import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"

import type { ProjectLibrary } from "../lib/orgUsage"
import { projectLibraryFor, projectLibraryRequest } from "./library"

export const USAGE_PROJECT_LIMIT = 24

export type LibraryUsageRequest = Readonly<{
  _view: "libraryUsage"
  params: Readonly<{ orgSlug: string }>
}>

export const libraryUsageRequest = (orgSlug: string): LibraryUsageRequest => ({
  _view: "libraryUsage",
  params: { orgSlug }
})

export type LibraryUsage = Readonly<{
  libraries: ReadonlyArray<ProjectLibrary>
  complete: boolean
}>

const empty: LibraryUsage = { libraries: [], complete: false }

export const libraryUsage = Atom.family((req: LibraryUsageRequest) => {
  const projects = projectsFor(projectsRequest(req.params.orgSlug))
  const libraryOf = (slug: string) =>
    projectLibraryFor(projectLibraryRequest(req.params.orgSlug, slug))
  let slugs: ReadonlyArray<string> = []
  return Atom.readable(
    (get) => {
      const listed = get(projects)
      if (!AsyncResult.isSuccess(listed))
        return AsyncResult.map(listed, (): LibraryUsage => empty)
      slugs =
        listed.value.length > USAGE_PROJECT_LIMIT
          ? []
          : listed.value.map((project) => project.slug)
      if (listed.value.length > USAGE_PROJECT_LIMIT)
        return AsyncResult.success<LibraryUsage>(empty)
      return AsyncResult.map(
        AsyncResult.all(
          listed.value.map((project) => get(libraryOf(project.slug)))
        ),
        (libraries): LibraryUsage => ({
          complete: true,
          libraries: libraries.map((library, index) => ({
            project: {
              slug: listed.value[index].slug,
              name: listed.value[index].name
            },
            library
          }))
        })
      )
    },
    (refresh) => {
      refresh(projects)
      for (const slug of slugs) refresh(libraryOf(slug))
    }
  )
})
