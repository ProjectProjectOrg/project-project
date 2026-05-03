import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { meAtom } from "@/atoms/auth"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { PageContainer, PageHeader } from "@/components/page"

export const Route = createFileRoute("/_authed/profile")({ component: Profile })

function Profile() {
  const me = useAtomValue(meAtom)
  if (!Result.isSuccess(me)) return null
  const user = me.value

  return (
    <PageContainer>
      <PageHeader>
        <h1>Profile</h1>
        <p>Account details and security settings.</p>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>From your GitHub identity.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          <Row label="User ID" value={user.id} mono />
          <Row label="Joined" value={user.createdAt.toLocaleDateString()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Passkeys and two-factor will live here once Better Auth's plugins
            are wired up.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Nothing to configure yet.
        </CardContent>
      </Card>
    </PageContainer>
  )
}

function Row({
  label,
  value,
  mono
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  )
}
