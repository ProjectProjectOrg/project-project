import { Crumb } from "@/components/shell/crumb"

export const settingsPage = (heading: string, description: string) => ({
  crumb: Crumb.static({ label: heading }),
  page: { heading, description }
})
