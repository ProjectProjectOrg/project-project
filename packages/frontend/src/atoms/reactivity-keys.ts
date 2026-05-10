export const ReactivityKey = {
  auth: "auth",
  projects: "projects",
  tickets: "tickets",
  tags: "tags",
  comments: "comments",
  groups: "groups",
  github: "github"
} as const

export const authWriteKeys = [ReactivityKey.auth] as const

export const projectWriteKeys = [ReactivityKey.projects] as const

export const ticketWriteKeys = [ReactivityKey.tickets] as const

export const tagWriteKeys = [ReactivityKey.tags, ReactivityKey.tickets] as const

export const commentWriteKeys = [ReactivityKey.comments] as const

export const groupWriteKeys = [ReactivityKey.groups, ReactivityKey.tickets] as const

export const githubWriteKeys = [ReactivityKey.github, ReactivityKey.tickets] as const
