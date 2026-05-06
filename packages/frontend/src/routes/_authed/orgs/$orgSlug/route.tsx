import { useAtomSet } from "@effect-atom/atom-react"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { useEffect } from "react"
import { setActiveOrgAtom } from "@/atoms/auth"

export const Route = createFileRoute("/_authed/orgs/$orgSlug")({
  component: OrgLayout
})

function OrgLayout() {
  const { orgSlug } = Route.useParams()
  const setActive = useAtomSet(setActiveOrgAtom)

  useEffect(() => {
    void setActive(orgSlug)
  }, [orgSlug, setActive])

  return <Outlet />
}
