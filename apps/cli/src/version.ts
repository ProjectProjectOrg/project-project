declare const PP_BUILD: string | undefined

export const buildVersion =
  typeof PP_BUILD === "string" ? PP_BUILD.replace(/^v/, "") : "dev"
