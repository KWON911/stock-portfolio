import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthGate } from './components/AuthGate'
import './styles.css'
import './quote-status.css'
import './market.css'
import './transactions.css'
import './opening.css'
import './aggregate.css'
import './mobile.css'
import './app-shell.css'
import './treemap.css'
import './treemap-gutter.css'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>
)
