import { Button } from "@pp/ui/button"

const rows = [
  { name: "GitHub", detail: "Connected as acme-bot", action: "Disconnect" },
  { name: "Project icon", detail: "Dithered photo", action: "Change" },
  {
    name: "Slack channels",
    detail: "Last synced 2 minutes ago",
    action: "Refresh list"
  }
]

export default function SettingsGroup() {
  return (
    <div className="tertiary-tiles grid w-full max-w-md gap-0.5 rounded-2xl surface-1 p-1 corner-squircle">
      {rows.map((row) => (
        <div key={row.name} className="flex items-center gap-3 py-2 pr-2 pl-3">
          <div className="min-w-0 flex-1">
            <p className="text-body">{row.name}</p>
            <p className="text-caption text-muted-foreground">{row.detail}</p>
          </div>
          <Button variant="tertiary" size="sm">
            {row.action}
          </Button>
        </div>
      ))}
    </div>
  )
}
