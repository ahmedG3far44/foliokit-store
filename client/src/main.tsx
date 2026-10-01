import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { GoogleOAuthProvider } from '@react-oauth/google'

import './index.css'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const application = googleClientId ? <GoogleOAuthProvider clientId={googleClientId} locale="en"><App /></GoogleOAuthProvider> : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {application}
  </StrictMode>,
)
