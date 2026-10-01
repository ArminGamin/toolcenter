import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { installBusinessProfileFetch } from './lib/business-profiles'
import { initializeAppearance } from './lib/appearance'

installBusinessProfileFetch()
initializeAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
