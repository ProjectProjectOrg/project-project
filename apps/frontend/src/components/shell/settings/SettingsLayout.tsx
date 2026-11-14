import { Outlet, useMatches } from "@tanstack/react-router"

import { PageHeader } from "@/components/shell/Page"

export const settingsPage = (heading: string, description: string) => ({
  crumb: { type: "static" as const, label: heading },
  page: { heading, description }
})

export function SettingsLayout() {
  const page = useMatches({
    select: (matches) =>
      matches
        .flatMap(({ loaderData }) =>
          loaderData && "page" in loaderData ? [loaderData.page] : []
        )
        .at(-1)
  })
  return (
    <div className="pp-context-in mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      {page ? (
        <PageHeader>
          <h1>{page.heading}</h1>
          <p>{page.description}</p>
        </PageHeader>
      ) : null}
      <div className="flex w-full flex-col gap-8">
        <Outlet />
      </div>
    </div>
  )
}
