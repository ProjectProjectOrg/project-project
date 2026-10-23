import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { getRouteApi, Outlet } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { DitherShell } from "@/components/ui/dither-shell"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { DeletedOrgPage } from "@/features/organizations/components/DeletedOrgPage"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug")

export function OrgLayout() {
  const { orgSlug } = routeApi.useParams()
  const result = useAtomValue(orgDetail(orgRequest(orgSlug)))
  const refresh = useAtomRefresh(orgDetail(orgRequest(orgSlug)))

  return Result.matchWithError(result, {
    onInitial: () => <DitherShell animated>{null}</DitherShell>,
    onError: (error) =>
      Match.value(error).pipe(
        Match.tag("NotFound", () => <NotFoundPage />),
        Match.orElse((error) => <ErrorPage error={error} reset={refresh} />)
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
