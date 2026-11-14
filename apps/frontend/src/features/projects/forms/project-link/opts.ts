import { ProjectLink } from "@pp/shared"
import * as Schema from "effect/Schema"

import { isLocalAddress, linkHost } from "@/features/projects/lib/projectLinks"
import { appFormOptions, validateAfterSubmit } from "@/lib/form"
import { m } from "@/paraglide/messages"

export type ProjectLinkValues = Readonly<{ label: string; url: string }>

const normalizeLinkUrl = (raw: string): string => {
  const url = raw.trim()
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(url)) return url
  return `${isLocalAddress(url) ? "http" : "https"}://${url}`
}

const isProjectLink = Schema.is(ProjectLink)

export const toProjectLink = (
  values: ProjectLinkValues
): ProjectLink | null => {
  const url = normalizeLinkUrl(values.url)
  if (!URL.canParse(url)) return null
  const link = { label: values.label.trim() || linkHost(url), url }
  return isProjectLink(link) ? link : null
}

const ProjectLinkForm = Schema.Struct({
  label: Schema.String,
  url: Schema.String
}).pipe(
  Schema.check(
    Schema.makeFilter((values) =>
      toProjectLink(values) === null
        ? { path: ["url"], issue: m.project_links_url_invalid() }
        : undefined
    )
  )
)

export const projectLinkFormOpts = (initial?: ProjectLink) =>
  appFormOptions({
    defaultValues: {
      label: initial?.label ?? "",
      url: initial?.url ?? ""
    } satisfies ProjectLinkValues,
    validators: [
      validateAfterSubmit(Schema.toStandardSchemaV1(ProjectLinkForm))
    ]
  })
