import { Outlet } from "@tanstack/react-router"
import { useLayoutEffect, useRef, type RefObject } from "react"

import { PageContainer } from "@/components/shell/Page"
import {
  ProjectHeader,
  ProjectHeaderActions
} from "@/features/projects/components/ProjectHeader"
import { TabsNav } from "@/features/projects/components/ProjectTabsNav"
import { useProject } from "@/features/projects/hooks/useProject"
import { useStickyBar } from "@/hooks/useStickyBar"

export function ProjectHeaderLayout() {
  const project = useProject()
  const tabsRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  useStickyBar(tabsRef, "--project-tabs-h")
  useActionsWidth(actionsRef)

  return (
    <>
      {/* Zero-height in flow (-mb cancels its height and the column gap), so
          the actions sit in the header row at rest. top-3.5 centres them on
          the pinned tabs row (pt-3 + 36px tabs, 32px actions). */}
      <div className="pointer-events-none sticky top-3.5 z-40 -mb-11 flex h-8 justify-end will-change-transform">
        <div ref={actionsRef} className="pointer-events-auto pl-3">
          <ProjectHeaderActions project={project} />
        </div>
      </div>
      <PageContainer>
        <ProjectHeader name={project.name} project={project} />
      </PageContainer>
      {/* Only top padding: the toolbar block below covers the gap under the
          tabs, so the create input's focus ring isn't painted over. */}
      <div
        ref={tabsRef}
        className="sticky top-0 z-30 -mt-3 pt-3 pr-(--project-actions-w,0px) will-change-transform data-stuck:bg-(--page-surface)"
      >
        <TabsNav project={project} />
      </div>
      <Outlet />
    </>
  )
}

/** Exposes the actions' width as `--project-actions-w`, so the header title
 *  and the tabs keep clear of them. */
function useActionsWidth(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const actions = ref.current
    const scope = actions?.parentElement?.parentElement
    if (!actions || !scope) return undefined
    const measure = () =>
      scope.style.setProperty("--project-actions-w", `${actions.offsetWidth}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(actions)
    return () => {
      observer.disconnect()
      scope.style.removeProperty("--project-actions-w")
    }
  }, [ref])
}
