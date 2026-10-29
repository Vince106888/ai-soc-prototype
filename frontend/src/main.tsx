import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/source-sans-3'
import '@fontsource-variable/lexend'
import App from './AuthGate'
import './styles.css'
import './console.css'
import './onboarding.css'
import './product.css'
import './redesign.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
