import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"

import { DeletedOrgPage } from "@/components/DeletedOrgPage"
import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import { DitherShell } from "@/components/ui/dither-shell"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"

export const Route = createFileRoute("/_authed/orgs/$orgSlug")({
  component: OrgLayout,
  loader: async ({ context: { registry }, params, abortController }) => {
    const projects = Effect.runPromiseExit(
      Registry.getResult(
        registry,
        projectsFor(projectsRequest(params.orgSlug))
      ),
      { signal: abortController.signal }
    )
    await Effect.runPromiseExit(
      Registry.getResult(registry, orgDetail(orgRequest(params.orgSlug))),
      {
        signal: abortController.signal
      }
    )
    await projects
  }
})

function OrgLayout() {
  const { orgSlug } = Route.useParams()
  const result = useAtomValue(orgDetail(orgRequest(orgSlug)))
  const refresh = useAtomRefresh(orgDetail(orgRequest(orgSlug)))

  return Result.matchWithError(result, {
    onInitial: () => <DitherShell animated>{null}</DitherShell>,
    onError: (error) =>
      error._tag === "NotFound" ? (
        <NotFoundPage />
      ) : (
        <ErrorPage error={error} reset={refresh} />
      ),
    onDefect: (defect) => <ErrorPage error={defect} reset={refresh} />,
    onSuccess: ({ value }) =>
      value.deletedAt !== null ? (
        <DeletedOrgPage orgSlug={orgSlug} />
      ) : (
        <Outlet />
      )
  })
}
