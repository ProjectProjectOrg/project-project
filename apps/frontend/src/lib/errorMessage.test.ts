import {
  Forbidden,
  InvalidBlocks,
  OAuthConsentRejected,
  InvalidRequest,
  NotFound,
  Unauthorized,
  UnknownType,
  LibraryConflict,
  LibraryContentRejected,
  StatusChangeRejected
} from "@pp/shared"
import { HttpClientError, TransportError } from "effect/http/HttpClientError"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import { describe, expect, it } from "vitest"

import {
  errorMessage,
  figmaStatusErrorMessage,
  oauthConsentErrorMessage,
  statusSaveErrorMessage
} from "./errorMessage"

describe("statusSaveErrorMessage", () => {
  it("maps a reserved-slug conflict to the reserved-name message", () => {
    expect(
      statusSaveErrorMessage(
        new StatusChangeRejected({ kind: "reserved_slug" })
      )
    ).toBe("That name is reserved by a built-in status.")
  })

  it("maps a duplicate-slug conflict to the already-exists message", () => {
    expect(
      statusSaveErrorMessage(new StatusChangeRejected({ kind: "slug_exists" }))
    ).toBe("A status with this name already exists.")
  })

  it("maps an invalid-label conflict to the invalid-name message", () => {
    expect(
      statusSaveErrorMessage(
        new StatusChangeRejected({ kind: "invalid_label" })
      )
    ).toBe("Pick a name with at least one letter or digit.")
  })

  it("falls back for a status rejection without its own message", () => {
    expect(
      statusSaveErrorMessage(
        new StatusChangeRejected({ kind: "baseline_order" })
      )
    ).toBe("Couldn't add this status. Try again.")
  })

  it("falls back for non-conflict errors", () => {
    expect(statusSaveErrorMessage(new Forbidden())).toBe(
      "Couldn't add this status. Try again."
    )
    expect(statusSaveErrorMessage(new NotFound())).toBe(
      "Couldn't add this status. Try again."
    )
  })
})

describe("figmaStatusErrorMessage", () => {
  it("maps persisted status keys through the localized error mapper", () => {
    expect(figmaStatusErrorMessage("figma_file_not_found")).toBe(
      "That Figma file no longer exists, or this connection cannot see it."
    )
    expect(figmaStatusErrorMessage("figma_unavailable")).toBe(
      "Figma could not be reached. Try again in a moment."
    )
  })
})

describe("oauthConsentErrorMessage", () => {
  it("explains how to recover from an invalid or expired consent link", () => {
    expect(oauthConsentErrorMessage(new OAuthConsentRejected())).toBe(
      "This authorization link has expired or is invalid. Start a new connection from your agent and try again."
    )
  })
  it("asks the user to sign in when their session has expired", () => {
    expect(oauthConsentErrorMessage(new Unauthorized())).toBe(
      "Your session has expired. Sign in again, then start a new connection from your agent."
    )
  })
  it("gives recovery instructions without exposing unexpected errors", () => {
    expect(
      oauthConsentErrorMessage(
        new HttpClientError({
          reason: new TransportError({
            request: HttpClientRequest.post("/api/oauthApplications/consent"),
            description: "private failure"
          })
        })
      )
    ).toBe(
      "Couldn’t complete authorization. Try again. If it keeps failing, start a new connection from your agent."
    )
  })
})

describe("library error messages", () => {
  it("maps library validation reasons and the key conflict", () => {
    expect(errorMessage(new LibraryConflict({ kind: "key_taken" }))).toBe(
      "That key is already used here. Pick another key."
    )
    expect(
      errorMessage(
        new LibraryContentRejected({ kind: "attachments_not_allowed" })
      )
    ).toBe(
      "Blocks and templates can't contain attachments yet. Remove the attachment and try again."
    )
    expect(
      errorMessage(new LibraryContentRejected({ kind: "blocks_not_allowed" }))
    ).toBe("A block can't contain other blocks.")
    expect(
      errorMessage(
        new InvalidBlocks({ code: "unclosed", line: 4, source: "<block>" })
      )
    ).toBe("The block opened on line 4 is never closed.")
    expect(errorMessage(new UnknownType({ key: "bug-report" }))).toBe(
      'The template "bug-report" doesn\'t exist anymore.'
    )
  })
})

describe("invalid request", () => {
  it("asks the user to refresh instead of reporting an unknown error", () => {
    expect(
      errorMessage(
        new InvalidRequest({ part: "payload", message: "Expected string" })
      )
    ).toBe(
      "The server couldn't read this request. Refresh the page and try again."
    )
  })
})
