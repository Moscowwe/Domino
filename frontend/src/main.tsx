import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setupClientEngine } from './utils/clientEngine'

// Enable in-browser client domino engine for Vercel / offline play
setupClientEngine()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

