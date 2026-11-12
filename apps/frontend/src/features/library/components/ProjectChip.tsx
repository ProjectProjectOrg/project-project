import { ProjectIconDisplay } from "@/features/projects/components/ProjectIconDisplay"

import type { LibraryScope } from "../atoms/libraryScope"
import {
  useScopeProject,
  useScopeProjectName
} from "../hooks/useLibraryPermissions"

export function ProjectChip({ scope }: Readonly<{ scope: LibraryScope }>) {
  const detail = useScopeProject(scope)
  const name = useScopeProjectName(scope)
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {detail === null ? null : (
        <span
          aria-hidden
          className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] text-body leading-none corner-squircle"
        >
          <ProjectIconDisplay
            orgSlug={scope.req.params.orgSlug}
            icon={detail.icon}
            iconImage={detail.iconImage}
            size={16}
          />
        </span>
      )}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}
