declare module "virtual:gallery-pages" {
  import type { PageMeta } from "./registry"

  const pages: ReadonlyArray<Readonly<{ slug: string; meta: PageMeta }>>
  export default pages
}
