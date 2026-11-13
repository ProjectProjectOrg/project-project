import { Outlet, useLocation } from "@tanstack/react-router"

import { SettingsPage } from "@/components/shell/settings/SettingsPage"
import { PROFILE_SECTIONS } from "@/features/profile/lib/profileSections"

export function ProfileLayout() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const active =
    PROFILE_SECTIONS.find(
      (section) =>
        pathname === section.to || pathname.startsWith(`${section.to}/`)
    ) ?? PROFILE_SECTIONS[0]

  return (
    <SettingsPage heading={active.label} description={active.description}>
      <Outlet />
    </SettingsPage>
  )
}
