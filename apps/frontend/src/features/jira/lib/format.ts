import * as DateTime from "effect/DateTime"

import { formatBytes } from "@/lib/formatBytes"
import { getLocale } from "@/paraglide/runtime"

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat(getLocale()).format(value)

export const formatCount = (value: number | undefined): string | null =>
  value === undefined ? null : formatNumber(value)

export const formatDateTime = (value: DateTime.DateTime): string =>
  new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(DateTime.toDate(value))

export const formatList = (values: ReadonlyArray<string>): string =>
  new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(values)

export const formatFileSize = (bytes: number): string =>
  formatBytes(bytes, getLocale())
