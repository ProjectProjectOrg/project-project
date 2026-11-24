import {
  useLayoutEffect,
  useRef,
  type AnchorHTMLAttributes,
  type ReactNode
} from "react"

import { useEditorServices } from "../services"
import { paintLinkFavicon, type LinkPreviewView } from "./link-favicon"
import { isBareUrlLabel } from "./link-preview-url"

type PreviewLinkProps = Readonly<
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
    url: string
    label: string | null
    children: ReactNode
  }
>

export function PreviewLink(props: PreviewLinkProps) {
  const { LinkPreview } = useEditorServices()
  return (
    <LinkPreview url={props.url}>
      {(preview) => <PreviewAnchor {...props} preview={preview} />}
    </LinkPreview>
  )
}

function PreviewAnchor({
  href,
  url: _url,
  preview: { title, favicon },
  label,
  children,
  ...rest
}: PreviewLinkProps & Readonly<{ preview: LinkPreviewView }>) {
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
