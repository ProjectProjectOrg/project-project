import { useAtomValue } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import { emailRequest, orgEmail } from "@/features/organizations/atoms/email"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { OrgEmailForm } from "@/forms/org-email"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/email")({
  component: EmailSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_email_heading() }
  })
})

function EmailSkeleton() {
  return <div className="h-32 max-w-xl animate-pulse rounded-lg bg-muted" />
}

function EmailSettings() {
  const { orgSlug } = Route.useParams()
  const orgResult = useAtomValue(orgDetail(orgRequest(orgSlug)))
  return Result.matchWithError(orgResult, {
    onInitial: () => <EmailSkeleton />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value: org }) =>
      org.role === "owner" || org.role === "admin" ? (
        <EmailConnection key={orgSlug} orgSlug={orgSlug} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {m.org_email_forbidden()}
        </p>
      )
  })
}

function EmailConnection({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const result = useAtomValue(orgEmail(emailRequest(orgSlug)))
  return Result.matchWithError(result, {
    onInitial: () => <EmailSkeleton />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value, waiting }) => (
      <OrgEmailForm orgSlug={orgSlug} status={value} waiting={waiting} />
    )
  })
}
