import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import FloatingIndicator from './components/FloatingIndicator'
import './index.css'

// Detect if this window is the floating indicator overlay
const isIndicator = new URLSearchParams(window.location.search).get('indicator') === 'true'

// Make the indicator window truly transparent (no white/dark box around rounded corners).
// Both html and body must have transparent backgrounds, and we need to remove any
// Tailwind bg classes that get applied via index.html or index.css.
if (isIndicator) {
  document.documentElement.setAttribute('data-indicator', 'true') // Opts out of bg-cd-bg in CSS
  document.documentElement.style.cssText = 'background: transparent !important; background-color: transparent !important;'
  document.body.style.cssText = 'background: transparent !important; background-color: transparent !important;'
  document.body.className = '' // Remove any bg classes from index.html
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isIndicator ? <FloatingIndicator /> : <App />}
  </React.StrictMode>
)
