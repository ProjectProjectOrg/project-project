import type { AttachmentSort, AttachmentStatus } from "@projectproject/shared"

export interface OrgAttachmentsQuery {
  readonly orgSlug: string
  readonly status?: AttachmentStatus
  readonly projectSlug?: string
  readonly sort?: AttachmentSort
  readonly pages: number
}

export const orgAttachmentsKey = (query: OrgAttachmentsQuery): string =>
  JSON.stringify([
    query.orgSlug,
    query.status ?? null,
    query.projectSlug ?? null,
    query.sort ?? null,
    query.pages
  ])

export const splitOrgAttachmentsKey = (key: string): OrgAttachmentsQuery => {
  const [orgSlug, status, projectSlug, sort, pages] = JSON.parse(key) as [
    string,
    AttachmentStatus | null,
    string | null,
    AttachmentSort | null,
    number
  ]
  return {
    orgSlug,
    ...(status === null ? {} : { status }),
    ...(projectSlug === null ? {} : { projectSlug }),
    ...(sort === null ? {} : { sort }),
    pages
  }
}
