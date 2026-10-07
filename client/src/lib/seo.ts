export const SITE_URL = 'https://foliokit.store'
export const HOME_TITLE = 'Folio Kit | Portfolio Templates for Designers & Developers'
export const HOME_DESCRIPTION = 'Discover production-ready portfolio templates for designers, developers, and creative studios. Customize clean source code and launch with a one-time purchase.'

const pages: Record<string, [string, string]> = {
  '/': [HOME_TITLE, HOME_DESCRIPTION],
  '/themes': ['Portfolio Templates & Themes | Folio Kit', 'Browse portfolio templates and themes for designers, developers, and studios. Find your visual direction, explore previews, and customize your portfolio.'],
  '/about': ['About Folio Kit | Portfolio Themes', 'Learn about Folio Kit and our approach to distinctive, production-ready portfolio themes for creative professionals.'],
  '/contact': ['Contact Folio Kit | Template Support', 'Contact Folio Kit for help with portfolio themes, purchases, downloads, and customization.'],
  '/privacy': ['Privacy Policy | Folio Kit', 'Read how Folio Kit handles your information and protects your privacy.'],
  '/terms': ['Terms of Service | Folio Kit', 'Read the terms for purchasing and using Folio Kit portfolio templates.'],
  '/refund': ['Refund Policy | Folio Kit', 'Read the Folio Kit refund policy for portfolio theme purchases.'],
}

export function pageSeo(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  const product = /^\/themes\/[^/]+$/.test(path)
  const metadata = pages[path] ?? (product
    ? ['Portfolio Template | Folio Kit', 'Explore this Folio Kit portfolio template, its features, and live preview.']
    : ['Your Account | Folio Kit', 'Manage your Folio Kit account and portfolio theme purchases.'])
  return { title: metadata[0], description: metadata[1], canonical: `${SITE_URL}${path === '/' ? '/' : path}`, index: Boolean(pages[path] || product) }
}
