import { Result, useAtomValue } from "@effect-atom/atom-react"
import { useRouterState } from "@tanstack/react-router"
import { Check, ChevronsUpDown, Building2 } from "lucide-react"
import { userOrgsAtom } from "@/atoms/organizations"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function OrgSwitcher() {
  const orgsResult = useAtomValue(userOrgsAtom)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const currentSlug = pathname.match(/^\/orgs\/([^/]+)/)?.[1]

  return Result.match(orgsResult, {
    onInitial: () => null,
    onFailure: () => null,
    onSuccess: ({ value: orgs }) => {
      if (orgs.length <= 1) return null

      const currentOrg =
        orgs.find((org) => org.slug === currentSlug) ?? orgs[0] ?? null
      if (!currentOrg) return null

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-9 max-w-56 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-foreground outline-none transition-colors transition-transform duration-100",
                "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
              )}
            >
              <Building2
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
              />
              <span className="min-w-0 truncate">{currentOrg.name}</span>
              <ChevronsUpDown
                className="size-3.5 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8} className="w-64">
            {orgs.map((org) => {
              const isCurrent = org.slug === currentOrg.slug
              return (
                <DropdownMenuItem key={org.id} asChild>
                  <a
                    href={`/orgs/${org.slug}`}
                    aria-current={isCurrent ? "page" : undefined}
                    className="cursor-pointer"
                  >
                    <span className="min-w-0 flex-1 truncate">{org.name}</span>
                    {isCurrent ? (
                      <Check
                        className="ml-auto size-4 text-foreground"
                        strokeWidth={1.75}
                      />
                    ) : null}
                  </a>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  })
}
