import {
  useLayoutEffect,
  useRef,
  type AnchorHTMLAttributes,
  type ReactNode
} from "react"

import { useEditorServices } from "../services"
import { paintLinkFavicon } from "./link-favicon"
import { isBareUrlLabel } from "./link-preview-url"

type PreviewLinkProps = Readonly<
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
    url: string
    label: string | null
    children: ReactNode
  }
>

export function PreviewLink({
  href,
  url,
  label,
  children,
  ...rest
}: PreviewLinkProps) {
  const { title, favicon } = useEditorServices().useLinkPreview(url)
  const ref = useRef<HTMLAnchorElement>(null)

  useLayoutEffect(() => {
    if (ref.current !== null) paintLinkFavicon(ref.current, favicon, false)
  }, [favicon])

  const showTitle =
    title !== null && label !== null && isBareUrlLabel(label, href)

  return (
    <a ref={ref} href={href} title={showTitle ? href : undefined} {...rest}>
      {showTitle ? title : children}
    </a>
  )
}
