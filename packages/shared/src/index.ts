// Public surface of the @markmate/shared package.
//
// Re-export every value that the backend or frontend should be able to import.
// Right now there is nothing to re-export — Chapter 0's first job is to fill
// in `./api.ts` with an HttpApi definition and then wire it through here.

export * from "./api"
