import * as DateTime from "effect/DateTime"

import { formatBytes } from "@/lib/formatBytes"
import { getLocale } from "@/paraglide/runtime"

export const formatNumber = (value: number) =>
  new Intl.NumberFormat(getLocale()).format(value)

export const formatCount = (value: number | undefined) =>
  value === undefined ? null : formatNumber(value)

export const formatDateTime = (value: DateTime.DateTime) =>
  new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(DateTime.toDate(value))

export const formatList = (values: ReadonlyArray<string>) =>
  new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(values)

export const formatFileSize = (bytes: number) => formatBytes(bytes, getLocale())
