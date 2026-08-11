// Polyfill Array.prototype.at for older mobile browsers (Safari < 15.4,
// older Android WebView) — marked@18 uses .at(-1) internally, which throws
// a TypeError without this, causing markdown highlighting to silently fail.
if (!Array.prototype.at) {
  Array.prototype.at = function (n: number) {
    const len = this.length;
    const i = n >= 0 ? n : len + n;
    return i >= 0 && i < len ? this[i] : undefined;
  };
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './jc_css_reset.css';
import './styling.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
