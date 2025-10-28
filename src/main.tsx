import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './jc_css_reset.css';
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
