import {
  type ProjectImport,
  ProjectIdentifierTaken,
  ProjectImportInvalid,
  ProjectImportStateConflict
} from "@pp/shared"
import * as Match from "effect/Match"
import * as Schema from "effect/Schema"

import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

type Integration = ProjectImport["integrations"][number]

const INTEGRATION_LABELS = {
  github: m.project_import_integration_github,
  everhour: m.project_import_integration_everhour,
  figma: m.project_import_integration_figma,
  slack: m.project_import_integration_slack
} satisfies Record<Integration, () => string>

export const integrationList = (integrations: ReadonlyArray<Integration>) =>
  new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(
    integrations.map((integration) => INTEGRATION_LABELS[integration]())
  )

const REASON_MESSAGES = {
  invalid_archive: m.project_import_error_invalid_archive,
  archive_too_large: m.project_import_error_archive_too_large,
  invalid_manifest: m.project_import_error_invalid_manifest,
  missing_manifest: m.project_import_error_invalid_manifest,
  manifest_must_come_first: m.project_import_error_invalid_manifest,
  entry_too_large: m.project_import_error_entry_too_large,
  markdown_too_large: m.project_import_error_entry_too_large,
  unexpected_attachment: m.project_import_error_unexpected_content,
  invalid_type_definition: m.project_import_error_unexpected_content,
  unexpected_entry: m.project_import_error_unexpected_content,
  unsafe_path: m.project_import_error_unexpected_content,
  attachment_size_mismatch: m.project_import_error_unexpected_content,
  upload_interrupted: m.project_import_error_upload_interrupted,
  linked_user_not_in_org: m.project_import_error_linked_user_not_in_org,
  project_key_taken: m.projects_create_key_taken_error,
  project_slug_taken: m.project_import_error_slug_taken,
  import_not_ready: m.project_import_error_not_ready,
  import_not_cancellable: m.project_import_error_not_cancellable,
  import_failed: m.project_import_failed_description
} satisfies Record<string, () => string>

const errorReason = Match.type<Readonly<{ _tag: string }>>().pipe(
  Match.when(
    Schema.is(Schema.Struct(ProjectImportInvalid.fields)),
    ({ kind }) => kind
  ),
  Match.when(
    Schema.is(Schema.Struct(ProjectImportStateConflict.fields)),
    ({ kind }) => `import_${kind}`
  ),
  Match.when(
    Schema.is(Schema.Struct(ProjectIdentifierTaken.fields)),
    ({ kind }) => `project_${kind}_taken`
  ),
  Match.orElse(() => null)
)

const isKnownReason = (
  reason: string
): reason is keyof typeof REASON_MESSAGES =>
  Object.hasOwn(REASON_MESSAGES, reason)

const reasonMessage = (reason: string) =>
  isKnownReason(reason) ? REASON_MESSAGES[reason]() : undefined

export const projectImportErrorMessage = (error: Readonly<{ _tag: string }>) =>
  importFailureReasonMessage(errorReason(error)) ?? errorMessage(error)

const importFailureReasonMessage = (reason: string | null) =>
  reason === null ? undefined : reasonMessage(reason)

export const importFailureMessage = (reason: string | null) =>
  importFailureReasonMessage(reason) ?? m.project_import_failed_description()
