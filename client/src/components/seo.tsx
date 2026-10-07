import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { pageSeo } from '../lib/seo'

export function Seo({ title, description }: { title?: string; description?: string }) {
  const { pathname } = useLocation()
  useEffect(() => {
    const seo = pageSeo(pathname)
    document.title = title ?? seo.title
    const meta = (attribute: 'name' | 'property', key: string, content: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
      if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.appendChild(element) }
      element.content = content
    }
    meta('name', 'description', description ?? seo.description)
    meta('name', 'robots', seo.index ? 'index, follow' : 'noindex, follow')
    meta('property', 'og:title', title ?? seo.title)
    meta('property', 'og:description', description ?? seo.description)
    meta('property', 'og:url', seo.canonical)
    meta('name', 'twitter:title', title ?? seo.title)
    meta('name', 'twitter:description', description ?? seo.description)
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical) }
    canonical.href = seo.canonical
  }, [pathname, title, description])
  return null
}
