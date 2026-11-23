import { query } from "@/api/query"

export const instanceHealth = query("health", "get", {})

export const instanceChangelog = query("changelog", "get", {})
