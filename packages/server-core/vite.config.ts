import { defineConfig } from "vitest/config"

const isolatedTests = [
  "src/activity/TicketActivityLive.postgres.test.ts",
  "src/comments/CommentsLive.test.ts",
  "src/email/OrgEmail.test.ts",
  "src/figma/FigmaIntegrationsLive.test.ts",
  "src/figma/FigmaLinksLive.test.ts",
  "src/markdown/fileContent.test.ts",
  "src/storage/SecretCrypto.test.ts",
  "src/tickets/TicketIndexLive.postgres.test.ts"
]

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "server-core",
    projects: [
      {
        test: {
          name: "shared",
          include: ["src/**/*.test.ts"],
          exclude: isolatedTests,
          environment: "node",
          isolate: false
        }
      },
      {
        test: {
          name: "isolated",
          include: isolatedTests,
          environment: "node",
          isolate: true
        }
      }
    ]
  }
})
