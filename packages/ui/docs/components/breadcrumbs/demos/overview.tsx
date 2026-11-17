import { BreadcrumbItem, Breadcrumbs } from "@pp/ui/breadcrumbs"
import type { ComponentProps, ReactNode } from "react"

// The demo's links are buttons, so clicking one doesn't leave the page.
const link = (props: ComponentProps<"button">) => (
  <button type="button" {...props} />
)

function Row({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 gap-1 @xl:grid-cols-[10rem_minmax(0,1fr)] @xl:items-center @xl:gap-4">
      <span className="text-caption text-muted-foreground">{caption}</span>
      <div className="flex h-8 min-w-0 items-center">{children}</div>
    </div>
  )
}

// Every state of the trail, one per row.
export default function Overview() {
  return (
    <div className="@container grid w-full gap-4">
      <Row caption="The page alone">
        <Breadcrumbs label="Breadcrumb">
          <BreadcrumbItem key="dashboard" label="Dashboard" />
        </Breadcrumbs>
      </Row>
      <Row caption="Trail and page">
        <Breadcrumbs label="Breadcrumb">
          <BreadcrumbItem key="projects" label="Projects" render={link} />
          <BreadcrumbItem key="project" label="Billing Platform" />
        </Breadcrumbs>
      </Row>
      <Row caption="Ticket">
        <Breadcrumbs label="Breadcrumb">
          <BreadcrumbItem key="projects" label="Projects" render={link} />
          <BreadcrumbItem
            key="project"
            label="Atlas Mobile App"
            render={link}
          />
          <BreadcrumbItem
            key="ticket"
            prefix="ATL-10"
            label="Skip onboarding for invited users"
          />
        </Breadcrumbs>
      </Row>
      <Row caption="Sub-ticket">
        <Breadcrumbs label="Breadcrumb">
          <BreadcrumbItem key="projects" label="Projects" render={link} />
          <BreadcrumbItem
            key="project"
            label="Atlas Mobile App"
            render={link}
          />
          <BreadcrumbItem
            key="parent"
            prefix="ATL-3"
            detail="Sync conflict resolution"
            render={link}
          />
          <BreadcrumbItem
            key="ticket"
            prefix="ATL-12"
            label="Merge offline edits"
          />
        </Breadcrumbs>
      </Row>
      <Row caption="Hover">
        <Breadcrumbs label="Breadcrumb">
          <BreadcrumbItem
            key="projects"
            label="Projects"
            render={(props) => (
              <button type="button" data-force="hover" {...props} />
            )}
          />
          <BreadcrumbItem key="project" label="Billing Platform" />
        </Breadcrumbs>
      </Row>
      <Row caption="Focus">
        <Breadcrumbs label="Breadcrumb">
          <BreadcrumbItem
            key="projects"
            label="Projects"
            render={(props) => (
              <button type="button" data-force="focus" {...props} />
            )}
          />
          <BreadcrumbItem key="project" label="Billing Platform" />
        </Breadcrumbs>
      </Row>
      <Row caption="Loading">
        <Breadcrumbs label="Breadcrumb">
          <BreadcrumbItem key="projects" label="Projects" render={link} />
          <BreadcrumbItem
            key="project"
            label={null}
            loadingWidth="14ch"
            loadingLabel="Loading project"
          />
        </Breadcrumbs>
      </Row>
    </div>
  )
}
