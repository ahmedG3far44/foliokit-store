import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App.tsx'

import './index.css'


const root = document.getElementById('root')!
const tree = <StrictMode><App /></StrictMode>
if (root.dataset.prerendered === window.location.pathname) hydrateRoot(root, tree)
else createRoot(root).render(tree)
