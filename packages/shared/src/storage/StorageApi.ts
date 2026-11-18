import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import {
  ConnectStorageInput,
  OrgStorageStatus
} from "../attachments/Attachment"
import { Authentication } from "../auth/Authentication"
import {
  StorageAuthInvalid,
  StorageConfigMissing,
  StorageError
} from "../errors"
import { OrgPath } from "../http/paths"

export const StorageGroup = HttpApiGroup.make("storage")
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug/storage", {
      params: OrgPath,
      success: OrgStorageStatus
    }).annotate(RequiresOrg, "membership")
  )
  .add(
    HttpApiEndpoint.put("connect", "/orgs/:orgSlug/storage", {
      params: OrgPath,
      payload: ConnectStorageInput,
      success: OrgStorageStatus,
      error: [StorageAuthInvalid, StorageConfigMissing, StorageError]
    }).annotate(RequiresOrg, { storage: ["manage"] })
  )
  .add(
    HttpApiEndpoint.delete("disconnect", "/orgs/:orgSlug/storage", {
      params: OrgPath,
      success: OrgStorageStatus
    }).annotate(RequiresOrg, { storage: ["manage"] })
  )
  .middleware(OrgAccess)
  .middleware(Authentication)
