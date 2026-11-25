import { perLocale } from "@/lib/perLocale"

export const shortUnitList = perLocale(Intl.ListFormat, {
  style: "short",
  type: "unit"
})
