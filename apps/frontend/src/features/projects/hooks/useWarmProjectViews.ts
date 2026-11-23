import { RegistryContext } from "@effect/atom-react"
import { BacklogGrouping, pickActiveSprint } from "@pp/shared"
import { useRouter } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { use, useCallback, useEffect } from "react"

import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"

export function useWarmProjectViews(orgSlug: string, slug: string) {
  const router = useRouter()
  const registry = use(RegistryContext)

  const warmProject = useCallback(() => {
    const params = { orgSlug, slug }
    void router.preloadRoute({
      to: "/orgs/$orgSlug/projects/$slug/sprints",
      params
    })
    void router.preloadRoute({
      to: "/orgs/$orgSlug/projects/$slug",
      params,
      search: { view: "board" }
    })
    for (const group of BacklogGrouping.literals)
      void router.preloadRoute({
        to: "/orgs/$orgSlug/projects/$slug",
        params,
        search: { view: "list", group }
      })
    const sprints = registry.get(sprintList(sprintListRequest(orgSlug, slug)))
    const active = Result.isSuccess(sprints)
      ? pickActiveSprint(sprints.value)
      : null
    if (active !== null)
      void router.preloadRoute({
        to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
        params: { ...params, groupId: active.id }
      })
  }, [router, registry, orgSlug, slug])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void router.preloadRoute({ to: "/orgs/$orgSlug", params: { orgSlug } })
      void router.preloadRoute({
        to: "/orgs/$orgSlug/projects",
        params: { orgSlug }
      })
      warmProject()
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [router, orgSlug, warmProject])

  return useCallback(() => {
    router.clearCache({
      filter: (match) =>
        "slug" in match.params &&
        match.params.orgSlug === orgSlug &&
        match.params.slug === slug
    })
    warmProject()
  }, [router, orgSlug, slug, warmProject])
}
