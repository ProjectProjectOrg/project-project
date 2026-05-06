import { useAtomSet } from "@effect-atom/atom-react"
import { useNavigate } from "@tanstack/react-router"
import { Check, ChevronsUpDown } from "lucide-react"
import { switchOrgAtom } from "@/atoms/organizations"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { UserOrganization } from "@projectproject/shared"

type OrgSwitcherProps = {
  readonly activeOrgSlug: string | null
  readonly organizations: ReadonlyArray<UserOrganization>
}

export function OrgSwitcher({
  activeOrgSlug,
  organizations: orgs
}: OrgSwitcherProps) {
  const switchOrg = useAtomSet(switchOrgAtom)
  const navigate = useNavigate()

  const switchOrganization = (isCurrent: boolean, org: UserOrganization) => {
    if (isCurrent) return
    switchOrg(org)
    navigate({
      to: "/orgs/$orgSlug",
      params: { orgSlug: org.slug }
    })
  }

  if (orgs.length <= 1) return null

  const currentOrg =
    activeOrgSlug === null
      ? (orgs[0] ?? null)
      : (orgs.find((org) => org.slug === activeOrgSlug) ?? null)
  if (!currentOrg) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 max-w-56 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-foreground outline-none transition-colors duration-100",
            "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
          )}
        >
          <span className="min-w-0 truncate">{currentOrg.name}</span>
          <ChevronsUpDown
            className="size-3.5 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-64">
        {orgs.map((org) => {
          const isCurrent = org.id === currentOrg.id
          return (
            <DropdownMenuItem
              key={org.id}
              onSelect={() => switchOrganization(isCurrent, org)}
              className="cursor-pointer"
            >
              <span
                aria-current={isCurrent ? "page" : undefined}
                className="min-w-0 flex-1 truncate"
              >
                {org.name}
              </span>
              {isCurrent && (
                <Check
                  className="ml-auto size-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
