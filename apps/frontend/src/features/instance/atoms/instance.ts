import { query } from "@/api/query"

export const instanceHealth = query("health", "get", {
  timeToLive: "1 minute"
})

export const instanceChangelog = query("changelog", "get", {
  timeToLive: "10 minutes"
})
