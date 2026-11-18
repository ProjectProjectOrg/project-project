import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { DitherShell } from "@pp/ui/dither-shell"
import { Outlet } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { DeletedOrgPage } from "@/features/organizations/components/DeletedOrgPage"

// Gates everything under an org, in the app and in its settings, on the
// org existing and not being deleted.
export function OrgLayout({ orgSlug }: Readonly<{ orgSlug: string }>) {
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
