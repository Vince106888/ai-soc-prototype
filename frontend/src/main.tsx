import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './AuthGate'
import { applyStoredTheme } from './ui/theme'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/shell.css'
import './styles/pages.css'

applyStoredTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
