import { defineConfig } from "@inlang/paraglide-js"

export default defineConfig({
  strategy: ["cookie", "preferredLanguage", "baseLocale"],
  cookieName: "pp_locale",
  cookieMaxAge: 60 * 60 * 24 * 365,
  emitTsDeclarations: true
})
