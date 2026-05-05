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
import { MemberAvatar } from "@/components/MemberAvatar"
import { PageContainer, PageHeader } from "@/components/page"

export const Route = createFileRoute("/_authed/profile")({
  component: Profile,
  loader: () => ({
    crumb: { type: "static" as const, label: "Profile", to: "/profile" }
  })
})

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
        <CardContent className="flex flex-col gap-5">
          {
            /* Identity hero — avatar + name + the @username/email pair, same
              treatment as a member row in the project members tab so the
              "this is you" view reads like the "this is them" views. */
          }
          <div className="flex items-center gap-4">
            <MemberAvatar member={user} size={64} />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-lg font-semibold">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {user.username && (
                  <>
                    <span className="font-mono">@{user.username}</span>
                    <span className="mx-1.5">·</span>
                  </>
                )}
                {user.email}
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-t border-border pt-4 text-sm">
            <Row label="User ID" value={user.id} mono />
            <Row label="Joined" value={user.createdAt.toLocaleDateString()} />
          </div>
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
