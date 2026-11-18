import { Calendar, Info, ListTodo, Monitor, Moon, Sun } from "@pp/ui/icons"
import { SegmentedTabs, type SegmentedVariant } from "@pp/ui/segmented-tabs"
import { useState, type ReactNode } from "react"

function Row({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-6">
      <span className="text-caption text-muted-foreground">{caption}</span>
      <div className="flex items-center">{children}</div>
    </div>
  )
}

function Tabs<K extends string>({
  variant,
  items,
  initial,
  labels,
  label
}: Readonly<{
  variant: SegmentedVariant
  items: Parameters<typeof SegmentedTabs<K>>[0]["items"]
  initial: K
  labels?: "all" | "active"
  label: string
}>) {
  const [value, setValue] = useState<K>(initial)
  return (
    <SegmentedTabs
      variant={variant}
      items={items}
      value={value}
      onValueChange={setValue}
      labels={labels}
      aria-label={label}
    />
  )
}

export default function Overview() {
  return (
    <div className="grid w-full max-w-xl gap-6">
      <Row caption="Default">
        <Tabs
          variant="default"
          label="Project sections"
          initial="backlog"
          items={[
            { key: "backlog", label: "Backlog", icon: ListTodo, badge: 23 },
            { key: "sprints", label: "Sprints", icon: Calendar, badge: 0 },
            { key: "about", label: "About", icon: Info }
          ]}
        />
      </Row>
      <Row caption="Rail">
        <Tabs
          variant="rail"
          label="Feedback kind"
          initial="idea"
          items={[
            { key: "idea", label: "Idea" },
            { key: "bug", label: "Bug" },
            { key: "question", label: "Question" }
          ]}
        />
      </Row>
      <Row caption="Inline">
        <Tabs
          variant="inline"
          label="Source"
          initial="emoji"
          items={[
            { key: "emoji", label: "Emoji" },
            { key: "icon", label: "Icon" },
            { key: "upload", label: "Upload" }
          ]}
        />
      </Row>
      <Row caption="Subtle">
        <Tabs
          variant="subtle"
          label="Theme"
          initial="system"
          labels="active"
          items={[
            { key: "light", label: "Light", icon: Sun },
            { key: "system", label: "System", icon: Monitor },
            { key: "dark", label: "Dark", icon: Moon }
          ]}
        />
      </Row>
    </div>
  )
}
