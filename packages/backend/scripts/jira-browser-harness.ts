export type JiraBrowserResources = Readonly<{
  databaseUrl: string
  s3Endpoint: string
  bucket: string
  hostname: string
}>

const loopbackHost = (hostname: string) =>
  hostname === "127.0.0.1" || hostname === "localhost"

export const assertBrowserResources = (resources: JiraBrowserResources) => {
  let database: URL
  let s3: URL
  try {
    database = new URL(resources.databaseUrl)
    s3 = new URL(resources.s3Endpoint)
  } catch {
    throw new Error("Invalid Jira browser resource URL")
  }
  if (
    database.protocol !== "postgres:" ||
    !loopbackHost(database.hostname) ||
    database.port !== "55432" ||
    database.pathname !== "/projectproject_effect_v4_t172_browser" ||
    database.search !== "" ||
    database.hash !== ""
  )
    throw new Error("Jira browser harness requires the isolated database")
  if (
    s3.protocol !== "http:" ||
    !loopbackHost(s3.hostname) ||
    s3.port !== "59000" ||
    s3.pathname !== "/" ||
    s3.search !== "" ||
    s3.hash !== "" ||
    s3.username !== "" ||
    s3.password !== "" ||
    resources.bucket !== "projectproject-t172-local-browser"
  )
    throw new Error("Jira browser harness requires the isolated bucket")
  if (!loopbackHost(resources.hostname))
    throw new Error("Jira browser harness must bind to loopback")
}
