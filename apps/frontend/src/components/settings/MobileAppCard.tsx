import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { CopyButton } from "@/components/ui/copy-button"
import { m } from "@/paraglide/messages"

type MobileAppCardProps = Readonly<{ address: string }>

export function MobileAppCard({ address }: MobileAppCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.profile_mobile_app_title()}</CardTitle>
        <CardDescription>{m.profile_mobile_app_description()}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-[8rem_1fr] items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {m.profile_mobile_app_address_label()}
        </span>
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-xs">{address}</span>
          <CopyButton
            value={address}
            copyLabel={m.profile_mobile_app_copy_label()}
            copiedLabel={m.profile_mobile_app_copied_label()}
          />
        </div>
      </CardContent>
    </Card>
  )
}
