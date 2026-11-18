import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { Authentication } from "../auth/Authentication"
import { LinkPreview, LinkPreviewQuery } from "./LinkPreview"

export const LinkPreviewsGroup = HttpApiGroup.make("linkPreviews")
  .add(
    HttpApiEndpoint.get("get", "/link-previews", {
      query: LinkPreviewQuery,
      success: LinkPreview
    })
  )
  .middleware(Authentication)
