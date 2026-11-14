import { Select, SelectTrigger } from "@pp/ui/select"
import { FolderIcon } from "lucide-react"
import { type ComponentProps, type ReactNode, useState } from "react"

const USER_TOGGLES = new Set(["trigger-press", "escape-key"])

const PROJECTS = [
  { value: "all", label: "All projects", separated: true },
  { value: "website", label: "Website" },
  { value: "mobile", label: "Mobile app" },
  { value: "design", label: "Design system" },
  { value: "archived", label: "Archived", disabled: true }
] as const

type Project = (typeof PROJECTS)[number]["value"]

const LABELS: Record<Project, string> = {
  all: "All projects",
  website: "Website",
  mobile: "Mobile app",
  design: "Design system",
  archived: "Archived"
}

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3">
      <div className="grid h-9 w-full grid-cols-[minmax(0,1fr)] place-items-center">
        {children}
      </div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

function Closed({
  label,
  size,
  disabled,
  ...trigger
}: Readonly<
  {
    label: string
    size?: "default" | "compact"
    disabled?: boolean
  } & Omit<ComponentProps<typeof SelectTrigger>, "size" | "disabled">
>) {
  return (
    <Select
      items={PROJECTS}
      defaultValue="website"
      size={size}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={label}
        size={size}
        selectedLabel={LABELS.website}
        {...trigger}
      />
    </Select>
  )
}

// Top: one live select, open, so the chosen row's radio dot and the sliding
// highlight are in view. Below: the trigger in every state, one row per look.
export default function Overview() {
  const [open, setOpen] = useState(true)
  const [value, setValue] = useState<Project>("website")

  return (
    <div className="@container flex w-full flex-col gap-8">
      <div className="flex h-60 justify-center">
        <Select
          items={PROJECTS}
          value={value}
          onValueChange={setValue}
          open={open}
          onOpenChange={(next, details) => {
            if (USER_TOGGLES.has(details.reason)) setOpen(next)
          }}
        >
          <SelectTrigger
            aria-label="Project"
            selectedLabel={LABELS[value]}
            className="w-56"
          />
        </Select>
      </div>
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] justify-items-center gap-x-4 gap-y-6 @2xl:grid-cols-[repeat(5,minmax(0,1fr))]">
        <Cell caption="Default">
          <Closed label="Default" className="w-full min-w-0" />
        </Cell>
        <Cell caption="Hover">
          <Closed label="Hover" data-force="hover" className="w-full min-w-0" />
        </Cell>
        <Cell caption="Focus">
          <Closed label="Focus" data-force="focus" className="w-full min-w-0" />
        </Cell>
        <Cell caption="Invalid">
          <Closed label="Invalid" aria-invalid className="w-full min-w-0" />
        </Cell>
        <Cell caption="Disabled">
          <Closed label="Disabled" disabled className="w-full min-w-0" />
        </Cell>
        <Cell caption="Compact">
          <Closed label="Compact" size="compact" className="w-full min-w-0" />
        </Cell>
        <Cell caption="Compact hover">
          <Closed
            label="Compact hover"
            size="compact"
            data-force="hover"
            className="w-full min-w-0"
          />
        </Cell>
        <Cell caption="Borderless">
          <Closed
            label="Borderless"
            variant="borderless"
            className="w-full min-w-0"
          />
        </Cell>
        <Cell caption="With icon">
          <Closed
            label="With icon"
            icon={FolderIcon}
            className="w-full min-w-0"
          />
        </Cell>
        <Cell caption="Placeholder">
          <Select items={PROJECTS}>
            <SelectTrigger
              aria-label="Placeholder"
              placeholder="Pick a project"
              className="w-full min-w-0"
            />
          </Select>
        </Cell>
      </div>
    </div>
  )
}
