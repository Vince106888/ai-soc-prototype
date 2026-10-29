import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './AuthGate'
import './styles.css'
import './console.css'
import './onboarding.css'
import './product.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
