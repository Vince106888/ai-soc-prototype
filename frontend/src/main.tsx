import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import App from './AuthGate'
import './design/tokens.css'
import './design/base.css'
import './design/components.css'
import './design/layout.css'
import './design/pages.css'
import './design/welcome.css'

async function start() {
  // Visual-review mock: development server only, never part of a production bundle.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('mock')) {
    const { installMockApi } = await import('./devMock')
    installMockApi()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
