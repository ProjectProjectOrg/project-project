import { describe, expect, it } from "vitest"

import { assertBrowserResources } from "../../scripts/jira-browser-harness"

const local = {
  databaseUrl:
    "postgres://projectproject:projectproject_dev@127.0.0.1:55432/projectproject_effect_v4_t172_browser",
  s3Endpoint: "http://127.0.0.1:59000",
  bucket: "projectproject-t172-local-browser",
  hostname: "127.0.0.1"
}

describe("Jira browser harness resource guard", () => {
  it("accepts only the dedicated loopback database and bucket", () => {
    expect(() => assertBrowserResources(local)).not.toThrow()
    expect(() =>
      assertBrowserResources({
        ...local,
        databaseUrl: local.databaseUrl.replace("127.0.0.1", "localhost"),
        s3Endpoint: "http://localhost:59000"
      })
    ).not.toThrow()
  })

  it.each([
    { databaseUrl: local.databaseUrl.replace("55432", "5432") },
    { databaseUrl: local.databaseUrl.replace("127.0.0.1", "db.example.com") },
    {
      databaseUrl: local.databaseUrl.replace(
        "projectproject_effect_v4_t172_browser",
        "projectproject"
      )
    },
    { databaseUrl: "not a url" },
    { s3Endpoint: "http://localhost:9000" },
    { s3Endpoint: "https://s3.example.com" },
    { s3Endpoint: "http://localhost:59000/other" },
    { bucket: "production-attachments" },
    { hostname: "0.0.0.0" }
  ])("rejects unrelated resources before setup: %j", (change) => {
    expect(() => assertBrowserResources({ ...local, ...change })).toThrow()
  })
})
