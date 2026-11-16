import {
  Gauge,
  Plug,
  Settings,
  Tag,
  TriangleAlert,
  Users,
  Workflow,
  type IconType
} from "@pp/ui/icons"
import {
  SidebarBack,
  SidebarPanelBody,
  SidebarPanelHeader,
  SidebarRow
} from "@pp/ui/sidebar"

import { SETTINGS, type SettingsSection } from "../data"

const ICONS: Readonly<Record<SettingsSection, IconType>> = {
  general: Settings,
  members: Users,
  workflow: Workflow,
  tags: Tag,
  estimation: Gauge,
  github: Plug,
  danger: TriangleAlert
}

// A sub-page: the back link, its own header, its own rows. The rail keeps
// the project active underneath.
export function SettingsPanel({
  projectName,
  section,
  onBack,
  onPick
}: Readonly<{
  projectName: string
  section: string | undefined
  onBack: () => void
  onPick: (id: SettingsSection) => void
}>) {
  return (
    <>
      <SidebarBack label={projectName} onClick={onBack} />
      <SidebarPanelHeader title="Settings" subtitle={projectName} />
      <SidebarPanelBody label="Settings">
        {SETTINGS.map(([id, label]) => {
          const Icon = ICONS[id]
          return (
            <SidebarRow
              key={id}
              icon={<Icon />}
              label={label}
              active={section === id}
              onClick={() => onPick(id)}
            />
          )
        })}
      </SidebarPanelBody>
    </>
  )
}
