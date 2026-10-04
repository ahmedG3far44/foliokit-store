import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import { trackPageView } from '../lib/google-analytics'

export function GoogleAnalytics() {
  const location = useLocation()

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}${location.hash}`)
  }, [location.hash, location.pathname, location.search])

  return null
}
