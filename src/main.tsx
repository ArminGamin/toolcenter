import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { installBusinessProfileFetch } from './lib/business-profiles'
import { initializeAppearance } from './lib/appearance'
import { installSettingsCache } from './lib/settings-cache'

installSettingsCache()
installBusinessProfileFetch()
initializeAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
