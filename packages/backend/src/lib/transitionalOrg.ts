// T-02 → T-05 transitional shim. Project-scoped HttpApi paths still expose
// the legacy `/projects/:slug/...` shape (no org segment), but the services
// underneath now require an `orgSlug`. Until T-05 introduces the
// `/orgs/:orgSlug/...` URL pattern + `currentOrg` resolver middleware, every
// handler reads this constant and passes it through. After T-05 ships, this
// file is deleted and callsites read from `currentOrg` instead.
export const TRANSITIONAL_ORG_SLUG = "project-project"
