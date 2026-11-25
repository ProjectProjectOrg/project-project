import * as DateTime from "effect/DateTime"

import { formatBytes } from "@/lib/formatBytes"
import { perLocale } from "@/lib/perLocale"
import { getLocale } from "@/paraglide/runtime"

const numbers = perLocale(Intl.NumberFormat)
const dates = perLocale(Intl.DateTimeFormat, {
  dateStyle: "medium",
  timeStyle: "short"
})
const lists = perLocale(Intl.ListFormat, { type: "conjunction" })

export const formatNumber = (value: number) =>
  numbers(getLocale()).format(value)

export const formatCount = (value: number | undefined) =>
  value === undefined ? null : formatNumber(value)

export const formatDateTime = (value: DateTime.DateTime) =>
  dates(getLocale()).format(DateTime.toDate(value))

export const formatList = (values: ReadonlyArray<string>) =>
  lists(getLocale()).format(values)

export const formatFileSize = (bytes: number) => formatBytes(bytes, getLocale())
