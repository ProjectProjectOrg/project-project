const worker = process.env.BUN_TEST_WORKER_ID
const database = process.env.PROJECTPROJECT_TEST_DATABASE_URL
if (database && worker) {
  const url = new URL(database)
  url.pathname = `${url.pathname}_w${worker}`
  process.env.PROJECTPROJECT_TEST_DATABASE_URL = url.toString()
}
if (process.env.CI && !database)
  throw new Error("CI must set PROJECTPROJECT_TEST_DATABASE_URL")

process.env.ENTITY_MESSAGE_POLL_INTERVAL ??= "100 millis"
process.env.REFRESH_ASSIGNMENTS_INTERVAL ??= "100 millis"
