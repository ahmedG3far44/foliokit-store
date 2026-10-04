const measurementId = import.meta.env.VITE_GOOGLE_ANALYTICS_ID?.trim()

type GtagCommand = [command: 'js', date: Date] | [command: 'config' | 'event', target: string, parameters?: Record<string, unknown>]

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: GtagCommand) => void
  }
}

let initialized = false
let lastPageLocation = ''

export function initializeGoogleAnalytics(): boolean {
  if (!measurementId || !/^G-[A-Z0-9]+$/i.test(measurementId)) return false
  if (initialized) return true

  window.dataLayer = window.dataLayer || []
  window.gtag = (...args: GtagCommand) => window.dataLayer.push(args)
  window.gtag('js', new Date())
  window.gtag('config', measurementId, { send_page_view: false })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  document.head.appendChild(script)

  initialized = true
  return true
}

export function trackPageView(path: string): void {
  if (!initializeGoogleAnalytics()) return

  const pageLocation = new URL(path, window.location.origin).href
  if (pageLocation === lastPageLocation) return

  window.gtag('event', 'page_view', {
    page_location: pageLocation,
    page_path: path,
    page_referrer: lastPageLocation || document.referrer,
    page_title: document.title,
  })
  lastPageLocation = pageLocation
}
