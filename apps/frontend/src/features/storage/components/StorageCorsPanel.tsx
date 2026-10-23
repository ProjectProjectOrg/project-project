import { useMemo, useState } from "react"

import { SettingsDisclosureItem } from "@/components/shell/settings/SettingsDisclosureItem"
import {
  SettingsGroup,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { CodeSnippet } from "@/components/ui/code-snippet"
import { m } from "@/paraglide/messages"

type CorsProvider = Readonly<{
  id: string
  label: string
  description: string
  language: "json" | "markup" | "bash"
  buildSnippet: (origin: string) => string
}>

const ALLOWED_HEADERS = ["content-type", "range"]

const EXPOSE_HEADERS = [
  "etag",
  "content-length",
  "content-range",
  "accept-ranges"
]

const MAX_AGE_SECONDS = 3600

const s3Policy = (origin: string) =>
  JSON.stringify(
    [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ["GET", "PUT", "HEAD"],
        AllowedHeaders: ALLOWED_HEADERS,
        ExposeHeaders: EXPOSE_HEADERS,
        MaxAgeSeconds: MAX_AGE_SECONDS
      }
    ],
    null,
    2
  )

const minioPolicy = (origin: string) =>
  [
    "<CORSConfiguration>",
    "  <CORSRule>",
    `    <AllowedOrigin>${origin}</AllowedOrigin>`,
    ...["GET", "PUT", "HEAD"].map(
      (method) => `    <AllowedMethod>${method}</AllowedMethod>`
    ),
    ...ALLOWED_HEADERS.map(
      (header) => `    <AllowedHeader>${header}</AllowedHeader>`
    ),
    ...EXPOSE_HEADERS.map(
      (header) => `    <ExposeHeader>${header}</ExposeHeader>`
    ),
    `    <MaxAgeSeconds>${MAX_AGE_SECONDS}</MaxAgeSeconds>`,
    "  </CORSRule>",
    "</CORSConfiguration>"
  ].join("\n")

const b2Policy = (origin: string) =>
  JSON.stringify(
    [
      {
        corsRuleName: "projectproject",
        allowedOrigins: [origin],
        allowedOperations: ["s3_get", "s3_head", "s3_put"],
        allowedHeaders: ALLOWED_HEADERS,
        exposeHeaders: EXPOSE_HEADERS,
        maxAgeSeconds: MAX_AGE_SECONDS
      }
    ],
    null,
    2
  )

const genericPolicy = () =>
  [
    "aws s3api put-bucket-cors \\",
    "  --endpoint-url https://<your-endpoint> \\",
    "  --bucket <your-bucket> \\",
    "  --cors-configuration file://cors.json"
  ].join("\n")

export function StorageCorsPanel() {
  const origin = useMemo(() => {
    if (typeof window === "undefined")
      return "https://your-instance.example.com"
    return window.location.origin
  }, [])

  const providers = useMemo<ReadonlyArray<CorsProvider>>(
    () => [
      {
        id: "r2",
        label: m.storage_cors_r2_label(),
        description: m.storage_cors_r2_description(),
        language: "json",
        buildSnippet: s3Policy
      },
      {
        id: "s3",
        label: m.storage_cors_s3_label(),
        description: m.storage_cors_s3_description(),
        language: "json",
        buildSnippet: s3Policy
      },
      {
        id: "minio",
        label: m.storage_cors_minio_label(),
        description: m.storage_cors_minio_description(),
        language: "markup",
        buildSnippet: minioPolicy
      },
      {
        id: "b2",
        label: m.storage_cors_b2_label(),
        description: m.storage_cors_b2_description(),
        language: "json",
        buildSnippet: b2Policy
      },
      {
        id: "other",
        label: m.storage_cors_other_label(),
        description: m.storage_cors_other_description(),
        language: "bash",
        buildSnippet: genericPolicy
      }
    ],
    []
  )

  const [openId, setOpenId] = useState<string | null>("r2")

  return (
    <SettingsSection
      title={m.storage_cors_heading()}
      description={m.storage_cors_notice()}
    >
      <SettingsGroup>
        {providers.map((provider) => (
          <ProviderItem
            key={provider.id}
            provider={provider}
            origin={origin}
            open={openId === provider.id}
            onToggle={() =>
              setOpenId((current) =>
                current === provider.id ? null : provider.id
              )
            }
          />
        ))}
      </SettingsGroup>
      <p className="px-0.5 text-xs text-muted-foreground">
        {m.storage_cors_caveat()}
      </p>
    </SettingsSection>
  )
}

function ProviderItem({
  provider,
  origin,
  open,
  onToggle
}: {
  provider: CorsProvider
  origin: string
  open: boolean
  onToggle: () => void
}) {
  const snippet = useMemo(
    () => provider.buildSnippet(origin),
    [provider, origin]
  )

  return (
    <SettingsDisclosureItem
      label={provider.label}
      open={open}
      onToggle={onToggle}
    >
      <p className="text-xs text-muted-foreground">{provider.description}</p>
      <CodeSnippet code={snippet} language={provider.language} />
    </SettingsDisclosureItem>
  )
}
